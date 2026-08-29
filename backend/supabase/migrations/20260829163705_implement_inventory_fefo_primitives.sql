-- Implementa FEFO sobre el stock asignable autoritativo. La regla opera dentro
-- de cada producto + almacen: primero vence, primero sale. Los buckets sin
-- vencimiento quedan al final y los no asignables nunca son candidatos.

-- ---------------------------------------------------------------------------
-- 1. Candidatos visibles y ordenados
-- ---------------------------------------------------------------------------

create view public.inventory_fefo_candidates
with (security_invoker = true)
as
select
  bucket.*,
  row_number() over (
    partition by bucket.organization_id, bucket.product_id, bucket.warehouse_id
    order by bucket.expiration_date asc nulls last,
      bucket.normalized_lot, bucket.location_id
  ) as fefo_rank,
  sum(bucket.assignable_quantity) over (
    partition by bucket.organization_id, bucket.product_id, bucket.warehouse_id
    order by bucket.expiration_date asc nulls last,
      bucket.normalized_lot, bucket.location_id
    rows between unbounded preceding and current row
  ) as cumulative_assignable_quantity
from public.inventory_bucket_availability bucket
where bucket.stock_status = 'available'
  and bucket.assignable_quantity > 0
  and (bucket.expiration_date is null or bucket.expiration_date >= current_date);

revoke all on public.inventory_fefo_candidates from public, anon, authenticated;
grant select on public.inventory_fefo_candidates to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Bloqueo global FEFO y barrera de seleccion
-- ---------------------------------------------------------------------------

create or replace function public.inventory_fefo_scope_lock_key(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.hashtextextended(
    'inventory-fefo:v1:' || requested_organization_id::text || ':'
    || requested_product_id::text || ':' || requested_warehouse_id::text,
    0
  );
$$;

create or replace function public.lock_inventory_fefo_scope(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    public.inventory_fefo_scope_lock_key(
      requested_organization_id, requested_product_id, requested_warehouse_id
    )
  );
end;
$$;

-- El bloqueo exacto conserva la identidad completa, pero adquiere primero el
-- scope FEFO para mantener un unico orden de locks y evitar deadlocks.
create or replace function public.lock_inventory_bucket(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid,
  requested_location_id uuid,
  requested_stock_status text,
  requested_lot text,
  requested_expiration_date date
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.lock_inventory_fefo_scope(
    requested_organization_id, requested_product_id, requested_warehouse_id
  );
  perform pg_catalog.pg_advisory_xact_lock(public.inventory_bucket_lock_key(
    requested_organization_id, requested_product_id, requested_warehouse_id,
    requested_location_id, requested_stock_status, requested_lot,
    requested_expiration_date
  ));
end;
$$;

create or replace function public.assert_inventory_fefo_bucket(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid,
  requested_expiration_date date
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  earlier_expiration_date date;
begin
  if requested_expiration_date < current_date then
    raise exception using errcode = 'P0001', message = 'INVENTORY_EXPIRED_STOCK';
  end if;

  select candidate.expiration_date
  into earlier_expiration_date
  from public.inventory_fefo_candidates candidate
  where candidate.organization_id = requested_organization_id
    and candidate.product_id = requested_product_id
    and candidate.warehouse_id = requested_warehouse_id
    and (
      (requested_expiration_date is null and candidate.expiration_date is not null)
      or candidate.expiration_date < requested_expiration_date
    )
  order by candidate.expiration_date asc nulls last
  limit 1;

  if found then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_FEFO_VIOLATION',
      detail = pg_catalog.format(
        'selected_expiration_date=%s,earlier_expiration_date=%s',
        coalesce(requested_expiration_date::text, '<none>'),
        earlier_expiration_date::text
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Planificador reutilizable (lectura, sin reservar ni consumir)
-- ---------------------------------------------------------------------------

create or replace function public.plan_inventory_fefo(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_warehouse_id uuid,
  requested_quantity numeric,
  requested_location_id uuid default null
)
returns table (
  allocation_order bigint,
  location_id uuid,
  location_code text,
  location_name text,
  lot text,
  expiration_date date,
  assignable_quantity numeric,
  allocation_quantity numeric,
  average_cost numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  total_assignable numeric;
begin
  if (select auth.uid()) is null
    or not public.has_organization_permission(requested_organization_id, 'INVENTORY_VIEW')
  then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;
  if requested_quantity is null or requested_quantity <= 0 then
    raise exception using errcode = '22023', message = 'INVENTORY_FEFO_QUANTITY_INVALID';
  end if;

  select coalesce(sum(candidate.assignable_quantity), 0)
  into total_assignable
  from public.inventory_fefo_candidates candidate
  where candidate.organization_id = requested_organization_id
    and candidate.product_id = requested_product_id
    and candidate.warehouse_id = requested_warehouse_id
    and (requested_location_id is null or candidate.location_id = requested_location_id);

  if total_assignable < requested_quantity then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_FEFO_INSUFFICIENT_STOCK',
      detail = pg_catalog.format(
        'assignable_quantity=%s,requested_quantity=%s',
        total_assignable, requested_quantity
      );
  end if;

  return query
  with ranked as (
    select
      candidate.*,
      coalesce(sum(candidate.assignable_quantity) over (
        order by candidate.expiration_date asc nulls last,
          candidate.normalized_lot, candidate.location_id
        rows between unbounded preceding and 1 preceding
      ), 0) as allocated_before,
      row_number() over (
        order by candidate.expiration_date asc nulls last,
          candidate.normalized_lot, candidate.location_id
      ) as allocation_order
    from public.inventory_fefo_candidates candidate
    where candidate.organization_id = requested_organization_id
      and candidate.product_id = requested_product_id
      and candidate.warehouse_id = requested_warehouse_id
      and (requested_location_id is null or candidate.location_id = requested_location_id)
  )
  select
    ranked.allocation_order,
    ranked.location_id,
    ranked.location_code,
    ranked.location_name,
    ranked.lot,
    ranked.expiration_date,
    ranked.assignable_quantity,
    least(ranked.assignable_quantity, requested_quantity - ranked.allocated_before),
    ranked.average_cost
  from ranked
  where ranked.allocated_before < requested_quantity
  order by ranked.allocation_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. FEFO obligatorio en salidas no vinculadas a una reserva propia
-- ---------------------------------------------------------------------------

create or replace function public.enforce_inventory_outbound_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  physical_quantity numeric;
  reserved_by_others numeric;
  owned_reservation public.inventory_reservations%rowtype;
  requires_fefo boolean;
begin
  if new.movement_type not in ('salida', 'ajuste-negativo') then
    if new.reservation_id is not null then
      raise exception using errcode = 'P0001', message = 'INVENTORY_RESERVATION_OUTBOUND_REQUIRED';
    end if;
    return new;
  end if;

  perform public.lock_inventory_bucket(
    new.organization_id, new.product_id, new.warehouse_id, new.location_id,
    new.stock_status, new.lot, new.expiration_date
  );

  requires_fefo := new.movement_type = 'salida'
    and new.stock_status = 'available'
    and new.reservation_id is null
    and coalesce(new.source_type, '') not in ('supplier-return', 'stock-reclassification');
  if requires_fefo then
    perform public.assert_inventory_fefo_bucket(
      new.organization_id, new.product_id, new.warehouse_id, new.expiration_date
    );
  end if;

  physical_quantity := public.inventory_bucket_quantity(
    new.organization_id, new.product_id, new.warehouse_id, new.location_id,
    new.stock_status, new.lot, new.expiration_date
  );
  if new.quantity > physical_quantity then
    raise exception using
      errcode = 'P0001', message = 'INVENTORY_INSUFFICIENT_STOCK',
      detail = pg_catalog.format(
        'product_id=%s,warehouse_id=%s,location_id=%s,stock_status=%s,lot=%s,expiration_date=%s,physical_quantity=%s,outbound_quantity=%s',
        new.product_id, new.warehouse_id, new.location_id, new.stock_status,
        coalesce(new.lot, ''), coalesce(new.expiration_date::text, ''),
        physical_quantity, new.quantity
      );
  end if;

  if new.reservation_id is not null then
    select reservation.* into owned_reservation
    from public.inventory_reservations reservation
    where reservation.organization_id = new.organization_id
      and reservation.id = new.reservation_id
      and reservation.product_id = new.product_id
      and reservation.warehouse_id = new.warehouse_id
      and reservation.location_id = new.location_id
      and reservation.stock_status = new.stock_status
      and lower(coalesce(reservation.lot, '')) = lower(coalesce(new.lot, ''))
      and reservation.expiration_date is not distinct from new.expiration_date
      and reservation.status = 'active'
    for update;
    if not found or new.quantity > owned_reservation.quantity - owned_reservation.quantity_consumed then
      raise exception using errcode = 'P0001', message = 'INVENTORY_RESERVATION_UNAVAILABLE';
    end if;
  end if;

  reserved_by_others := public.inventory_bucket_reserved_quantity(
    new.organization_id, new.product_id, new.warehouse_id, new.location_id,
    new.stock_status, new.lot, new.expiration_date, new.reservation_id
  );
  if new.quantity > physical_quantity - reserved_by_others then
    raise exception using
      errcode = 'P0001', message = 'INVENTORY_RESERVED_STOCK',
      detail = pg_catalog.format(
        'physical_quantity=%s,reserved_by_others=%s,outbound_quantity=%s',
        physical_quantity, reserved_by_others, new.quantity
      );
  end if;
  return new;
end;
$$;

-- Las nuevas reservas tambien deben tomar el bucket que vence primero. Las
-- reducciones o consumos de una reserva existente no vuelven a seleccionarla.
create or replace function public.enforce_inventory_reservation_fefo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_remaining numeric;
  new_remaining numeric;
begin
  if new.status <> 'active' or new.stock_status <> 'available' then
    return new;
  end if;
  new_remaining := new.quantity - new.quantity_consumed;
  if tg_op = 'UPDATE' then
    old_remaining := old.quantity - old.quantity_consumed;
    if old.status = 'active'
      and new.product_id = old.product_id
      and new.warehouse_id = old.warehouse_id
      and new.location_id = old.location_id
      and new.stock_status = old.stock_status
      and lower(coalesce(new.lot, '')) = lower(coalesce(old.lot, ''))
      and new.expiration_date is not distinct from old.expiration_date
      and new_remaining <= old_remaining
    then
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
  if new_remaining > (
    select state.assignable_quantity
    from public.inventory_bucket_state(
      new.organization_id, new.product_id, new.warehouse_id, new.location_id,
      new.stock_status, new.lot, new.expiration_date
    ) state
  ) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_RESERVED_STOCK';
  end if;
  return new;
end;
$$;

create trigger inventory_reservations_enforce_fefo
before insert or update of product_id, warehouse_id, location_id, stock_status,
  lot, expiration_date, quantity, quantity_consumed, status
on public.inventory_reservations
for each row execute function public.enforce_inventory_reservation_fefo();

-- ---------------------------------------------------------------------------
-- 5. Privilegios explicitos
-- ---------------------------------------------------------------------------

revoke all on function public.inventory_fefo_scope_lock_key(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.lock_inventory_fefo_scope(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.assert_inventory_fefo_bucket(uuid, uuid, uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_inventory_reservation_fefo()
  from public, anon, authenticated, service_role;
revoke all on function public.plan_inventory_fefo(uuid, uuid, uuid, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.plan_inventory_fefo(uuid, uuid, uuid, numeric, uuid)
  to authenticated;

comment on view public.inventory_fefo_candidates is
  'Buckets sanitarios asignables ordenados por primero vence, primero sale.';
comment on function public.plan_inventory_fefo(uuid, uuid, uuid, numeric, uuid) is
  'Plan de distribucion FEFO de solo lectura; no reserva ni consume stock.';
