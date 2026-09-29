begin;

-- D3 keeps inventory_movements as the physical ledger. This table only records
-- the operator-confirmed quantity assigned from one immutable movement to one
-- delivery line. delivery_item_id is represented by the existing composite
-- identity (organization_id, delivery_id, order_line_id).
create table public.distribution_delivery_inventory_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  delivery_id uuid not null,
  order_id uuid not null,
  order_line_id uuid not null,
  inventory_movement_id uuid not null,
  quantity numeric(14,3) not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint distribution_delivery_inventory_allocations_org_id_key
    unique (organization_id, id),
  constraint distribution_delivery_inventory_allocations_delivery_fk
    foreign key (organization_id, delivery_id, order_id)
    references public.distribution_deliveries (organization_id, id, order_id)
    on delete restrict,
  constraint distribution_delivery_inventory_allocations_delivery_item_fk
    foreign key (organization_id, delivery_id, order_line_id)
    references public.distribution_delivery_items (organization_id, delivery_id, order_line_id)
    on delete restrict,
  constraint distribution_delivery_inventory_allocations_order_line_fk
    foreign key (organization_id, order_id, order_line_id)
    references public.order_items (organization_id, order_id, id)
    on delete restrict,
  constraint distribution_delivery_inventory_allocations_movement_fk
    foreign key (organization_id, inventory_movement_id)
    references public.inventory_movements (organization_id, id)
    on delete restrict,
  constraint distribution_delivery_inventory_allocations_quantity_positive
    check (quantity > 0),
  constraint distribution_delivery_inventory_allocations_movement_unique
    unique (organization_id, delivery_id, order_line_id, inventory_movement_id)
);

create index distribution_delivery_inventory_allocations_movement_idx
  on public.distribution_delivery_inventory_allocations (
    organization_id, inventory_movement_id, delivery_id, order_line_id
  );

create index distribution_delivery_inventory_allocations_delivery_idx
  on public.distribution_delivery_inventory_allocations (
    organization_id, delivery_id, order_line_id, inventory_movement_id
  );

comment on table public.distribution_delivery_inventory_allocations is
  'Asignacion explicita y auditable de cantidades de inventory_movements order-dispatch a lineas de entregas; no modifica inventario.';

comment on column public.distribution_delivery_inventory_allocations.order_line_id is
  'Identidad del delivery_item actual: distribution_delivery_items usa (organization_id, delivery_id, order_line_id) como clave primaria.';

alter table public.distribution_delivery_inventory_allocations enable row level security;

revoke all on table public.distribution_delivery_inventory_allocations
  from public, anon, authenticated, service_role;
grant select on table public.distribution_delivery_inventory_allocations to authenticated;

create policy distribution_delivery_inventory_allocations_select_policy
on public.distribution_delivery_inventory_allocations
for select to authenticated
using (
  public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW')
);

-- D1's canonical save implementation replaces delivery items as one atomic
-- snapshot. Direct deletion remains restricted by the FK; only the D3 save
-- wrapper may release the old allocations immediately before that replacement.
create or replace function public.release_distribution_delivery_item_allocations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(pg_catalog.current_setting('silsanplex.distribution_delivery_item_replace', true), '') = 'true' then
    delete from public.distribution_delivery_inventory_allocations allocation
    where allocation.organization_id = old.organization_id
      and allocation.delivery_id = old.delivery_id
      and allocation.order_line_id = old.order_line_id;
  end if;
  return old;
end;
$$;

drop trigger if exists distribution_delivery_items_release_inventory_allocations
  on public.distribution_delivery_items;
create trigger distribution_delivery_items_release_inventory_allocations
before delete on public.distribution_delivery_items
for each row execute function public.release_distribution_delivery_item_allocations();

create or replace function public.validate_distribution_delivery_inventory_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_row public.distribution_deliveries%rowtype;
  movement_row public.inventory_movements%rowtype;
  already_allocated numeric(16,3);
begin
  select delivery.*
    into delivery_row
  from public.distribution_deliveries delivery
  where delivery.organization_id = new.organization_id
    and delivery.id = new.delivery_id;

  if not found then
    raise exception using errcode = '23503', message = 'DISTRIBUTION_DELIVERY_NOT_FOUND';
  end if;

  if delivery_row.delivery_status in ('entregado', 'entrega_parcial', 'rechazado', 'devuelto', 'cancelado') then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ALLOCATION_LOCKED';
  end if;

  select movement.*
    into movement_row
  from public.inventory_movements movement
  where movement.organization_id = new.organization_id
    and movement.id = new.inventory_movement_id;

  if not found then
    raise exception using errcode = '23503', message = 'DISTRIBUTION_MOVEMENT_NOT_FOUND';
  end if;

  if movement_row.movement_type is distinct from 'salida'
    or movement_row.source_type is distinct from 'order-dispatch' then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_MOVEMENT_NOT_ORDER_DISPATCH';
  end if;

  if movement_row.source_id is distinct from new.order_line_id then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_MOVEMENT_ORDER_LINE_MISMATCH';
  end if;

  if movement_row.reservation_id is null then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_MOVEMENT_RESERVATION_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.audit_events audit
    where audit.organization_id = new.organization_id
      and audit.action = 'ORDER_DISPATCHED'
      and audit.entity_type = 'order'
      and audit.entity_id = delivery_row.order_id::text
      and audit.metadata -> 'movement_ids' @> pg_catalog.jsonb_build_array(movement_row.id::text)
  ) then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_MOVEMENT_DISPATCH_NOT_FOUND';
  end if;

  select coalesce(sum(allocation.quantity), 0)
    into already_allocated
  from public.distribution_delivery_inventory_allocations allocation
  join public.distribution_deliveries allocated_delivery
    on allocated_delivery.organization_id = allocation.organization_id
   and allocated_delivery.id = allocation.delivery_id
  where allocation.organization_id = new.organization_id
    and allocation.inventory_movement_id = new.inventory_movement_id
    and allocated_delivery.delivery_status <> 'cancelado'
    and allocation.id is distinct from new.id;

  if already_allocated + new.quantity > movement_row.quantity then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_MOVEMENT_ALLOCATION_EXCEEDS_QUANTITY';
  end if;

  return new;
end;
$$;

drop trigger if exists distribution_delivery_inventory_allocations_validate
  on public.distribution_delivery_inventory_allocations;
create trigger distribution_delivery_inventory_allocations_validate
before insert or update on public.distribution_delivery_inventory_allocations
for each row execute function public.validate_distribution_delivery_inventory_allocation();

create or replace function public.validate_distribution_delivery_inventory_allocation_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id_value uuid;
  delivery_id_value uuid;
  order_line_id_value uuid;
  expected_quantity numeric(16,3);
  allocated_quantity numeric(16,3);
  delivery_status_value text;
begin
  if tg_op = 'DELETE' then
    organization_id_value := old.organization_id;
    delivery_id_value := old.delivery_id;
    order_line_id_value := old.order_line_id;
  else
    organization_id_value := new.organization_id;
    delivery_id_value := new.delivery_id;
    order_line_id_value := new.order_line_id;
  end if;

  select item.quantity, delivery.delivery_status
    into expected_quantity, delivery_status_value
  from public.distribution_delivery_items item
  join public.distribution_deliveries delivery
    on delivery.organization_id = item.organization_id
   and delivery.id = item.delivery_id
  where item.organization_id = organization_id_value
    and item.delivery_id = delivery_id_value
    and item.order_line_id = order_line_id_value;

  if not found or delivery_status_value = 'cancelado' then
    return null;
  end if;

  select coalesce(sum(allocation.quantity), 0)
    into allocated_quantity
  from public.distribution_delivery_inventory_allocations allocation
  where allocation.organization_id = organization_id_value
    and allocation.delivery_id = delivery_id_value
    and allocation.order_line_id = order_line_id_value;

  if allocated_quantity is distinct from expected_quantity then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_DELIVERY_ITEM_ALLOCATIONS_INCOMPLETE';
  end if;

  return null;
end;
$$;

drop trigger if exists distribution_delivery_inventory_allocations_totals
  on public.distribution_delivery_inventory_allocations;
create constraint trigger distribution_delivery_inventory_allocations_totals
after insert or update or delete on public.distribution_delivery_inventory_allocations
deferrable initially deferred
for each row execute function public.validate_distribution_delivery_inventory_allocation_totals();

-- The D1 function keeps its order/sale/direction/idempotency contract. D3
-- adds the physical-allocation envelope around that canonical transaction.
alter function public.save_distribution_delivery(jsonb)
  rename to save_distribution_delivery_d1_contract_internal;

create or replace function public.save_distribution_delivery(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_delivery_id uuid;
  target_order_id uuid;
  result_id uuid;
  normalized_payload jsonb;
  line_payload jsonb;
  allocation_entry jsonb;
  requested_allocations jsonb := '[]'::jsonb;
  canonical_requested_allocations jsonb := '[]'::jsonb;
  previous_allocations jsonb := '[]'::jsonb;
  previous_item_snapshot jsonb := '[]'::jsonb;
  requested_item_snapshot jsonb;
  current_allocations jsonb := '[]'::jsonb;
  requested_line_id uuid;
  requested_movement_id uuid;
  requested_quantity numeric(14,3);
  line_allocated_quantity numeric(16,3);
  previous_delivery_status text;
  previous_delivery_item_count bigint := 0;
  current_delivery_status text;
  delivery_item_row record;
  movement_row public.inventory_movements%rowtype;
  requested_movement_quantity numeric(16,3);
  allocated_by_other_deliveries numeric(16,3);
begin
  if payload is null or pg_catalog.jsonb_typeof(payload) <> 'object' then
    return public.save_distribution_delivery_d1_contract_internal(payload);
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_delivery_id := nullif(payload ->> 'id', '')::uuid;
  target_order_id := nullif(payload ->> 'order_id', '')::uuid;

  if actor_id is null
    or target_organization_id is null
    or not public.has_organization_permission(target_organization_id, 'DISTRIBUTION_MANAGE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  if target_delivery_id is not null then
    select delivery.delivery_status, delivery.order_id
      into previous_delivery_status, target_order_id
    from public.distribution_deliveries delivery
    where delivery.organization_id = target_organization_id
      and delivery.id = target_delivery_id
    for update;

    select coalesce(jsonb_agg(jsonb_build_object(
      'order_line_id', allocation.order_line_id,
      'inventory_movement_id', allocation.inventory_movement_id,
      'quantity', allocation.quantity
    ) order by allocation.order_line_id, allocation.inventory_movement_id), '[]'::jsonb)
      into previous_allocations
    from public.distribution_delivery_inventory_allocations allocation
    where allocation.organization_id = target_organization_id
      and allocation.delivery_id = target_delivery_id;

    select count(*)
      into previous_delivery_item_count
    from public.distribution_delivery_items item
    where item.organization_id = target_organization_id
      and item.delivery_id = target_delivery_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'order_line_id', item.order_line_id::text,
      'quantity', item.quantity
    ) order by item.order_line_id), '[]'::jsonb)
      into previous_item_snapshot
    from public.distribution_delivery_items item
    where item.organization_id = target_organization_id
      and item.delivery_id = target_delivery_id;
  end if;

  normalized_payload := public.prepare_distribution_delivery_payload(payload);

  -- Legacy deliveries may already have normalized D1 delivery items but no
  -- D3 allocations. Build a comparable snapshot without requiring a movement
  -- guess. Invalid payloads leave this null so the canonical validator still
  -- reports the original payload error instead of being treated as legacy.
  requested_item_snapshot := null;
  if pg_catalog.jsonb_typeof(normalized_payload -> 'items') = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(normalized_payload -> 'items') entry(value)
      where coalesce(entry.value ->> 'order_line_id', entry.value ->> 'id', '') = ''
        or pg_catalog.jsonb_typeof(coalesce(entry.value -> 'quantity', entry.value -> 'cantidad')) is distinct from 'number'
    ) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'order_line_id', coalesce(entry.value ->> 'order_line_id', entry.value ->> 'id'),
      'quantity', coalesce(entry.value -> 'quantity', entry.value -> 'cantidad')
    ) order by coalesce(entry.value ->> 'order_line_id', entry.value ->> 'id')), '[]'::jsonb)
      into requested_item_snapshot
    from jsonb_array_elements(normalized_payload -> 'items') entry(value);
  end if;

  -- D1 locks delivery then order. D3 locks all requested movements only
  -- after those locks, in UUID order, so concurrent allocations cannot form a
  -- cycle and cannot oversubscribe a movement.
  perform pg_catalog.set_config(
    'silsanplex.distribution_delivery_item_replace', 'true', true
  );
  result_id := public.save_distribution_delivery_d1_contract_internal(normalized_payload);

  select delivery.delivery_status, delivery.order_id
    into current_delivery_status, target_order_id
  from public.distribution_deliveries delivery
  where delivery.organization_id = target_organization_id
    and delivery.id = result_id;

  if current_delivery_status is null then
    raise exception using errcode = 'P0002', message = 'DISTRIBUTION_NOT_FOUND';
  end if;

  -- Legacy deliveries may have no D3 allocations. Keep status-only
  -- maintenance compatible when the physical item snapshot is unchanged,
  -- without inventing allocations. A new or changed physical item must still
  -- provide explicit movements; every new delivery follows that path.
  if target_delivery_id is not null
    and previous_allocations = '[]'::jsonb
    and (
      (
        previous_delivery_item_count = 0
        -- No normalized D1 items means the row predates the normalized
        -- shipment contract. Preserve its existing maintenance semantics;
        -- D1 remains responsible for its legacy JSON snapshot.
      )
      or (
        previous_delivery_item_count > 0
        and requested_item_snapshot is not distinct from previous_item_snapshot
      )
    )
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(normalized_payload -> 'items', '[]'::jsonb)) entry(value)
      where pg_catalog.jsonb_typeof(entry.value -> 'movement_allocations') = 'array'
        and pg_catalog.jsonb_array_length(entry.value -> 'movement_allocations') > 0
    ) then
    return result_id;
  end if;

  if current_delivery_status = 'cancelado' and target_delivery_id is not null then
    if previous_allocations <> '[]'::jsonb then
      delete from public.distribution_delivery_inventory_allocations allocation
      where allocation.organization_id = target_organization_id
        and allocation.delivery_id = result_id;
      insert into public.audit_events (
        organization_id, actor_user_id, action, entity_type, entity_id,
        old_values, new_values, metadata
      ) values (
        target_organization_id, actor_id, 'DISTRIBUTION_ITEMS_ALLOCATED',
        'distribution_delivery', result_id::text,
        jsonb_build_object('movement_allocations', previous_allocations),
        jsonb_build_object('movement_allocations', '[]'::jsonb),
        jsonb_build_object('source', 'd3_delivery_cancellation_release')
      );
    end if;
    return result_id;
  end if;

  if pg_catalog.jsonb_typeof(normalized_payload -> 'items') <> 'array' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_ITEMS_INVALID';
  end if;

  for delivery_item_row in
    select item.order_id, item.order_line_id, item.quantity
    from public.distribution_delivery_items item
    where item.organization_id = target_organization_id
      and item.delivery_id = result_id
    order by item.order_line_id
  loop
    select entry.value
      into line_payload
    from jsonb_array_elements(normalized_payload -> 'items') entry(value)
    where coalesce(entry.value ->> 'order_line_id', entry.value ->> 'id') = delivery_item_row.order_line_id::text
    limit 1;

    if line_payload is null
      or pg_catalog.jsonb_typeof(line_payload -> 'movement_allocations') <> 'array'
      or pg_catalog.jsonb_array_length(line_payload -> 'movement_allocations') = 0 then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_MOVEMENT_ALLOCATIONS_REQUIRED';
    end if;

    line_allocated_quantity := 0;
    for allocation_entry in
      select value from jsonb_array_elements(line_payload -> 'movement_allocations')
    loop
      if pg_catalog.jsonb_typeof(allocation_entry) <> 'object'
        or coalesce(allocation_entry ->> 'inventory_movement_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or pg_catalog.jsonb_typeof(allocation_entry -> 'quantity') is distinct from 'number'
        or (allocation_entry ->> 'quantity')::numeric <= 0
        or (allocation_entry ->> 'quantity')::numeric > 999999999 then
        raise exception using errcode = '22023', message = 'DISTRIBUTION_MOVEMENT_ALLOCATION_INVALID';
      end if;

      requested_line_id := delivery_item_row.order_line_id;
      requested_movement_id := (allocation_entry ->> 'inventory_movement_id')::uuid;
      requested_quantity := (allocation_entry ->> 'quantity')::numeric(14,3);
      line_allocated_quantity := line_allocated_quantity + requested_quantity;
      requested_allocations := requested_allocations || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'order_line_id', requested_line_id,
          'inventory_movement_id', requested_movement_id,
          'quantity', requested_quantity
        )
      );
    end loop;

    if line_allocated_quantity is distinct from delivery_item_row.quantity then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_DELIVERY_ITEM_ALLOCATIONS_INCOMPLETE';
    end if;
  end loop;

  select coalesce(jsonb_agg(entry.value order by entry.value ->> 'order_line_id', entry.value ->> 'inventory_movement_id'), '[]'::jsonb)
    into canonical_requested_allocations
  from jsonb_array_elements(requested_allocations) entry(value);

  if exists (
    select 1
    from jsonb_array_elements(canonical_requested_allocations) entry(value)
    group by entry.value ->> 'order_line_id', entry.value ->> 'inventory_movement_id'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_MOVEMENT_ALLOCATION_DUPLICATE';
  end if;

  if target_delivery_id is not null
    and previous_delivery_status in ('entregado', 'entrega_parcial', 'rechazado', 'devuelto')
    and previous_allocations is distinct from canonical_requested_allocations then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ALLOCATION_LOCKED';
  end if;

  for requested_movement_id in
    select distinct (entry.value ->> 'inventory_movement_id')::uuid
    from jsonb_array_elements(canonical_requested_allocations) entry(value)
    order by 1
  loop
    select movement.*
      into movement_row
    from public.inventory_movements movement
    where movement.organization_id = target_organization_id
      and movement.id = requested_movement_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_MOVEMENT_NOT_FOUND';
    end if;

    requested_movement_quantity := 0;
    select coalesce(sum((entry.value ->> 'quantity')::numeric), 0)
      into requested_movement_quantity
    from jsonb_array_elements(canonical_requested_allocations) entry(value)
    where (entry.value ->> 'inventory_movement_id')::uuid = requested_movement_id;

    select coalesce(sum(allocation.quantity), 0)
      into allocated_by_other_deliveries
    from public.distribution_delivery_inventory_allocations allocation
    join public.distribution_deliveries allocated_delivery
      on allocated_delivery.organization_id = allocation.organization_id
     and allocated_delivery.id = allocation.delivery_id
    where allocation.organization_id = target_organization_id
      and allocation.inventory_movement_id = requested_movement_id
      and allocation.delivery_id is distinct from result_id
      and allocated_delivery.delivery_status <> 'cancelado';

    if movement_row.movement_type is distinct from 'salida'
      or movement_row.source_type is distinct from 'order-dispatch' then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_MOVEMENT_NOT_ORDER_DISPATCH';
    end if;
    if movement_row.reservation_id is null then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_MOVEMENT_RESERVATION_REQUIRED';
    end if;
    if allocated_by_other_deliveries + requested_movement_quantity > movement_row.quantity then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_MOVEMENT_ALLOCATION_EXCEEDS_QUANTITY';
    end if;
  end loop;

  for allocation_entry in
    select value from jsonb_array_elements(canonical_requested_allocations)
  loop
    requested_line_id := (allocation_entry ->> 'order_line_id')::uuid;
    requested_movement_id := (allocation_entry ->> 'inventory_movement_id')::uuid;
    select movement.*
      into movement_row
    from public.inventory_movements movement
    where movement.organization_id = target_organization_id
      and movement.id = requested_movement_id;

    if movement_row.source_id is distinct from requested_line_id then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_MOVEMENT_ORDER_LINE_MISMATCH';
    end if;

    if not exists (
      select 1
      from public.audit_events audit
      where audit.organization_id = target_organization_id
        and audit.action = 'ORDER_DISPATCHED'
        and audit.entity_type = 'order'
        and audit.entity_id = target_order_id::text
        and audit.metadata -> 'movement_ids' @> pg_catalog.jsonb_build_array(requested_movement_id::text)
    ) then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_MOVEMENT_DISPATCH_NOT_FOUND';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_line_id', allocation.order_line_id,
    'inventory_movement_id', allocation.inventory_movement_id,
    'quantity', allocation.quantity
  ) order by allocation.order_line_id, allocation.inventory_movement_id), '[]'::jsonb)
    into current_allocations
  from public.distribution_delivery_inventory_allocations allocation
  where allocation.organization_id = target_organization_id
    and allocation.delivery_id = result_id;

  if current_allocations is distinct from canonical_requested_allocations then
    delete from public.distribution_delivery_inventory_allocations allocation
    where allocation.organization_id = target_organization_id
      and allocation.delivery_id = result_id;

    insert into public.distribution_delivery_inventory_allocations (
      organization_id, delivery_id, order_id, order_line_id,
      inventory_movement_id, quantity, created_by
    )
    select target_organization_id, result_id, target_order_id,
      (entry.value ->> 'order_line_id')::uuid,
      (entry.value ->> 'inventory_movement_id')::uuid,
      (entry.value ->> 'quantity')::numeric(14,3),
      actor_id
    from jsonb_array_elements(canonical_requested_allocations) entry(value);

    insert into public.audit_events (
      organization_id, actor_user_id, action, entity_type, entity_id,
      old_values, new_values, metadata
    ) values (
      target_organization_id, actor_id, 'DISTRIBUTION_ITEMS_ALLOCATED',
      'distribution_delivery', result_id::text,
      jsonb_build_object('movement_allocations', current_allocations),
      jsonb_build_object('movement_allocations', canonical_requested_allocations),
      jsonb_build_object('source', 'd3_explicit_movement_allocations', 'order_id', target_order_id)
    );
  end if;

  return result_id;
end;
$$;

revoke all on function public.release_distribution_delivery_item_allocations(),
  public.validate_distribution_delivery_inventory_allocation(),
  public.validate_distribution_delivery_inventory_allocation_totals(),
  public.save_distribution_delivery_d1_contract_internal(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.save_distribution_delivery(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_distribution_delivery(jsonb) to authenticated;

comment on function public.save_distribution_delivery(jsonb) is
  'Guarda una entrega y exige allocations explicitas delivery_item -> inventory_movement para bienes nuevos; no modifica inventario.';

-- Read path for the explicit operator choice. quantity is positive for salida
-- movements in the canonical ledger; availability is quantity minus active
-- delivery allocations, excluding the delivery currently being edited.
create or replace function public.list_distribution_inventory_movements(
  requested_organization_id uuid,
  requested_order_id uuid,
  requested_delivery_id uuid default null
)
returns table (
  inventory_movement_id uuid,
  order_item_id uuid,
  quantity_physical numeric,
  quantity_allocated numeric,
  quantity_available numeric,
  lot text,
  expiration_date date,
  warehouse text,
  warehouse_id uuid,
  location_id uuid,
  stock_status text,
  reservation_id uuid,
  document_reference text,
  operation_date date,
  operation_key text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or requested_organization_id is null
    or not public.has_organization_permission(requested_organization_id, 'DISTRIBUTION_VIEW') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  return query
  select movement.id,
    item.id,
    movement.quantity,
    coalesce(allocated.quantity_allocated, 0),
    movement.quantity - coalesce(allocated.quantity_allocated, 0),
    movement.lot,
    movement.expiration_date,
    movement.warehouse,
    movement.warehouse_id,
    movement.location_id,
    movement.stock_status,
    movement.reservation_id,
    movement.document_reference,
    movement.operation_date,
    dispatch.operation_key
  from public.inventory_movements movement
  join public.order_items item
    on item.organization_id = movement.organization_id
   and item.id = movement.source_id
   and item.order_id = requested_order_id
  left join lateral (
    select coalesce(sum(allocation.quantity), 0)::numeric as quantity_allocated
    from public.distribution_delivery_inventory_allocations allocation
    join public.distribution_deliveries delivery
      on delivery.organization_id = allocation.organization_id
     and delivery.id = allocation.delivery_id
    where allocation.organization_id = requested_organization_id
      and allocation.inventory_movement_id = movement.id
      and allocation.delivery_id is distinct from requested_delivery_id
      and delivery.delivery_status <> 'cancelado'
  ) allocated on true
  left join lateral (
    select audit.metadata ->> 'operation_key' as operation_key
    from public.audit_events audit
    where audit.organization_id = requested_organization_id
      and audit.action = 'ORDER_DISPATCHED'
      and audit.entity_type = 'order'
      and audit.entity_id = requested_order_id::text
      and audit.metadata -> 'movement_ids' @> pg_catalog.jsonb_build_array(movement.id::text)
    order by audit.id desc
    limit 1
  ) dispatch on true
  where movement.organization_id = requested_organization_id
    and movement.movement_type = 'salida'
    and movement.source_type = 'order-dispatch'
    and movement.quantity - coalesce(allocated.quantity_allocated, 0) > 0
    and dispatch.operation_key is not null
  order by item.id, movement.expiration_date nulls last, movement.id;
end;
$$;

create or replace function public.list_distribution_delivery_inventory_trace(
  requested_organization_id uuid,
  requested_delivery_id uuid default null
)
returns table (
  delivery_id uuid,
  order_id uuid,
  order_item_id uuid,
  inventory_movement_id uuid,
  allocated_quantity numeric,
  lot text,
  expiration_date date,
  warehouse text,
  warehouse_id uuid,
  location_id uuid,
  stock_status text,
  reservation_id uuid,
  document_reference text,
  operation_date date,
  operation_key text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or requested_organization_id is null
    or not public.has_organization_permission(requested_organization_id, 'DISTRIBUTION_VIEW') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  return query
  select allocation.delivery_id,
    allocation.order_id,
    allocation.order_line_id,
    allocation.inventory_movement_id,
    allocation.quantity,
    movement.lot,
    movement.expiration_date,
    movement.warehouse,
    movement.warehouse_id,
    movement.location_id,
    movement.stock_status,
    movement.reservation_id,
    movement.document_reference,
    movement.operation_date,
    dispatch.operation_key
  from public.distribution_delivery_inventory_allocations allocation
  join public.inventory_movements movement
    on movement.organization_id = allocation.organization_id
   and movement.id = allocation.inventory_movement_id
  left join lateral (
    select audit.metadata ->> 'operation_key' as operation_key
    from public.audit_events audit
    where audit.organization_id = requested_organization_id
      and audit.action = 'ORDER_DISPATCHED'
      and audit.entity_type = 'order'
      and audit.entity_id = allocation.order_id::text
      and audit.metadata -> 'movement_ids' @> pg_catalog.jsonb_build_array(allocation.inventory_movement_id::text)
    order by audit.id desc
    limit 1
  ) dispatch on true
  where allocation.organization_id = requested_organization_id
    and (requested_delivery_id is null or allocation.delivery_id = requested_delivery_id)
  order by allocation.delivery_id, allocation.order_line_id, allocation.inventory_movement_id;
end;
$$;

revoke all on function public.list_distribution_inventory_movements(uuid, uuid, uuid),
  public.list_distribution_delivery_inventory_trace(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_distribution_inventory_movements(uuid, uuid, uuid),
  public.list_distribution_delivery_inventory_trace(uuid, uuid)
  to authenticated;

comment on function public.list_distribution_inventory_movements(uuid, uuid, uuid) is
  'Lista movimientos order-dispatch trazables y saldo disponible para asignacion explicita por una entrega.';

comment on function public.list_distribution_delivery_inventory_trace(uuid, uuid) is
  'Lee la trazabilidad explicita de entregas; una entrega historica sin allocations devuelve cero filas y no inventa lotes.';

commit;
