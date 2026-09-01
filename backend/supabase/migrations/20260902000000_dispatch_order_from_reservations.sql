-- SILSANPLEX: despacho comercial atomico desde reservas persistentes.
-- No crea tablas: reutiliza inventory_reservations, el ledger inmutable y
-- audit_events como registro de idempotencia.

-- El origen comercial se distingue de las salidas FEFO manuales. source_id
-- apunta directamente a order_items para conservar la trazabilidad de cada
-- linea, mientras reservation_id conserva el bucket/lote consumido.
alter table public.inventory_movements
  drop constraint if exists inventory_movements_source_valid;

alter table public.inventory_movements
  add constraint inventory_movements_source_valid
  check (source_type in (
    'manual', 'purchase-receipt', 'warehouse-transfer', 'stock-reclassification',
    'supplier-return', 'repair-consumption', 'fefo-outbound', 'order-dispatch'
  ));

create index if not exists inventory_movements_order_dispatch_idx
  on public.inventory_movements (organization_id, source_type, source_id, created_at, id)
  where source_type = 'order-dispatch';

create index if not exists audit_events_order_dispatch_operation_idx
  on public.audit_events (
    organization_id,
    action,
    (metadata ->> 'operation_key'),
    entity_id
  )
  where action = 'ORDER_DISPATCHED';

create or replace function public.dispatch_order_from_reservations(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid;
  order_id uuid;
  operation_key uuid;
  requested_sale_id uuid;
  operation_date_value date;
  order_row public.orders%rowtype;
  sale_row public.sales%rowtype;
  order_item_row public.order_items%rowtype;
  sale_item_row public.sale_items%rowtype;
  reservation_row public.inventory_reservations%rowtype;
  existing_audit public.audit_events%rowtype;
  conflicting_audit public.audit_events%rowtype;
  item jsonb;
  requested_order_item_id uuid;
  requested_quantity numeric;
  remaining_to_dispatch numeric;
  pending_quantity numeric;
  allocation_quantity numeric;
  bucket_state record;
  warehouse_row public.warehouses%rowtype;
  movement_id uuid;
  movement_ids jsonb := '[]'::jsonb;
  allocations jsonb := '[]'::jsonb;
  complete_order boolean := false;
  reason_value text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_DISPATCH_PAYLOAD_INVALID';
  end if;

  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  order_id := nullif(payload ->> 'order_id', '')::uuid;
  requested_sale_id := nullif(payload ->> 'sale_id', '')::uuid;
  operation_key := nullif(payload ->> 'operation_key', '')::uuid;
  operation_date_value := coalesce(nullif(payload ->> 'operation_date', '')::date, current_date);

  if organization_id is null or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'ORDER_DISPATCH_FORBIDDEN';
  end if;
  if order_id is null or operation_key is null then
    raise exception using errcode = '22023', message = 'ORDER_DISPATCH_KEYS_REQUIRED';
  end if;
  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'ORDER_DISPATCH_ITEMS_REQUIRED';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(payload -> 'items') dispatch_item
    group by dispatch_item ->> 'order_item_id'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'ORDER_DISPATCH_DUPLICATE_ITEM';
  end if;

  -- Serializa reintentos de la misma clave y evita que otra operacion
  -- comercial reutilice accidentalmente el mismo idempotency key.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text || ':order-operation:' || operation_key::text, 0
  ));

  select audit.*
    into existing_audit
  from public.audit_events audit
  where audit.organization_id = organization_id
    and audit.action = 'ORDER_DISPATCHED'
    and audit.entity_type = 'order'
    and audit.entity_id = order_id::text
    and audit.metadata ->> 'operation_key' = operation_key::text
  order by audit.id desc
  limit 1
  for update;

  if existing_audit.id is not null then
    if existing_audit.metadata -> 'requested_items' is distinct from payload -> 'items' then
      raise exception using errcode = 'P0001', message = 'ORDER_OPERATION_KEY_REUSED';
    end if;
    return order_id;
  end if;

  select audit.*
    into conflicting_audit
  from public.audit_events audit
  where audit.organization_id = organization_id
    and audit.metadata ->> 'operation_key' = operation_key::text
    and audit.action in ('ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_CANCELLED', 'ORDER_DISPATCHED')
    and not (audit.action = 'ORDER_DISPATCHED' and audit.entity_id = order_id::text)
  order by audit.id desc
  limit 1;
  if conflicting_audit.id is not null then
    raise exception using errcode = 'P0001', message = 'ORDER_OPERATION_KEY_REUSED';
  end if;

  -- El pedido es el primer recurso comercial bloqueado. create_sale_from_order
  -- tambien bloquea este registro antes de crear la venta.
  select order_data.*
    into order_row
  from public.orders order_data
  where order_data.organization_id = organization_id
    and order_data.id = order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_DISPATCH_ORDER_NOT_FOUND';
  end if;
  if order_row.status <> 'confirmado' or order_row.warehouse_id is null then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_DISPATCHABLE';
  end if;

  select sale_data.*
    into sale_row
  from public.sales sale_data
  where sale_data.organization_id = organization_id
    and sale_data.order_id = order_id
    and (requested_sale_id is null or sale_data.id = requested_sale_id)
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_SALE_REQUIRED';
  end if;
  if sale_row.status <> 'registrada' then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_DISPATCHABLE';
  end if;

  select warehouse.*
    into warehouse_row
  from public.warehouses warehouse
  where warehouse.organization_id = organization_id
    and warehouse.id = order_row.warehouse_id
    and warehouse.is_active
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_WAREHOUSE_UNAVAILABLE';
  end if;

  -- Bloquea todas las lineas y scopes de producto/almacen en orden estable,
  -- incluso cuando el despacho solo contiene un subconjunto de lineas.
  for order_item_row in
    select item.*
    from public.order_items item
    where item.organization_id = organization_id
      and item.order_id = order_id
    order by item.product_id, item.id
    for update
  loop
    perform public.lock_inventory_fefo_scope(
      organization_id, order_item_row.product_id, order_row.warehouse_id
    );
  end loop;

  -- Validacion de identidad y cantidades antes de tocar reservas. Las lineas
  -- de venta son la interfaz comercial; el consumo siempre termina en la
  -- order_item persistente vinculada por FK.
  for item in select value from jsonb_array_elements(payload -> 'items')
  loop
    requested_order_item_id := nullif(item ->> 'order_item_id', '')::uuid;
    requested_quantity := (item ->> 'quantity')::numeric;
    if requested_order_item_id is null
       or requested_quantity is null
       or requested_quantity <= 0
       or (item ? 'quantity') is not true then
      raise exception using errcode = '22023', message = 'ORDER_DISPATCH_QUANTITY_INVALID';
    end if;

    select sale_item.*
      into sale_item_row
    from public.sale_items sale_item
    where sale_item.organization_id = organization_id
      and sale_item.sale_id = sale_row.id
      and sale_item.order_item_id = requested_order_item_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_ITEM_INVALID';
    end if;
    select item.*
      into order_item_row
    from public.order_items item
    where item.organization_id = organization_id
      and item.order_id = order_id
      and item.id = requested_order_item_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_ITEM_INVALID';
    end if;
    if sale_item_row.product_id is distinct from order_item_row.product_id
       or sale_item_row.quantity is distinct from order_item_row.quantity then
      raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_ITEM_INVALID';
    end if;

    -- Los scopes ya estan bloqueados. Esta suma se calcula antes de insertar
    -- movimientos y por tanto no puede cambiar por otra reserva concurrente.
    select coalesce(sum(reservation.quantity - reservation.quantity_consumed), 0)
      into pending_quantity
    from public.inventory_reservations reservation
    where reservation.organization_id = organization_id
      and reservation.source_type = 'order-item'
      and reservation.source_id = requested_order_item_id
      and reservation.status = 'active';
    if requested_quantity > pending_quantity then
      raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_EXCEEDS_RESERVED';
    end if;
    if exists (
      select 1
      from public.inventory_reservations reservation
      where reservation.organization_id = organization_id
        and reservation.source_type = 'order-item'
        and reservation.source_id = requested_order_item_id
        and reservation.status = 'active'
        and (
          reservation.product_id is distinct from order_item_row.product_id
          or reservation.warehouse_id is distinct from order_row.warehouse_id
          or reservation.stock_status <> 'available'
          or (reservation.expiration_date is not null and reservation.expiration_date < current_date)
        )
    ) then
      raise exception using errcode = 'P0001', message = 'ORDER_RESERVATION_STATE_INVALID';
    end if;
  end loop;

  -- Consumo exacto de las filas reservadas en el mismo orden FEFO usado al
  -- reservar. El movimiento se inserta primero: el trigger de inventario ve la
  -- reserva activa y valida fisico, saldo pendiente y reservas de terceros.
  for item in select value from jsonb_array_elements(payload -> 'items')
  loop
    requested_order_item_id := nullif(item ->> 'order_item_id', '')::uuid;
    remaining_to_dispatch := (item ->> 'quantity')::numeric;

    select order_item.*
      into order_item_row
    from public.order_items order_item
    where order_item.organization_id = organization_id
      and order_item.id = requested_order_item_id
      and order_item.order_id = order_id;

    for reservation_row in
      select reservation.*
      from public.inventory_reservations reservation
      where reservation.organization_id = organization_id
        and reservation.source_type = 'order-item'
        and reservation.source_id = requested_order_item_id
        and reservation.status = 'active'
      order by reservation.expiration_date asc nulls last,
        lower(coalesce(reservation.lot, '')) asc,
        reservation.location_id,
        reservation.id
      for update
    loop
      exit when remaining_to_dispatch <= 0;
      pending_quantity := reservation_row.quantity - reservation_row.quantity_consumed;
      if pending_quantity <= 0 then
        continue;
      end if;
      allocation_quantity := least(remaining_to_dispatch, pending_quantity);

      select state.*
        into bucket_state
      from public.inventory_bucket_state(
        organization_id, order_item_row.product_id, order_row.warehouse_id,
        reservation_row.location_id, reservation_row.stock_status,
        reservation_row.lot, reservation_row.expiration_date
      ) state;

      movement_id := gen_random_uuid();
      reason_value := 'Despacho venta ' || sale_row.internal_number || ' · ' || order_row.order_number;
      insert into public.inventory_movements (
        id, organization_id, product_id, product_code, product_description,
        unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
        location_id, stock_status, unit_cost, lot, expiration_date,
        operation_date, reason, source_type, source_id, reservation_id,
        created_by
      ) values (
        movement_id, organization_id, order_item_row.product_id,
        order_item_row.product_code, order_item_row.product_description,
        order_item_row.unit_of_measure, 'salida', allocation_quantity,
        warehouse_row.name, order_row.warehouse_id, reservation_row.location_id,
        reservation_row.stock_status, greatest(coalesce(bucket_state.average_cost, 0), 0),
        reservation_row.lot, reservation_row.expiration_date,
        operation_date_value, reason_value, 'order-dispatch', requested_order_item_id,
        reservation_row.id, actor_id
      );

      update public.inventory_reservations
      set quantity_consumed = reservation_row.quantity_consumed + allocation_quantity,
          status = case
            when reservation_row.quantity_consumed + allocation_quantity = reservation_row.quantity
              then 'consumed'
            else 'active'
          end,
          updated_by = actor_id,
          updated_at = now()
      where organization_id = reservation_row.organization_id
        and id = reservation_row.id;

      movement_ids := movement_ids || jsonb_build_array(movement_id::text);
      allocations := allocations || jsonb_build_array(jsonb_build_object(
        'order_item_id', requested_order_item_id,
        'reservation_id', reservation_row.id,
        'movement_id', movement_id,
        'quantity', allocation_quantity,
        'lot', reservation_row.lot,
        'expiration_date', reservation_row.expiration_date
      ));
      remaining_to_dispatch := remaining_to_dispatch - allocation_quantity;
    end loop;

    if remaining_to_dispatch > 0 then
      raise exception using errcode = 'P0001', message = 'ORDER_DISPATCH_EXCEEDS_RESERVED';
    end if;
  end loop;

  -- Solo se completa la venta cuando todas las lineas tienen reservas
  -- historicamente asignadas y ya no queda saldo pendiente. No se introducen
  -- estados nuevos: confirmado/registrada representa el parcial.
  if not exists (
    select 1
    from public.order_items item
    where item.organization_id = organization_id
      and item.order_id = order_id
      and coalesce((
        select sum(reservation.quantity)
        from public.inventory_reservations reservation
        where reservation.organization_id = organization_id
          and reservation.source_type = 'order-item'
          and reservation.source_id = item.id
          and reservation.status in ('active', 'consumed')
      ), 0) < item.quantity
  ) and not exists (
    select 1
    from public.inventory_reservations reservation
    join public.order_items item
      on item.organization_id = reservation.organization_id
     and item.id = reservation.source_id
     and item.order_id = order_id
    where reservation.organization_id = organization_id
      and reservation.source_type = 'order-item'
      and reservation.status = 'active'
      and reservation.quantity_consumed < reservation.quantity
  ) then
    complete_order := true;
  end if;

  if complete_order then
    update public.sales
    set status = 'despachada', updated_by = actor_id, updated_at = now()
    where organization_id = organization_id and id = sale_row.id;
    update public.orders
    set status = 'atendido', updated_by = actor_id, updated_at = now()
    where organization_id = organization_id and id = order_id;
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    organization_id, actor_id, 'ORDER_DISPATCHED', 'order', order_id::text,
    jsonb_build_object('order_status', order_row.status, 'sale_status', sale_row.status),
    jsonb_build_object(
      'order_status', case when complete_order then 'atendido' else order_row.status end,
      'sale_status', case when complete_order then 'despachada' else sale_row.status end,
      'sale_id', sale_row.id,
      'complete', complete_order
    ),
    jsonb_build_object(
      'source', 'database_function',
      'operation_key', operation_key,
      'requested_items', payload -> 'items',
      'movement_ids', movement_ids,
      'allocations', allocations,
      'operation_date', operation_date_value
    )
  );

  return order_id;
exception
  when unique_violation then
    -- La unicidad de audit_events no es necesaria para la operacion normal,
    -- pero si una instalacion antigua la tuviera, un retry conserva el mismo
    -- contrato idempotente.
    select audit.entity_id::uuid
      into order_id
    from public.audit_events audit
    where audit.organization_id = organization_id
      and audit.action = 'ORDER_DISPATCHED'
      and audit.metadata ->> 'operation_key' = operation_key::text
    order by audit.id desc
    limit 1;
    if order_id is not null then return order_id; end if;
    raise;
end;
$$;

revoke all on function public.dispatch_order_from_reservations(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dispatch_order_from_reservations(jsonb) to authenticated;

comment on function public.dispatch_order_from_reservations(jsonb) is
  'Despacha parcial o totalmente una venta consumiendo exactamente las reservas order-item; crea salidas FEFO por bucket y actualiza Kardex en una transaccion.';
