-- A rejected repair cannot retain inventory reservations. Preserve physical
-- consumptions and release only the unconsumed balance.

begin;

create or replace function public.validate_repair_part_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
  warehouse_is_active boolean;
  location_is_active boolean;
begin
  select product.*
  into product_row
  from public.products product
  where product.organization_id = new.organization_id
    and product.id = new.product_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_PRODUCT_NOT_FOUND';
  end if;
  if tg_op = 'INSERT' or new.product_id is distinct from old.product_id then
    if not product_row.is_active then
      raise exception using errcode = 'P0001', message = 'REPAIR_PART_PRODUCT_UNAVAILABLE';
    end if;
    new.batch_control_snapshot := product_row.batch_control;
    new.expiration_control_snapshot := product_row.expiration_control;
  else
    new.batch_control_snapshot := old.batch_control_snapshot;
    new.expiration_control_snapshot := old.expiration_control_snapshot;
  end if;

  if new.batch_control_snapshot and nullif(btrim(new.lot), '') is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_LOT_REQUIRED';
  end if;
  if new.expiration_control_snapshot and new.expiration_date is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_EXPIRATION_REQUIRED';
  end if;

  select warehouse.is_active
  into warehouse_is_active
  from public.warehouses warehouse
  where warehouse.organization_id = new.organization_id
    and warehouse.id = new.warehouse_id;
  if not found
    or ((tg_op = 'INSERT' or new.warehouse_id is distinct from old.warehouse_id)
      and not warehouse_is_active)
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_WAREHOUSE_UNAVAILABLE';
  end if;

  select location.is_active
  into location_is_active
  from public.warehouse_locations location
  where location.organization_id = new.organization_id
    and location.warehouse_id = new.warehouse_id
    and location.id = new.location_id;
  if not found
    or ((
      tg_op = 'INSERT'
      or new.warehouse_id is distinct from old.warehouse_id
      or new.location_id is distinct from old.location_id
    ) and not location_is_active)
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_LOCATION_UNAVAILABLE';
  end if;

  new.lot := nullif(btrim(new.lot), '');
  return new;
end;
$$;

create or replace function public.reject_repair_quote(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_quote_id uuid,
  requested_observation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  repair_row public.repairs%rowtype;
  quote_row public.repair_quotes%rowtype;
  part_row public.repair_parts%rowtype;
begin
  actor_id := public.assert_repair_actor(requested_organization_id, 'REPAIRS_APPROVE_QUOTE');
  select repair.* into repair_row
  from public.repairs repair
  where repair.organization_id = requested_organization_id and repair.id = requested_repair_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_row.status <> 'waiting_customer_approval' then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_REJECTION_STATE_INVALID';
  end if;

  select quote.* into quote_row
  from public.repair_quotes quote
  where quote.organization_id = requested_organization_id
    and quote.id = requested_quote_id
    and quote.repair_id = requested_repair_id
  for update;
  if not found or quote_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_NOT_PENDING';
  end if;

  update public.repair_quotes quote
  set status = 'rejected', rejected_by = actor_id, rejected_at = now(),
      rejection_observation = nullif(btrim(requested_observation), ''), updated_by = actor_id
  where quote.organization_id = requested_organization_id and quote.id = requested_quote_id;

  perform set_config('app.repairs_status_write', 'true', true);
  update public.repairs repair
  set status = 'rejected', updated_by = actor_id
  where repair.organization_id = requested_organization_id and repair.id = requested_repair_id;
  perform set_config('app.repairs_status_write', 'false', true);

  for part_row in
    select part.*
    from public.repair_parts part
    where part.organization_id = requested_organization_id
      and part.repair_id = requested_repair_id
      and part.status = 'reserved'
    order by part.id
    for update
  loop
    perform set_config('app.repair_part_state_write', 'true', true);
    update public.repair_parts part
    set status = 'cancelled', updated_by = actor_id
    where part.organization_id = requested_organization_id and part.id = part_row.id;
    perform set_config('app.repair_part_state_write', 'false', true);

    perform public.record_repair_event(
      requested_organization_id,
      requested_repair_id,
      'PART_CANCELLED',
      repair_row.status,
      repair_row.status,
      actor_id,
      requested_observation,
      jsonb_build_object(
        'repair_part_id', part_row.id,
        'quote_id', requested_quote_id,
        'released_quantity', part_row.quantity_requested - part_row.quantity_consumed,
        'source', 'quote_rejection'
      ),
      'REPAIR_PART_CANCELLED'
    );
  end loop;

  perform public.record_repair_event(
    requested_organization_id,
    requested_repair_id,
    'QUOTE_REJECTED',
    repair_row.status,
    'rejected',
    actor_id,
    requested_observation,
    jsonb_build_object('quote_id', requested_quote_id, 'version_number', quote_row.version_number),
    'REPAIR_QUOTE_REJECTED'
  );
end;
$$;

-- Repair persisted terminal rows as a no-op on installations without stale
-- reservations. A system-authored event makes the corrective release visible.
do $$
declare
  part_row public.repair_parts%rowtype;
begin
  for part_row in
    select part.*
    from public.repair_parts part
    join public.repairs repair
      on repair.organization_id = part.organization_id
     and repair.id = part.repair_id
    where repair.status = 'rejected'
      and part.status = 'reserved'
    order by part.repair_id, part.id
    for update of repair, part
  loop
    perform set_config('app.repair_part_state_write', 'true', true);
    update public.repair_parts part
    set status = 'cancelled'
    where part.organization_id = part_row.organization_id
      and part.id = part_row.id;
    perform set_config('app.repair_part_state_write', 'false', true);

    perform public.record_repair_event(
      part_row.organization_id,
      part_row.repair_id,
      'PART_CANCELLED',
      'rejected',
      'rejected',
      null,
      'Liberacion automatica de reserva pendiente en reparacion rechazada',
      jsonb_build_object(
        'repair_part_id', part_row.id,
        'released_quantity', part_row.quantity_requested - part_row.quantity_consumed,
        'source', 'quote_rejection_backfill'
      ),
      'REPAIR_PART_CANCELLED'
    );
  end loop;
end;
$$;

revoke all on function public.validate_repair_part_row()
  from public, anon, authenticated, service_role;
revoke all on function public.reject_repair_quote(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.reject_repair_quote(uuid, uuid, uuid, text)
  to authenticated, service_role;

comment on function public.validate_repair_part_row() is
  'Valida la identidad activa al reservar sin impedir cierres historicos posteriores.';
comment on function public.reject_repair_quote(uuid, uuid, uuid, text) is
  'Rechaza una cotizacion y libera atomicamente el saldo de sus reservas pendientes.';

commit;
