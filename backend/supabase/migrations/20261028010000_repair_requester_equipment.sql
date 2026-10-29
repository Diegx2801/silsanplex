-- Repairs identify their requester and equipment without creating fictitious
-- customers or inventory products. Existing JSON RPC signatures stay intact.
begin;

alter table public.repairs
  alter column customer_id drop not null,
  alter column product_id drop not null,
  add column requester_type text not null default 'customer',
  add column requesting_area text,
  add column equipment_type text not null default 'catalog',
  add column external_equipment_description text,
  add constraint repairs_requester_identity_valid check (
    (requester_type = 'customer' and customer_id is not null and requesting_area is null)
    or (requester_type = 'internal' and customer_id is null
      and requesting_area is not null and char_length(btrim(requesting_area)) between 2 and 180)
  ),
  add constraint repairs_equipment_identity_valid check (
    (equipment_type = 'catalog' and product_id is not null and external_equipment_description is null)
    or (equipment_type = 'external' and product_id is null
      and external_equipment_description is not null
      and char_length(btrim(external_equipment_description)) between 2 and 240)
  );

comment on column public.repairs.requester_type is 'customer: cliente registrado; internal: área solicitante sin crear un cliente ficticio.';
comment on column public.repairs.equipment_type is 'catalog: referencia al catálogo; external: equipo recibido sin crear stock ni un producto ficticio.';

create or replace function public.validate_repair_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
  customer_row public.customers%rowtype;
begin
  new.serial_number := nullif(btrim(new.serial_number), '');
  new.requesting_area := nullif(btrim(new.requesting_area), '');
  new.external_equipment_description := nullif(btrim(new.external_equipment_description), '');

  if new.equipment_type = 'catalog' then
    if new.product_id is null then
      raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_REQUIRED';
    end if;
    select product.* into product_row
    from public.products product
    where product.organization_id = new.organization_id and product.id = new.product_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_NOT_FOUND';
    end if;
    if (tg_op = 'INSERT' or new.product_id is distinct from old.product_id)
      and not product_row.is_active then
      raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_UNAVAILABLE';
    end if;
    if tg_op = 'INSERT' or new.product_id is distinct from old.product_id then
      new.serial_control_snapshot := product_row.serial_control;
    else
      new.serial_control_snapshot := old.serial_control_snapshot;
    end if;
    if new.serial_control_snapshot <> (new.serial_number is not null) then
      raise exception using errcode = 'P0001', message = 'REPAIR_SERIAL_NUMBER_RULE_VIOLATION';
    end if;
  elsif new.equipment_type = 'external' then
    if new.product_id is not null or new.external_equipment_description is null
      or char_length(new.external_equipment_description) not between 2 and 240 then
      raise exception using errcode = 'P0001', message = 'REPAIR_EXTERNAL_EQUIPMENT_INVALID';
    end if;
    -- An external serial is optional descriptive identity, not a stock setting.
    new.serial_control_snapshot := false;
  else
    raise exception using errcode = 'P0001', message = 'REPAIR_EQUIPMENT_TYPE_INVALID';
  end if;

  if new.requester_type = 'customer' then
    if new.customer_id is null then
      raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_REQUIRED';
    end if;
    if tg_op = 'INSERT' or new.customer_id is distinct from old.customer_id then
      select customer.* into customer_row
      from public.customers customer
      where customer.organization_id = new.organization_id and customer.id = new.customer_id;
      if not found then
        raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_NOT_FOUND';
      end if;
      if not customer_row.is_active then
        raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_UNAVAILABLE';
      end if;
    end if;
  elsif new.requester_type = 'internal' then
    if new.customer_id is not null or new.requesting_area is null
      or char_length(new.requesting_area) not between 2 and 180 then
      raise exception using errcode = 'P0001', message = 'REPAIR_REQUESTING_AREA_INVALID';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'REPAIR_REQUESTER_TYPE_INVALID';
  end if;

  if new.assigned_technician_id is not null
    and (tg_op = 'INSERT' or new.assigned_technician_id is distinct from old.assigned_technician_id)
    and not public.repair_technician_is_active(new.organization_id, new.assigned_technician_id)
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_TECHNICIAN_UNAVAILABLE';
  end if;
  return new;
end;
$$;

create or replace function public.create_repair_unchecked(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  customer_id uuid := nullif(payload ->> 'customer_id', '')::uuid;
  product_id uuid := nullif(payload ->> 'product_id', '')::uuid;
  assigned_technician_id uuid := nullif(payload ->> 'assigned_technician_id', '')::uuid;
  requester_type_value text := coalesce(payload ->> 'requester_type', 'customer');
  requesting_area_value text := nullif(btrim(payload ->> 'requesting_area'), '');
  equipment_type_value text := coalesce(payload ->> 'equipment_type', 'catalog');
  external_description_value text := nullif(btrim(payload ->> 'external_equipment_description'), '');
  received_at_value timestamptz := coalesce(nullif(payload ->> 'received_at', '')::timestamptz, now());
  repair_status text := coalesce(nullif(lower(btrim(payload ->> 'status')), ''), 'received');
  priority_value text := coalesce(nullif(lower(btrim(payload ->> 'priority')), ''), 'normal');
  problem_value text := btrim(payload ->> 'problem_description');
  customer_row public.customers%rowtype;
  product_row public.products%rowtype;
  repair_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_CREATE');
  if repair_status not in ('received', 'warranty') then
    raise exception using errcode = 'P0001', message = 'REPAIR_INITIAL_STATUS_INVALID';
  end if;
  if requester_type_value = 'customer' then
    if customer_id is null then
      raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_REQUIRED';
    end if;
    select customer.* into customer_row from public.customers customer
    where customer.organization_id = organization_id and customer.id = customer_id and customer.is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_UNAVAILABLE';
    end if;
  elsif requester_type_value <> 'internal' then
    raise exception using errcode = 'P0001', message = 'REPAIR_REQUESTER_TYPE_INVALID';
  end if;
  if equipment_type_value = 'catalog' then
    if product_id is null then
      raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_REQUIRED';
    end if;
    select product.* into product_row from public.products product
    where product.organization_id = organization_id and product.id = product_id and product.is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_UNAVAILABLE';
    end if;
  elsif equipment_type_value <> 'external' then
    raise exception using errcode = 'P0001', message = 'REPAIR_EQUIPMENT_TYPE_INVALID';
  end if;
  if assigned_technician_id is not null then
    perform public.assert_repair_actor(organization_id, 'REPAIRS_ASSIGN');
    if not public.repair_technician_is_active(organization_id, assigned_technician_id) then
      raise exception using errcode = 'P0001', message = 'REPAIR_TECHNICIAN_UNAVAILABLE';
    end if;
  end if;
  if problem_value is null or char_length(problem_value) < 3 then
    raise exception using errcode = 'P0001', message = 'REPAIR_PROBLEM_REQUIRED';
  end if;

  insert into public.repairs (
    organization_id, customer_id, product_id, requester_type, requesting_area,
    equipment_type, external_equipment_description, serial_number, received_at,
    estimated_delivery_date, status, priority, problem_description,
    notes, customer_reference, sale_document_id, warranty_reference,
    assigned_technician_id, customer_name_snapshot, customer_document_snapshot,
    product_code_snapshot, product_description_snapshot, created_by, updated_by
  ) values (
    organization_id, customer_id, product_id, requester_type_value, requesting_area_value,
    equipment_type_value, external_description_value, nullif(btrim(payload ->> 'serial_number'), ''), received_at_value,
    nullif(payload ->> 'estimated_delivery_date', '')::date, repair_status, priority_value, problem_value,
    nullif(btrim(payload ->> 'notes'), ''), nullif(btrim(payload ->> 'customer_reference'), ''),
    nullif(payload ->> 'sale_document_id', '')::uuid, nullif(btrim(payload ->> 'warranty_reference'), ''),
    assigned_technician_id,
    case when requester_type_value = 'internal' then requesting_area_value
      else coalesce(nullif(btrim(customer_row.trade_name), ''), btrim(customer_row.legal_name)) end,
    case when requester_type_value = 'internal' then 'INTERNO'
      else customer_row.document_type || ' ' || customer_row.document_number end,
    case when equipment_type_value = 'external' then 'EXTERNO' else product_row.code end,
    case when equipment_type_value = 'external' then external_description_value else product_row.description end,
    actor_id, actor_id
  ) returning id into repair_id;
  perform public.record_repair_event(
    organization_id, repair_id, 'CREATED', null, repair_status, actor_id, null,
    jsonb_build_object('repair_code', (select repair.repair_code from public.repairs repair where repair.id = repair_id),
      'requester_type', requester_type_value, 'equipment_type', equipment_type_value), 'REPAIR_CREATED'
  );
  return repair_id;
end;
$$;

-- Public update_repair continues to assert permission, lock expected_lock_version,
-- invoke this implementation and advance the aggregate exactly once.
create or replace function public.update_repair_unchecked(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id uuid := nullif(payload ->> 'id', '')::uuid;
  old_repair public.repairs%rowtype;
  next_repair public.repairs%rowtype;
  customer_row public.customers%rowtype;
  product_row public.products%rowtype;
  created_status text;
  has_created_event boolean;
  identity_changed boolean;
  identity_locked boolean;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');
  select repair.* into old_repair from public.repairs repair
  where repair.organization_id = organization_id and repair.id = repair_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if old_repair.status in ('delivered', 'cancelled', 'rejected') then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_EDITABLE';
  end if;
  if payload ? 'status' and (payload ->> 'status') is distinct from old_repair.status then
    raise exception using errcode = 'P0001', message = 'REPAIR_STATUS_USE_STATUS_RPC';
  end if;
  if payload ? 'assigned_technician_id' then
    raise exception using errcode = 'P0001', message = 'REPAIR_ASSIGN_USE_ASSIGN_RPC';
  end if;
  if payload ? 'received_at' and (payload ->> 'received_at')::timestamptz is distinct from old_repair.received_at then
    raise exception using errcode = 'P0001', message = 'REPAIR_RECEIVED_AT_IMMUTABLE';
  end if;
  if payload ? 'diagnosis' and nullif(btrim(payload ->> 'diagnosis'), '') is distinct from old_repair.diagnosis then
    raise exception using errcode = 'P0001', message = 'REPAIR_DIAGNOSIS_USE_DIAGNOSIS_RPC';
  end if;
  if payload ? 'applied_solution' and nullif(btrim(payload ->> 'applied_solution'), '') is distinct from old_repair.applied_solution then
    raise exception using errcode = 'P0001', message = 'REPAIR_APPLIED_SOLUTION_USE_SOLUTION_RPC';
  end if;

  -- Whitelist reception properties. Client snapshots, organization, status,
  -- technical data and aggregate concurrency metadata can never be populated.
  next_repair := old_repair;
  if payload ? 'customer_id' then next_repair.customer_id := nullif(payload ->> 'customer_id', '')::uuid; end if;
  if payload ? 'product_id' then next_repair.product_id := nullif(payload ->> 'product_id', '')::uuid; end if;
  if payload ? 'requester_type' then next_repair.requester_type := payload ->> 'requester_type'; end if;
  if payload ? 'requesting_area' then next_repair.requesting_area := nullif(btrim(payload ->> 'requesting_area'), ''); end if;
  if payload ? 'equipment_type' then next_repair.equipment_type := payload ->> 'equipment_type'; end if;
  if payload ? 'external_equipment_description' then next_repair.external_equipment_description := nullif(btrim(payload ->> 'external_equipment_description'), ''); end if;
  if payload ? 'serial_number' then next_repair.serial_number := nullif(btrim(payload ->> 'serial_number'), ''); end if;
  if payload ? 'estimated_delivery_date' then next_repair.estimated_delivery_date := nullif(payload ->> 'estimated_delivery_date', '')::date; end if;
  if payload ? 'priority' then next_repair.priority := lower(btrim(payload ->> 'priority')); end if;
  if payload ? 'problem_description' then next_repair.problem_description := btrim(payload ->> 'problem_description'); end if;
  if payload ? 'notes' then next_repair.notes := nullif(btrim(payload ->> 'notes'), ''); end if;
  if payload ? 'customer_reference' then next_repair.customer_reference := nullif(btrim(payload ->> 'customer_reference'), ''); end if;
  if payload ? 'sale_document_id' then next_repair.sale_document_id := nullif(payload ->> 'sale_document_id', '')::uuid; end if;
  if payload ? 'warranty_reference' then next_repair.warranty_reference := nullif(btrim(payload ->> 'warranty_reference'), ''); end if;

  identity_changed := next_repair.customer_id is distinct from old_repair.customer_id
    or next_repair.product_id is distinct from old_repair.product_id
    or next_repair.serial_number is distinct from old_repair.serial_number
    or next_repair.requester_type is distinct from old_repair.requester_type
    or next_repair.requesting_area is distinct from old_repair.requesting_area
    or next_repair.equipment_type is distinct from old_repair.equipment_type
    or next_repair.external_equipment_description is distinct from old_repair.external_equipment_description;
  if identity_changed then
    select event.to_status into created_status from public.repair_events event
    where event.organization_id = organization_id and event.repair_id = repair_id and event.event_type = 'CREATED'
    order by event.id limit 1;
    has_created_event := found;
    identity_locked := case
      when old_repair.status = 'received' then has_created_event and created_status is distinct from 'received'
      when old_repair.status = 'warranty' then not has_created_event or created_status is distinct from 'warranty'
      else true end;
    identity_locked := identity_locked or old_repair.diagnosis is not null or old_repair.applied_solution is not null
      or exists(select 1 from public.repair_diagnostics d where d.organization_id = organization_id and d.repair_id = repair_id)
      or exists(select 1 from public.repair_quotes q where q.organization_id = organization_id and q.repair_id = repair_id)
      or exists(select 1 from public.repair_parts p where p.organization_id = organization_id and p.repair_id = repair_id)
      or exists(select 1 from public.repair_tests t where t.organization_id = organization_id and t.repair_id = repair_id)
      or exists(select 1 from public.repair_events event
        where event.organization_id = organization_id and event.repair_id = repair_id and (
          event.event_type in ('DIAGNOSIS_CREATED', 'SOLUTION_RECORDED', 'QUOTE_CREATED', 'QUOTE_SUBMITTED',
            'QUOTE_APPROVED', 'QUOTE_REJECTED', 'PART_RESERVED', 'PART_CONSUMED', 'PART_CANCELLED',
            'TEST_COMPLETED', 'DELIVERED', 'CANCELLED')
          or (event.event_type <> 'CREATED' and (event.from_status is distinct from event.to_status
            or (event.from_status is not null and event.from_status is distinct from old_repair.status)
            or (event.to_status is not null and event.to_status is distinct from old_repair.status)))
          or (event.event_type = 'CREATED' and (event.from_status is not null or event.to_status is distinct from old_repair.status))
        ));
    if identity_locked then raise exception using errcode = 'P0001', message = 'REPAIR_IDENTITY_LOCKED'; end if;
  end if;

  if next_repair.requester_type = 'internal' then
    next_repair.customer_name_snapshot := next_repair.requesting_area;
    next_repair.customer_document_snapshot := 'INTERNO';
  elsif next_repair.customer_id is distinct from old_repair.customer_id then
    select customer.* into customer_row from public.customers customer
    where customer.organization_id = organization_id and customer.id = next_repair.customer_id and customer.is_active;
    if not found then raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_UNAVAILABLE'; end if;
    next_repair.customer_name_snapshot := coalesce(nullif(btrim(customer_row.trade_name), ''), btrim(customer_row.legal_name));
    next_repair.customer_document_snapshot := customer_row.document_type || ' ' || customer_row.document_number;
  end if;
  if next_repair.equipment_type = 'external' then
    next_repair.product_code_snapshot := 'EXTERNO';
    next_repair.product_description_snapshot := next_repair.external_equipment_description;
  elsif next_repair.product_id is distinct from old_repair.product_id then
    select product.* into product_row from public.products product
    where product.organization_id = organization_id and product.id = next_repair.product_id and product.is_active;
    if not found then raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_UNAVAILABLE'; end if;
    next_repair.product_code_snapshot := product_row.code;
    next_repair.product_description_snapshot := product_row.description;
  end if;

  update public.repairs repair set
    customer_id = next_repair.customer_id, product_id = next_repair.product_id,
    requester_type = next_repair.requester_type, requesting_area = next_repair.requesting_area,
    equipment_type = next_repair.equipment_type, external_equipment_description = next_repair.external_equipment_description,
    serial_number = next_repair.serial_number, estimated_delivery_date = next_repair.estimated_delivery_date,
    priority = next_repair.priority, problem_description = next_repair.problem_description,
    notes = next_repair.notes, customer_reference = next_repair.customer_reference,
    sale_document_id = next_repair.sale_document_id, warranty_reference = next_repair.warranty_reference,
    customer_name_snapshot = next_repair.customer_name_snapshot, customer_document_snapshot = next_repair.customer_document_snapshot,
    product_code_snapshot = next_repair.product_code_snapshot, product_description_snapshot = next_repair.product_description_snapshot,
    updated_by = actor_id
  where repair.organization_id = organization_id and repair.id = repair_id
  returning repair.* into next_repair;
  perform public.record_repair_event(organization_id, repair_id, 'UPDATED', old_repair.status, next_repair.status,
    actor_id, null, jsonb_build_object('old_values', to_jsonb(old_repair), 'new_values', to_jsonb(next_repair)), 'REPAIR_UPDATED');
end;
$$;

-- Append, never reorder, the view columns to preserve existing consumers.
create or replace view public.repair_list with (security_invoker = true) as
select repair.id, repair.organization_id, repair.repair_code, repair.customer_id, repair.product_id,
  repair.serial_number, repair.received_at, repair.estimated_delivery_date, repair.delivered_at,
  repair.status, repair.priority, repair.problem_description, repair.diagnosis, repair.applied_solution,
  repair.notes, repair.customer_reference, repair.sale_document_id, repair.warranty_reference,
  repair.assigned_technician_id, repair.customer_name_snapshot, repair.customer_document_snapshot,
  repair.product_code_snapshot, repair.product_description_snapshot, repair.created_by, repair.updated_by,
  repair.created_at, repair.updated_at, repair.serial_control_snapshot, repair.lock_version,
  repair.requester_type, repair.requesting_area, repair.equipment_type, repair.external_equipment_description
from public.repairs repair;

revoke all on function public.create_repair_unchecked(jsonb), public.update_repair_unchecked(jsonb),
  public.validate_repair_row() from public, anon, authenticated, service_role;

commit;
