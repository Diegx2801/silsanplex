-- SILSANPLEX: modifica y libera reservas comerciales de pedidos.
-- Esta migracion no despacha, no consume reservas y no genera movimientos.

-- ---------------------------------------------------------------------------
-- 1. Indice de busqueda para reintentos comerciales auditados
-- ---------------------------------------------------------------------------

create index if not exists audit_events_order_operation_idx
  on public.audit_events (
    organization_id,
    entity_id,
    action,
    (metadata ->> 'operation_key')
  )
  where entity_type = 'order'
    and action in ('ORDER_UPDATED', 'ORDER_CANCELLED');

-- Al ampliar una reserva existente, el estado del bucket todavia incluye la
-- cantidad anterior de esa misma fila. El trigger debe validar solo el delta
-- nuevo (la reserva propia ya ocupa el saldo anterior), sin debilitar la
-- validacion completa para inserciones, reactivaciones o cambios de bucket.
create or replace function public.enforce_inventory_reservation_fefo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_remaining numeric;
  new_remaining numeric;
  same_bucket boolean := false;
  required_increment numeric;
begin
  if new.status <> 'active' or new.stock_status <> 'available' then
    return new;
  end if;

  new_remaining := new.quantity - new.quantity_consumed;
  if tg_op = 'UPDATE' then
    old_remaining := old.quantity - old.quantity_consumed;
    same_bucket := old.status = 'active'
      and new.product_id = old.product_id
      and new.warehouse_id = old.warehouse_id
      and new.location_id = old.location_id
      and new.stock_status = old.stock_status
      and lower(coalesce(new.lot, '')) = lower(coalesce(old.lot, ''))
      and new.expiration_date is not distinct from old.expiration_date;
    if same_bucket and new_remaining <= old_remaining then
      return new;
    end if;
  end if;

  perform public.lock_inventory_bucket(
    new.organization_id, new.product_id, new.warehouse_id, new.location_id,
    new.stock_status, new.lot, new.expiration_date
  );
  perform public.assert_inventory_fefo_bucket(
    new.organization_id, new.product_id, new.warehouse_id, new.expiration_date
  );

  required_increment := case when same_bucket then new_remaining - old_remaining else new_remaining end;
  if required_increment > coalesce((
    select state.assignable_quantity
    from public.inventory_bucket_state(
      new.organization_id, new.product_id, new.warehouse_id, new.location_id,
      new.stock_status, new.lot, new.expiration_date
    ) state
  ), 0) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_RESERVED_STOCK';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_inventory_reservation_fefo()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Asignacion FEFO reutilizable para incrementos
-- ---------------------------------------------------------------------------

create or replace function public.reserve_order_item_fefo_quantity(
  requested_organization_id uuid,
  requested_order_item_id uuid,
  requested_warehouse_id uuid,
  requested_quantity numeric,
  requested_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_item_row public.order_items%rowtype;
  allocation_row record;
  existing_reservation public.inventory_reservations%rowtype;
  normalized_lot text;
begin
  if requested_actor_id is null
     or requested_actor_id is distinct from (select auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'AUTHENTICATION_REQUIRED';
  end if;
  if requested_organization_id is null
     or not public.is_organization_member(requested_organization_id) then
    raise exception using
      errcode = '42501',
      message = 'ORDER_FORBIDDEN';
  end if;
  if requested_quantity is null or requested_quantity <= 0 then
    raise exception using
      errcode = '22023',
      message = 'ORDER_RESERVATION_QUANTITY_INVALID';
  end if;

  select item.*
    into order_item_row
  from public.order_items item
  join public.orders order_row
    on order_row.organization_id = item.organization_id
   and order_row.id = item.order_id
  where item.organization_id = requested_organization_id
    and item.id = requested_order_item_id
    and order_row.warehouse_id = requested_warehouse_id
    and order_row.status = 'confirmado'
  for update of item;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEM_RESERVATION_SOURCE_INVALID';
  end if;

  perform public.lock_inventory_fefo_scope(
    requested_organization_id,
    order_item_row.product_id,
    requested_warehouse_id
  );

  -- El planificador canonico calcula solo el delta solicitado. La busqueda
  -- de una fila existente incluye reservas liberadas: el indice comercial
  -- impide duplicar el bucket y la fila puede reactivarse de forma segura.
  for allocation_row in
    select allocation.*
    from public.inventory_fefo_allocation_plan(
      requested_organization_id,
      order_item_row.product_id,
      requested_warehouse_id,
      requested_quantity,
      null
    ) allocation
    order by allocation.allocation_order
  loop
    normalized_lot := nullif(btrim(allocation_row.lot), '');

    select reservation.*
      into existing_reservation
    from public.inventory_reservations reservation
    where reservation.organization_id = requested_organization_id
      and reservation.source_type = 'order-item'
      and reservation.source_id = requested_order_item_id
      and reservation.product_id = order_item_row.product_id
      and reservation.warehouse_id = requested_warehouse_id
      and reservation.location_id = allocation_row.location_id
      and reservation.stock_status = 'available'
      and lower(coalesce(reservation.lot, '')) = lower(coalesce(normalized_lot, ''))
      and reservation.expiration_date is not distinct from allocation_row.expiration_date
    for update;

    if found then
      if existing_reservation.status = 'consumed'
         or existing_reservation.quantity_consumed <> 0 then
        raise exception using
          errcode = 'P0001',
          message = 'ORDER_RESERVATION_STATE_INVALID';
      end if;

      update public.inventory_reservations
      set quantity = case
            when existing_reservation.status = 'released'
              then allocation_row.allocation_quantity
            else existing_reservation.quantity + allocation_row.allocation_quantity
          end,
          status = 'active',
          updated_by = requested_actor_id,
          updated_at = now()
      where organization_id = existing_reservation.organization_id
        and id = existing_reservation.id;
    else
      insert into public.inventory_reservations (
        organization_id,
        product_id,
        warehouse_id,
        location_id,
        stock_status,
        lot,
        expiration_date,
        quantity,
        quantity_consumed,
        status,
        source_type,
        source_id,
        created_by,
        updated_by
      ) values (
        requested_organization_id,
        order_item_row.product_id,
        requested_warehouse_id,
        allocation_row.location_id,
        'available',
        normalized_lot,
        allocation_row.expiration_date,
        allocation_row.allocation_quantity,
        0,
        'active',
        'order-item',
        requested_order_item_id,
        requested_actor_id,
        requested_actor_id
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.reserve_order_item_fefo_quantity(uuid, uuid, uuid, numeric, uuid)
  from public, anon, authenticated, service_role;

comment on function public.reserve_order_item_fefo_quantity(uuid, uuid, uuid, numeric, uuid) is
  'Reserva un delta de una linea de pedido con FEFO; fusiona el mismo bucket sin duplicarlo.';

-- La primitiva existente de create_order conserva su contrato y ahora delega
-- en el helper de cantidad para compartir exactamente la misma logica.
create or replace function public.reserve_order_item_fefo(
  requested_organization_id uuid,
  requested_order_item_id uuid,
  requested_warehouse_id uuid,
  requested_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_order_item_quantity numeric;
begin
  select item.quantity
    into requested_order_item_quantity
  from public.order_items item
  where item.organization_id = requested_organization_id
    and item.id = requested_order_item_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEM_RESERVATION_SOURCE_INVALID';
  end if;

  perform public.reserve_order_item_fefo_quantity(
    requested_organization_id,
    requested_order_item_id,
    requested_warehouse_id,
    requested_order_item_quantity,
    requested_actor_id
  );
end;
$$;

revoke all on function public.reserve_order_item_fefo(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Liberacion parcial por linea (reverse-FEFO)
-- ---------------------------------------------------------------------------

create or replace function public.release_order_item_reservation_quantity(
  requested_organization_id uuid,
  requested_order_item_id uuid,
  requested_warehouse_id uuid,
  requested_quantity numeric,
  requested_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_item_row public.order_items%rowtype;
  reservation_row public.inventory_reservations%rowtype;
  remaining_to_release numeric := requested_quantity;
  available_reserved numeric;
  release_quantity numeric;
begin
  if requested_actor_id is null
     or requested_actor_id is distinct from (select auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'AUTHENTICATION_REQUIRED';
  end if;
  if requested_organization_id is null
     or not public.is_organization_member(requested_organization_id) then
    raise exception using
      errcode = '42501',
      message = 'ORDER_FORBIDDEN';
  end if;
  if requested_quantity is null or requested_quantity <= 0 then
    raise exception using
      errcode = '22023',
      message = 'ORDER_RESERVATION_QUANTITY_INVALID';
  end if;

  select item.*
    into order_item_row
  from public.order_items item
  join public.orders order_row
    on order_row.organization_id = item.organization_id
   and order_row.id = item.order_id
  where item.organization_id = requested_organization_id
    and item.id = requested_order_item_id
    and order_row.warehouse_id = requested_warehouse_id
    and order_row.status = 'confirmado'
  for update of item;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEM_RESERVATION_SOURCE_INVALID';
  end if;

  perform public.lock_inventory_fefo_scope(
    requested_organization_id,
    order_item_row.product_id,
    requested_warehouse_id
  );

  -- Se libera desde el lote que vence mas tarde para conservar la asignacion
  -- FEFO original en la reserva que permanece activa.
  for reservation_row in
    select reservation.*
    from public.inventory_reservations reservation
    where reservation.organization_id = requested_organization_id
      and reservation.source_type = 'order-item'
      and reservation.source_id = requested_order_item_id
      and reservation.status = 'active'
    order by reservation.expiration_date desc nulls first,
      lower(coalesce(reservation.lot, '')) desc,
      reservation.location_id desc,
      reservation.id desc
    for update
  loop
    exit when remaining_to_release <= 0;
    available_reserved := reservation_row.quantity - reservation_row.quantity_consumed;
    if available_reserved <= 0 then
      continue;
    end if;

    release_quantity := least(available_reserved, remaining_to_release);
    if release_quantity >= available_reserved then
      update public.inventory_reservations
      set status = 'released',
          updated_by = requested_actor_id,
          updated_at = now()
      where organization_id = reservation_row.organization_id
        and id = reservation_row.id;
    else
      update public.inventory_reservations
      set quantity = reservation_row.quantity - release_quantity,
          updated_by = requested_actor_id,
          updated_at = now()
      where organization_id = reservation_row.organization_id
        and id = reservation_row.id;
    end if;
    remaining_to_release := remaining_to_release - release_quantity;
  end loop;

  if remaining_to_release > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_RESERVATION_STATE_INVALID';
  end if;
end;
$$;

revoke all on function public.release_order_item_reservation_quantity(uuid, uuid, uuid, numeric, uuid)
  from public, anon, authenticated, service_role;

comment on function public.release_order_item_reservation_quantity(uuid, uuid, uuid, numeric, uuid) is
  'Libera una cantidad de una linea de pedido desde los buckets menos prioritarios; no genera movimientos.';

-- ---------------------------------------------------------------------------
-- 4. Modificacion atomica de cantidades del pedido
-- ---------------------------------------------------------------------------

create or replace function public.update_order_quantities(payload jsonb)
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
    if target_delta < 0 then
      perform public.release_order_item_reservation_quantity(
        target_organization_id,
        order_item_row.id,
        order_row.warehouse_id,
        abs(target_delta),
        actor_id
      );
    elsif target_delta > 0 then
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

revoke all on function public.update_order_quantities(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.update_order_quantities(jsonb) to authenticated;

comment on function public.update_order_quantities(jsonb) is
  'Modifica todas las cantidades de un pedido confirmado y ajusta sus reservas FEFO atomically.';

-- ---------------------------------------------------------------------------
-- 5. Cancelacion atomica e idempotente
-- ---------------------------------------------------------------------------

create or replace function public.cancel_order(payload jsonb)
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
  active_reservation_count bigint;
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

  -- Compartir el lock con update_order_quantities evita que una misma
  -- operation_key pueda confirmar dos operaciones distintas en paralelo.
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_organization_id::text || ':order-operation:' || target_operation_key::text, 0));

  if exists (
    select 1
    from public.audit_events audit_event
    where audit_event.organization_id = target_organization_id
      and audit_event.entity_type = 'order'
      and audit_event.action in ('ORDER_UPDATED', 'ORDER_CANCELLED')
      and audit_event.metadata ->> 'operation_key' = target_operation_key::text
      and audit_event.entity_id is distinct from target_order_id::text
  ) then
    raise exception using errcode = '23505', message = 'ORDER_OPERATION_KEY_REUSED';
  end if;
  if exists (
    select 1
    from public.audit_events audit_event
    where audit_event.organization_id = target_organization_id
      and audit_event.entity_type = 'order'
      and audit_event.action = 'ORDER_UPDATED'
      and audit_event.entity_id = target_order_id::text
      and audit_event.metadata ->> 'operation_key' = target_operation_key::text
  ) then
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
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_CANCELLABLE';
  end if;
  if exists (
    select 1
    from public.sales sale
    where sale.organization_id = target_organization_id
      and sale.order_id = target_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_CANCELLABLE';
  end if;

  -- Adquiere los scopes antes de inspeccionar reservas. Así una salida o
  -- consumo concurrente que respete el lock FEFO no puede cambiar
  -- quantity_consumed entre la validación y la liberación.
  for order_item_row in
    select item.*
    from public.order_items item
    where item.organization_id = target_organization_id
      and item.order_id = target_order_id
    order by item.product_id, item.id
    for update
  loop
    if order_row.warehouse_id is not null then
      perform public.lock_inventory_fefo_scope(
        target_organization_id,
        order_item_row.product_id,
        order_row.warehouse_id
      );
    end if;
  end loop;

  select count(*)
    into active_reservation_count
  from public.inventory_reservations reservation
  join public.order_items item
    on item.organization_id = reservation.organization_id
   and item.id = reservation.source_id
  where reservation.organization_id = target_organization_id
    and reservation.source_type = 'order-item'
    and item.order_id = target_order_id
    and (reservation.status = 'active' or reservation.quantity_consumed <> 0);

  if exists (
    select 1
    from public.inventory_reservations reservation
    join public.order_items item
      on item.organization_id = reservation.organization_id
     and item.id = reservation.source_id
    where reservation.organization_id = target_organization_id
      and reservation.source_type = 'order-item'
      and item.order_id = target_order_id
      and reservation.quantity_consumed <> 0
  ) then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_CANCELLABLE';
  end if;

  if order_row.warehouse_id is null and active_reservation_count > 0 then
    raise exception using errcode = 'P0001', message = 'ORDER_WAREHOUSE_REQUIRED';
  end if;
  if order_row.warehouse_id is not null and exists (
    select 1
    from public.inventory_reservations reservation
    join public.order_items item
      on item.organization_id = reservation.organization_id
     and item.id = reservation.source_id
    where reservation.organization_id = target_organization_id
      and reservation.source_type = 'order-item'
      and item.order_id = target_order_id
      and reservation.status = 'active'
      and reservation.warehouse_id is distinct from order_row.warehouse_id
  ) then
    raise exception using errcode = 'P0001', message = 'ORDER_RESERVATION_STATE_INVALID';
  end if;
  if exists (
    select 1
    from public.inventory_reservations reservation
    join public.order_items item
      on item.organization_id = reservation.organization_id
     and item.id = reservation.source_id
    where reservation.organization_id = target_organization_id
      and reservation.source_type = 'order-item'
      and item.order_id = target_order_id
      and reservation.status = 'active'
      and (
        reservation.product_id is distinct from item.product_id
        or reservation.stock_status <> 'available'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'ORDER_RESERVATION_STATE_INVALID';
  end if;

  update public.inventory_reservations reservation
  set status = 'released',
      updated_by = actor_id,
      updated_at = now()
  from public.order_items item
  where reservation.organization_id = target_organization_id
    and reservation.source_type = 'order-item'
    and reservation.source_id = item.id
    and item.organization_id = target_organization_id
    and item.order_id = target_order_id
    and reservation.status = 'active';

  update public.orders
  set status = 'cancelado',
      updated_by = actor_id
  where organization_id = target_organization_id
    and id = target_order_id;

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
    'ORDER_CANCELLED',
    'order',
    target_order_id::text,
    jsonb_build_object('status', 'confirmado'),
    jsonb_build_object('status', 'cancelado', 'reservations_released', true),
    jsonb_build_object(
      'source', 'database_function',
      'operation_key', target_operation_key
    )
  );

  return target_order_id;
end;
$$;

revoke all on function public.cancel_order(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_order(jsonb) to authenticated;

comment on function public.cancel_order(jsonb) is
  'Cancela un pedido confirmado, libera sus reservas activas atomically y no genera movimientos.';
