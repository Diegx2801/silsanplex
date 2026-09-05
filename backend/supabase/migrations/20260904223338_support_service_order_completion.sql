-- P1A-2: servicios comerciales sin reservas ni consumo de inventario.
-- Conserva wrappers de autorizacion, locks e idempotencia existentes.
begin;

create or replace function public.update_order_quantities_unchecked(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_organization_id uuid;
  target_order_id uuid;
  target_operation_key uuid;
  order_row public.orders%rowtype;
  order_item_row public.order_items%rowtype;
  line jsonb;
  requested_quantity numeric;
  current_reserved numeric;
  item_product_type text;
  target_delta numeric;
  prior_operation_exists boolean;
  prior_operation_other_order boolean;
  old_items jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_order_id := nullif(payload ->> 'order_id', '')::uuid;
  target_operation_key := nullif(payload ->> 'operation_key', '')::uuid;

  if target_organization_id is null
     or not public.is_organization_member(target_organization_id) then
    raise exception using errcode = '42501', message = 'ORDER_FORBIDDEN';
  end if;
  if target_order_id is null then
    raise exception using errcode = '22023', message = 'ORDER_ID_REQUIRED';
  end if;
  if target_operation_key is null then
    raise exception using errcode = '22023', message = 'ORDER_OPERATION_KEY_REQUIRED';
  end if;
  if jsonb_typeof(payload -> 'items') <> 'array'
     or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'ORDER_ITEMS_REQUIRED';
  end if;

  -- Serializa retries y permite reutilizar audit_events como registro
  -- persistente de idempotencia sin crear una tabla paralela.
  -- La misma clave serializa cualquier operación comercial del pedido
  -- (modificación o cancelación). Así un retry no puede cruzarse con la
  -- operación opuesta usando la misma operation_key.
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_organization_id::text || ':order-operation:' || target_operation_key::text, 0));

  select exists (
    select 1
    from public.audit_events audit_event
    where audit_event.organization_id = target_organization_id
      and audit_event.entity_type = 'order'
      and audit_event.action = 'ORDER_UPDATED'
      and audit_event.metadata ->> 'operation_key' = target_operation_key::text
  )
    into prior_operation_exists;
  select exists (
    select 1
    from public.audit_events audit_event
    where audit_event.organization_id = target_organization_id
      and audit_event.entity_type = 'order'
      and audit_event.action in ('ORDER_UPDATED', 'ORDER_CANCELLED')
      and audit_event.metadata ->> 'operation_key' = target_operation_key::text
      and audit_event.entity_id is distinct from target_order_id::text
  )
    into prior_operation_other_order;
  if prior_operation_other_order then
    raise exception using errcode = '23505', message = 'ORDER_OPERATION_KEY_REUSED';
  end if;
  if exists (
    select 1
    from public.audit_events audit_event
    where audit_event.organization_id = target_organization_id
      and audit_event.entity_type = 'order'
      and audit_event.action = 'ORDER_CANCELLED'
      and audit_event.entity_id = target_order_id::text
      and audit_event.metadata ->> 'operation_key' = target_operation_key::text
  ) then
    raise exception using errcode = '23505', message = 'ORDER_OPERATION_KEY_REUSED';
  end if;
  if prior_operation_exists then
    return target_order_id;
  end if;

  select order_value.*
    into order_row
  from public.orders order_value
  where order_value.organization_id = target_organization_id
    and order_value.id = target_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
  end if;
  if order_row.status <> 'confirmado' then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_MODIFIABLE';
  end if;
  if exists (
    select 1
    from public.sales sale
    where sale.organization_id = target_organization_id
      and sale.order_id = target_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_MODIFIABLE';
  end if;
  if order_row.warehouse_id is null then
    raise exception using errcode = 'P0001', message = 'ORDER_WAREHOUSE_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(payload -> 'items') item
    group by item ->> 'order_item_id'
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'ORDER_DUPLICATE_ITEM';
  end if;

  for line in select value from jsonb_array_elements(payload -> 'items')
  loop
    if nullif(line ->> 'order_item_id', '') is null
       or nullif(line ->> 'quantity', '') is null
       or lower(line ->> 'quantity') in ('nan', 'infinity', '-infinity') then
      raise exception using errcode = '22023', message = 'ORDER_ITEM_VALUES_INVALID';
    end if;
    requested_quantity := (line ->> 'quantity')::numeric;
    if requested_quantity is null or requested_quantity <= 0 then
      raise exception using errcode = '22023', message = 'ORDER_ITEM_VALUES_INVALID';
    end if;
    perform 1
    from public.order_items item
    where item.organization_id = target_organization_id
      and item.order_id = target_order_id
      and item.id = (line ->> 'order_item_id')::uuid;
    if not found then
      raise exception using errcode = 'P0001', message = 'ORDER_ITEM_NOT_FOUND';
    end if;
  end loop;

  if jsonb_array_length(payload -> 'items') <> (
    select count(*)
    from public.order_items item
    where item.organization_id = target_organization_id
      and item.order_id = target_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'ORDER_ITEMS_MISMATCH';
  end if;

  -- Bloquea todos los productos en orden estable antes de leer disponibilidad
  -- o cambiar reservas. Asi dos pedidos no pueden sobrerreservar un bucket.
  for order_item_row in
    select item.*
    from public.order_items item
    where item.organization_id = target_organization_id
      and item.order_id = target_order_id
    order by item.product_id, item.id
    for update
  loop
    select product.product_type into item_product_type
    from public.products product
    where product.organization_id = target_organization_id
      and product.id = order_item_row.product_id
    for share;
    if item_product_type = 'service' then
      continue;
    end if;
    perform public.lock_inventory_fefo_scope(
      target_organization_id,
      order_item_row.product_id,
      order_row.warehouse_id
    );
  end loop;

  -- Una linea confirmada debe conservar la correspondencia exacta entre su
  -- cantidad solicitada y sus reservas activas antes de poder modificarse.
  for order_item_row in
    select item.*
    from public.order_items item
    where item.organization_id = target_organization_id
      and item.order_id = target_order_id
    order by item.product_id, item.id
  loop
    if exists (
      select 1 from public.products product
      where product.organization_id = target_organization_id
        and product.id = order_item_row.product_id
        and product.product_type = 'service'
    ) then
      continue;
    end if;

    select coalesce(sum(reservation.quantity - reservation.quantity_consumed), 0)
      into current_reserved
    from public.inventory_reservations reservation
    where reservation.organization_id = target_organization_id
      and reservation.source_type = 'order-item'
      and reservation.source_id = order_item_row.id
      and reservation.status = 'active';

    if current_reserved <> order_item_row.quantity
       or exists (
         select 1
         from public.inventory_reservations reservation
         where reservation.organization_id = target_organization_id
           and reservation.source_type = 'order-item'
           and reservation.source_id = order_item_row.id
           and reservation.quantity_consumed <> 0
       )
       or exists (
         select 1
         from public.inventory_reservations reservation
         where reservation.organization_id = target_organization_id
           and reservation.source_type = 'order-item'
           and reservation.source_id = order_item_row.id
           and reservation.status = 'active'
           and reservation.product_id is distinct from order_item_row.product_id
       )
       or exists (
         select 1
         from public.inventory_reservations reservation
         where reservation.organization_id = target_organization_id
           and reservation.source_type = 'order-item'
           and reservation.source_id = order_item_row.id
           and reservation.status = 'active'
           and reservation.stock_status <> 'available'
       )
       or exists (
         select 1
         from public.inventory_reservations reservation
         where reservation.organization_id = target_organization_id
           and reservation.source_type = 'order-item'
           and reservation.source_id = order_item_row.id
           and reservation.status = 'active'
           and reservation.warehouse_id is distinct from order_row.warehouse_id
       ) then
      raise exception using errcode = 'P0001', message = 'ORDER_RESERVATION_STATE_INVALID';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_item_id', item.id,
    'quantity', item.quantity
  ) order by item.product_id, item.id), '[]'::jsonb)
    into old_items
  from public.order_items item
  where item.organization_id = target_organization_id
    and item.order_id = target_order_id;

  for order_item_row in
    select item.*
    from public.order_items item
    where item.organization_id = target_organization_id
      and item.order_id = target_order_id
    order by item.product_id, item.id
  loop
    select (line_data ->> 'quantity')::numeric
      into requested_quantity
    from jsonb_array_elements(payload -> 'items') line_data
    where (line_data ->> 'order_item_id')::uuid = order_item_row.id;

    target_delta := requested_quantity - order_item_row.quantity;
    select product.product_type into item_product_type
    from public.products product
    where product.organization_id = target_organization_id
      and product.id = order_item_row.product_id;

    if item_product_type = 'good' and target_delta < 0 then
      perform public.release_order_item_reservation_quantity(
        target_organization_id,
        order_item_row.id,
        order_row.warehouse_id,
        abs(target_delta),
        actor_id
      );
    elsif item_product_type = 'good' and target_delta > 0 then
      perform public.reserve_order_item_fefo_quantity(
        target_organization_id,
        order_item_row.id,
        order_row.warehouse_id,
        target_delta,
        actor_id
      );
    end if;

    if target_delta <> 0 then
      update public.order_items
      set quantity = requested_quantity
      where organization_id = target_organization_id
        and id = order_item_row.id;
    end if;
  end loop;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    metadata
  ) values (
    target_organization_id,
    actor_id,
    'ORDER_UPDATED',
    'order',
    target_order_id::text,
    jsonb_build_object('items', old_items),
    jsonb_build_object('items', payload -> 'items'),
    jsonb_build_object(
      'source', 'database_function',
      'operation_key', target_operation_key,
      'reservation_change', true
    )
  );

  return target_order_id;
end;
$$;

revoke all on function public.update_order_quantities_unchecked(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.dispatch_order_from_reservations_unchecked(payload jsonb)
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
  item_product_type text;
  completed_services jsonb := '[]'::jsonb;
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
    select product.product_type into item_product_type
    from public.products product
    where product.organization_id = organization_id
      and product.id = order_item_row.product_id
    for share;
    if item_product_type = 'service' then
      continue;
    end if;
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
       or requested_quantity::text in ('NaN', 'Infinity', '-Infinity')
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

    select product.product_type into item_product_type
    from public.products product
    where product.organization_id = organization_id
      and product.id = order_item_row.product_id;
    if item_product_type = 'service' then
      -- La cantidad comercial se atiende completa al cerrar el pedido.
      -- Nunca se simula una reserva ni un despacho parcial de servicio.
      if requested_quantity <> order_item_row.quantity then
        raise exception using errcode = '22023', message = 'ORDER_SERVICE_COMPLETION_QUANTITY_INVALID';
      end if;
      continue;
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

    if exists (
      select 1 from public.products product
      where product.organization_id = organization_id
        and product.id = order_item_row.product_id
        and product.product_type = 'service'
    ) then
      continue;
    end if;

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

  -- Solo los bienes exigen reservas consumidas. Los servicios se atienden
  -- comercialmente junto con el cierre, sin crear registros de inventario.
  -- Un pedido solo de servicios se completa en esta misma confirmacion.
  if not exists (
    select 1
    from public.order_items item
    where item.organization_id = organization_id
      and item.order_id = order_id
      and exists (
        select 1 from public.products product
        where product.organization_id = item.organization_id
          and product.id = item.product_id
          and product.product_type = 'good'
      )
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
    select coalesce(jsonb_agg(jsonb_build_object(
      'order_item_id', item.id, 'product_id', item.product_id,
      'quantity', item.quantity
    ) order by item.id), '[]'::jsonb)
    into completed_services
    from public.order_items item
    join public.products product
      on product.organization_id = item.organization_id and product.id = item.product_id
    where item.organization_id = organization_id and item.order_id = order_id
      and product.product_type = 'service';

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
      'completed_services', completed_services,
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

revoke all on function public.dispatch_order_from_reservations_unchecked(jsonb)
  from public, anon, authenticated, service_role;

commit;
