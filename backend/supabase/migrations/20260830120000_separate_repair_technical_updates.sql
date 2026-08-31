-- Separate technical repair changes from the general update path.

begin;

alter table public.repair_events
  drop constraint repair_events_event_type_valid;

alter table public.repair_events
  add constraint repair_events_event_type_valid check (
    event_type in (
      'CREATED', 'UPDATED', 'STATUS_CHANGED', 'DIAGNOSIS_CREATED',
      'SOLUTION_RECORDED', 'QUOTE_CREATED', 'QUOTE_SUBMITTED',
      'QUOTE_APPROVED', 'QUOTE_REJECTED', 'PART_RESERVED', 'PART_CONSUMED',
      'PART_CANCELLED', 'TEST_COMPLETED', 'DELIVERED', 'CANCELLED'
    )
  );

create or replace function public.update_repair(payload jsonb)
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
  new_repair public.repairs%rowtype;
  customer_row public.customers%rowtype;
  product_row public.products%rowtype;
  customer_id_value uuid;
  product_id_value uuid;
  serial_number_value text;
  estimated_delivery_date_value date;
  priority_value text;
  problem_value text;
  notes_value text;
  customer_reference_value text;
  sale_document_id_value uuid;
  warranty_reference_value text;
  customer_name_snapshot_value text;
  customer_document_snapshot_value text;
  product_code_snapshot_value text;
  product_description_snapshot_value text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');

  select repair.*
  into old_repair
  from public.repairs repair
  where repair.organization_id = organization_id
    and repair.id = repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
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
  if payload ? 'diagnosis'
    and nullif(btrim(payload ->> 'diagnosis'), '') is distinct from old_repair.diagnosis
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_DIAGNOSIS_USE_DIAGNOSIS_RPC';
  end if;
  if payload ? 'applied_solution'
    and nullif(btrim(payload ->> 'applied_solution'), '') is distinct from old_repair.applied_solution
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_APPLIED_SOLUTION_USE_SOLUTION_RPC';
  end if;

  customer_id_value := old_repair.customer_id;
  if payload ? 'customer_id' then
    customer_id_value := nullif(payload ->> 'customer_id', '')::uuid;
  end if;
  product_id_value := old_repair.product_id;
  if payload ? 'product_id' then
    product_id_value := nullif(payload ->> 'product_id', '')::uuid;
  end if;
  serial_number_value := old_repair.serial_number;
  if payload ? 'serial_number' then
    serial_number_value := nullif(btrim(payload ->> 'serial_number'), '');
  end if;
  estimated_delivery_date_value := old_repair.estimated_delivery_date;
  if payload ? 'estimated_delivery_date' then
    estimated_delivery_date_value := nullif(payload ->> 'estimated_delivery_date', '')::date;
  end if;
  priority_value := old_repair.priority;
  if payload ? 'priority' then
    priority_value := lower(btrim(payload ->> 'priority'));
  end if;
  problem_value := old_repair.problem_description;
  if payload ? 'problem_description' then problem_value := btrim(payload ->> 'problem_description'); end if;
  notes_value := old_repair.notes;
  if payload ? 'notes' then notes_value := nullif(btrim(payload ->> 'notes'), ''); end if;
  customer_reference_value := old_repair.customer_reference;
  if payload ? 'customer_reference' then customer_reference_value := nullif(btrim(payload ->> 'customer_reference'), ''); end if;
  sale_document_id_value := old_repair.sale_document_id;
  if payload ? 'sale_document_id' then sale_document_id_value := nullif(payload ->> 'sale_document_id', '')::uuid; end if;
  warranty_reference_value := old_repair.warranty_reference;
  if payload ? 'warranty_reference' then warranty_reference_value := nullif(btrim(payload ->> 'warranty_reference'), ''); end if;

  if customer_id_value is distinct from old_repair.customer_id then
    select customer.*
    into customer_row
    from public.customers customer
    where customer.organization_id = organization_id
      and customer.id = customer_id_value
      and customer.is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_UNAVAILABLE';
    end if;
    customer_name_snapshot_value := coalesce(nullif(btrim(customer_row.trade_name), ''), btrim(customer_row.legal_name));
    customer_document_snapshot_value := customer_row.document_type || ' ' || customer_row.document_number;
  else
    customer_name_snapshot_value := old_repair.customer_name_snapshot;
    customer_document_snapshot_value := old_repair.customer_document_snapshot;
  end if;

  if product_id_value is distinct from old_repair.product_id then
    select product.*
    into product_row
    from public.products product
    where product.organization_id = organization_id
      and product.id = product_id_value
      and product.is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_UNAVAILABLE';
    end if;
    product_code_snapshot_value := product_row.code;
    product_description_snapshot_value := product_row.description;
  else
    product_code_snapshot_value := old_repair.product_code_snapshot;
    product_description_snapshot_value := old_repair.product_description_snapshot;
  end if;

  update public.repairs repair
  set customer_id = customer_id_value,
      product_id = product_id_value,
      serial_number = serial_number_value,
      estimated_delivery_date = estimated_delivery_date_value,
      priority = priority_value,
      problem_description = problem_value,
      notes = notes_value,
      customer_reference = customer_reference_value,
      sale_document_id = sale_document_id_value,
      warranty_reference = warranty_reference_value,
      customer_name_snapshot = customer_name_snapshot_value,
      customer_document_snapshot = customer_document_snapshot_value,
      product_code_snapshot = product_code_snapshot_value,
      product_description_snapshot = product_description_snapshot_value,
      updated_by = actor_id
  where repair.organization_id = organization_id
    and repair.id = repair_id;

  select repair.* into new_repair
  from public.repairs repair
  where repair.organization_id = organization_id and repair.id = repair_id;

  perform public.record_repair_event(
    organization_id,
    repair_id,
    'UPDATED',
    old_repair.status,
    new_repair.status,
    actor_id,
    null,
    jsonb_build_object('old_values', to_jsonb(old_repair), 'new_values', to_jsonb(new_repair)),
    'REPAIR_UPDATED'
  );
end;
$$;

create function public.record_repair_solution(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid;
  repair_id uuid;
  applied_solution_value text;
  repair_row public.repairs%rowtype;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;

  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  applied_solution_value := nullif(btrim(payload ->> 'applied_solution'), '');
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_CHANGE_STATUS');

  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = organization_id
    and repair.id = repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if repair_row.status in ('delivered', 'cancelled', 'rejected') then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_EDITABLE';
  end if;
  if applied_solution_value is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_APPLIED_SOLUTION_REQUIRED';
  end if;

  update public.repairs repair
  set applied_solution = applied_solution_value,
      updated_by = actor_id
  where repair.organization_id = organization_id
    and repair.id = repair_id;

  perform public.record_repair_event(
    organization_id,
    repair_id,
    'SOLUTION_RECORDED',
    repair_row.status,
    repair_row.status,
    actor_id,
    null,
    jsonb_build_object(
      'applied_solution_before', repair_row.applied_solution,
      'applied_solution_after', applied_solution_value
    ),
    'REPAIR_SOLUTION_RECORDED'
  );
end;
$$;

revoke all on function public.update_repair(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.record_repair_solution(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.update_repair(jsonb)
  to authenticated, service_role;
grant execute on function public.record_repair_solution(jsonb)
  to authenticated, service_role;

comment on function public.record_repair_solution(jsonb) is
  'Registra la solucion aplicada de una reparacion activa con evento y auditoria especializados.';

commit;
