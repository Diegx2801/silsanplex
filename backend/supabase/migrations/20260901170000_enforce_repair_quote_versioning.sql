-- Keep exactly one current repair quote and require an explicit revision after
-- customer rejection.

begin;

set local lock_timeout = '10s';

alter table public.repair_quotes
  add column is_current boolean;

do $$
begin
  if exists (
    select 1
    from public.repairs repair
    where repair.status = 'waiting_customer_approval'
      and exists (
        select 1
        from public.repair_quotes quote
        where quote.organization_id = repair.organization_id
          and quote.repair_id = repair.id
      )
      and not exists (
        select 1
        from public.repair_quotes quote
        where quote.organization_id = repair.organization_id
          and quote.repair_id = repair.id
          and quote.status = 'pending'
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'REPAIR_QUOTE_BACKFILL_PENDING_MISSING';
  end if;

  if exists (
    select 1
    from public.repairs repair
    where repair.status = 'quote_approved'
      and exists (
        select 1
        from public.repair_quotes quote
        where quote.organization_id = repair.organization_id
          and quote.repair_id = repair.id
      )
      and not exists (
        select 1
        from public.repair_quotes quote
        where quote.organization_id = repair.organization_id
          and quote.repair_id = repair.id
          and quote.status = 'approved'
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'REPAIR_QUOTE_BACKFILL_APPROVED_MISSING';
  end if;

  if exists (
    select 1
    from public.repairs repair
    where repair.status = 'rejected'
      and exists (
        select 1
        from public.repair_quotes quote
        where quote.organization_id = repair.organization_id
          and quote.repair_id = repair.id
      )
      and not exists (
        select 1
        from public.repair_quotes quote
        where quote.organization_id = repair.organization_id
          and quote.repair_id = repair.id
          and quote.status = 'rejected'
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'REPAIR_QUOTE_BACKFILL_REJECTED_MISSING';
  end if;
end;
$$;

with ranked_quotes as (
  select
    quote.id,
    row_number() over (
      partition by quote.organization_id, quote.repair_id
      order by
        case
          when repair.status = 'waiting_customer_approval' and quote.status = 'pending' then 0
          when repair.status = 'quote_pending' and quote.status = 'draft' then 0
          when repair.status = 'quote_approved' and quote.status = 'approved' then 0
          when repair.status = 'rejected' and quote.status = 'rejected' then 0
          when repair.status in (
            'in_repair', 'awaiting_parts', 'testing', 'ready_for_delivery', 'delivered'
          ) and quote.status = 'approved' then 0
          else 1
        end,
        quote.version_number desc,
        quote.id desc
    ) as position
  from public.repair_quotes quote
  join public.repairs repair
    on repair.organization_id = quote.organization_id
   and repair.id = quote.repair_id
)
update public.repair_quotes quote
set is_current = ranked.position = 1
from ranked_quotes ranked
where ranked.id = quote.id;

alter table public.repair_quotes
  alter column is_current set default false,
  alter column is_current set not null;

create unique index repair_quotes_one_current_idx
  on public.repair_quotes (organization_id, repair_id)
  where is_current;

alter table public.repair_events
  drop constraint repair_events_event_type_valid;
alter table public.repair_events
  add constraint repair_events_event_type_valid check (
    event_type in (
      'CREATED', 'UPDATED', 'STATUS_CHANGED', 'DIAGNOSIS_CREATED', 'SOLUTION_RECORDED',
      'QUOTE_CREATED', 'QUOTE_UPDATED', 'QUOTE_REVISION_CREATED',
      'QUOTE_SUBMITTED', 'QUOTE_APPROVED', 'QUOTE_REJECTED',
      'PART_RESERVED', 'PART_CONSUMED', 'PART_CANCELLED', 'TEST_COMPLETED',
      'DELIVERED', 'CANCELLED'
    )
  );

create or replace function public.repair_status_transition_allowed(
  requested_from_status text,
  requested_to_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case requested_from_status
    when 'received' then requested_to_status in ('diagnosis', 'warranty', 'cancelled')
    when 'warranty' then requested_to_status in ('diagnosis', 'in_repair', 'cancelled')
    when 'diagnosis' then requested_to_status in (
      'quote_pending', 'waiting_customer_approval', 'in_repair', 'cancelled'
    )
    when 'quote_pending' then requested_to_status in (
      'diagnosis', 'waiting_customer_approval', 'cancelled'
    )
    when 'waiting_customer_approval' then requested_to_status in ('quote_approved', 'rejected', 'cancelled')
    when 'quote_approved' then requested_to_status in ('in_repair', 'cancelled')
    when 'in_repair' then requested_to_status in ('awaiting_parts', 'testing', 'cancelled')
    when 'awaiting_parts' then requested_to_status in ('in_repair', 'testing', 'cancelled')
    when 'testing' then requested_to_status in ('in_repair', 'ready_for_delivery', 'cancelled')
    when 'ready_for_delivery' then requested_to_status in ('in_repair', 'delivered', 'cancelled')
    when 'rejected' then requested_to_status in ('quote_pending', 'waiting_customer_approval')
    else false
  end;
$$;

create or replace function public.change_repair_status(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_status text,
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
  target_status text := lower(btrim(requested_status));
  next_cycle integer;
begin
  actor_id := public.assert_repair_actor(requested_organization_id, 'REPAIRS_CHANGE_STATUS');
  if target_status in ('quote_approved', 'rejected', 'delivered', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'REPAIR_SPECIALIZED_STATUS_REQUIRED';
  end if;

  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if repair_row.status = 'rejected' then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_REVISION_REQUIRED';
  end if;
  if not public.repair_status_transition_allowed(repair_row.status, target_status) then
    raise exception using errcode = 'P0001', message = 'REPAIR_STATUS_TRANSITION_INVALID';
  end if;
  if target_status = 'waiting_customer_approval'
    and not exists (
      select 1
      from public.repair_quotes quote
      where quote.organization_id = requested_organization_id
        and quote.repair_id = requested_repair_id
        and quote.status = 'pending'
        and quote.is_current
    )
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_PENDING_QUOTE_REQUIRED';
  end if;
  if target_status = 'ready_for_delivery' then
    perform public.assert_repair_ready_for_delivery(
      requested_organization_id, requested_repair_id
    );
  end if;

  next_cycle := case
    when target_status = 'testing' then repair_row.current_test_cycle_number + 1
    else repair_row.current_test_cycle_number
  end;

  perform set_config('app.repairs_status_write', 'true', true);
  update public.repairs repair
  set status = target_status,
      current_test_cycle_number = next_cycle,
      updated_by = actor_id
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id;
  perform set_config('app.repairs_status_write', 'false', true);

  perform public.record_repair_event(
    requested_organization_id,
    requested_repair_id,
    'STATUS_CHANGED',
    repair_row.status,
    target_status,
    actor_id,
    requested_observation,
    case
      when target_status = 'testing'
        then jsonb_build_object('test_cycle_number', next_cycle)
      else '{}'::jsonb
    end,
    'REPAIR_STATUS_CHANGED'
  );
end;
$$;

create or replace function public.write_repair_quote(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_quote_id uuid,
  requested_version_number integer,
  requested_status text,
  requested_currency text,
  requested_prices_include_tax boolean,
  requested_tax_rate numeric,
  requested_items jsonb,
  requested_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_quote_id uuid := requested_quote_id;
  item jsonb;
  line_type_value text;
  product_id_value uuid;
  description_value text;
  product_row public.products%rowtype;
begin
  if jsonb_typeof(requested_items) <> 'array'
    or jsonb_array_length(requested_items) = 0
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_ITEMS_REQUIRED';
  end if;

  if result_quote_id is null then
    insert into public.repair_quotes (
      organization_id, repair_id, version_number, status, is_current, currency,
      prices_include_tax, tax_rate, created_by, updated_by
    ) values (
      requested_organization_id, requested_repair_id, requested_version_number,
      requested_status, true, requested_currency, requested_prices_include_tax,
      requested_tax_rate, requested_actor_id, requested_actor_id
    )
    returning id into result_quote_id;
  else
    update public.repair_quotes quote
    set status = requested_status,
        currency = requested_currency,
        prices_include_tax = requested_prices_include_tax,
        tax_rate = requested_tax_rate,
        approved_by = null,
        approved_at = null,
        approval_observation = null,
        rejected_by = null,
        rejected_at = null,
        rejection_observation = null,
        updated_by = requested_actor_id
    where quote.organization_id = requested_organization_id
      and quote.repair_id = requested_repair_id
      and quote.id = result_quote_id;
  end if;

  delete from public.repair_quote_items quote_item
  where quote_item.organization_id = requested_organization_id
    and quote_item.quote_id = result_quote_id;

  for item in select value from jsonb_array_elements(requested_items)
  loop
    line_type_value := lower(btrim(item ->> 'line_type'));
    product_id_value := nullif(item ->> 'product_id', '')::uuid;
    description_value := nullif(btrim(item ->> 'description'), '');

    if line_type_value = 'part' then
      select product.*
      into product_row
      from public.products product
      where product.organization_id = requested_organization_id
        and product.id = product_id_value
        and product.is_active;
      if not found then
        raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_PRODUCT_UNAVAILABLE';
      end if;
      description_value := coalesce(description_value, product_row.description);
    end if;

    insert into public.repair_quote_items (
      organization_id, quote_id, line_type, product_id, description,
      quantity, unit_price, taxable
    ) values (
      requested_organization_id, result_quote_id, line_type_value, product_id_value,
      description_value, (item ->> 'quantity')::numeric,
      (item ->> 'unit_price')::numeric,
      coalesce((item ->> 'taxable')::boolean, true)
    );
  end loop;

  perform public.recalculate_repair_quote_totals(
    requested_organization_id, result_quote_id
  );
  return result_quote_id;
end;
$$;

create or replace function public.save_repair_quote(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id uuid := nullif(payload ->> 'repair_id', '')::uuid;
  quote_id uuid := nullif(payload ->> 'id', '')::uuid;
  version_number_value integer;
  quote_status text;
  currency_value text := coalesce(nullif(upper(btrim(payload ->> 'currency')), ''), 'PEN');
  include_tax boolean := coalesce((payload ->> 'prices_include_tax')::boolean, false);
  tax_rate_value numeric := coalesce(nullif(payload ->> 'tax_rate', '')::numeric, 0);
  submit_quote boolean := coalesce((payload ->> 'submit')::boolean, false);
  items_value jsonb := payload -> 'items';
  repair_row public.repairs%rowtype;
  quote_row public.repair_quotes%rowtype;
  old_status text;
  new_status text;
  is_new_quote boolean := false;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');
  if jsonb_typeof(items_value) <> 'array' or jsonb_array_length(items_value) = 0 then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_ITEMS_REQUIRED';
  end if;

  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = organization_id and repair.id = repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if repair_row.status not in ('diagnosis', 'quote_pending') then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_STATE_INVALID';
  end if;
  old_status := repair_row.status;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(organization_id::text || ':quote:' || repair_id::text, 0)
  );

  if quote_id is null then
    if exists (
      select 1
      from public.repair_quotes quote
      where quote.organization_id = organization_id
        and quote.repair_id = repair_id
    ) then
      raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_REVISION_REQUIRED';
    end if;
    version_number_value := 1;
    is_new_quote := true;
  else
    select quote.*
    into quote_row
    from public.repair_quotes quote
    where quote.organization_id = organization_id
      and quote.id = quote_id
      and quote.repair_id = repair_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_NOT_FOUND';
    end if;
    if not quote_row.is_current then
      raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_STALE_VERSION';
    end if;
    if quote_row.status <> 'draft' then
      raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_NOT_EDITABLE';
    end if;
    version_number_value := quote_row.version_number;
  end if;

  quote_status := case when submit_quote then 'pending' else 'draft' end;
  quote_id := public.write_repair_quote(
    organization_id,
    repair_id,
    quote_id,
    version_number_value,
    quote_status,
    currency_value,
    include_tax,
    tax_rate_value,
    items_value,
    actor_id
  );

  new_status := case when submit_quote then 'waiting_customer_approval' else 'quote_pending' end;
  if old_status is distinct from new_status then
    perform set_config('app.repairs_status_write', 'true', true);
    update public.repairs repair
    set status = new_status, updated_by = actor_id
    where repair.organization_id = organization_id and repair.id = repair_id;
    perform set_config('app.repairs_status_write', 'false', true);
  end if;

  perform public.record_repair_event(
    organization_id,
    repair_id,
    case when is_new_quote then 'QUOTE_CREATED' else 'QUOTE_UPDATED' end,
    old_status,
    new_status,
    actor_id,
    null,
    jsonb_build_object(
      'quote_id', quote_id,
      'version_number', version_number_value,
      'created', is_new_quote,
      'submitted', submit_quote
    ),
    case when is_new_quote then 'REPAIR_QUOTE_CREATED' else 'REPAIR_QUOTE_UPDATED' end
  );

  if submit_quote then
    perform public.record_repair_event(
      organization_id,
      repair_id,
      'QUOTE_SUBMITTED',
      new_status,
      new_status,
      actor_id,
      null,
      jsonb_build_object('quote_id', quote_id, 'version_number', version_number_value),
      'REPAIR_QUOTE_SUBMITTED'
    );
  end if;

  return quote_id;
end;
$$;

create function public.revise_repair_quote(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id uuid := nullif(payload ->> 'repair_id', '')::uuid;
  rejected_quote_id uuid := nullif(payload ->> 'rejected_quote_id', '')::uuid;
  new_quote_id uuid;
  version_number_value integer;
  quote_status text;
  currency_value text := coalesce(nullif(upper(btrim(payload ->> 'currency')), ''), 'PEN');
  include_tax boolean := coalesce((payload ->> 'prices_include_tax')::boolean, false);
  tax_rate_value numeric := coalesce(nullif(payload ->> 'tax_rate', '')::numeric, 0);
  submit_quote boolean := coalesce((payload ->> 'submit')::boolean, false);
  items_value jsonb := payload -> 'items';
  repair_row public.repairs%rowtype;
  rejected_quote_row public.repair_quotes%rowtype;
  new_status text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');
  if jsonb_typeof(items_value) <> 'array' or jsonb_array_length(items_value) = 0 then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_ITEMS_REQUIRED';
  end if;

  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = organization_id
    and repair.id = repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if repair_row.status <> 'rejected' then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_REVISION_STATE_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(organization_id::text || ':quote:' || repair_id::text, 0)
  );

  select quote.*
  into rejected_quote_row
  from public.repair_quotes quote
  where quote.organization_id = organization_id
    and quote.repair_id = repair_id
    and quote.id = rejected_quote_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_NOT_FOUND';
  end if;
  if not rejected_quote_row.is_current then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_STALE_VERSION';
  end if;
  if rejected_quote_row.status <> 'rejected' then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_REVISION_BASE_INVALID';
  end if;

  select coalesce(max(quote.version_number), 0) + 1
  into version_number_value
  from public.repair_quotes quote
  where quote.organization_id = organization_id
    and quote.repair_id = repair_id;

  update public.repair_quotes quote
  set is_current = false,
      updated_by = actor_id
  where quote.organization_id = organization_id
    and quote.id = rejected_quote_id;

  quote_status := case when submit_quote then 'pending' else 'draft' end;
  new_quote_id := public.write_repair_quote(
    organization_id,
    repair_id,
    null,
    version_number_value,
    quote_status,
    currency_value,
    include_tax,
    tax_rate_value,
    items_value,
    actor_id
  );

  new_status := case when submit_quote then 'waiting_customer_approval' else 'quote_pending' end;
  perform set_config('app.repairs_status_write', 'true', true);
  update public.repairs repair
  set status = new_status, updated_by = actor_id
  where repair.organization_id = organization_id
    and repair.id = repair_id;
  perform set_config('app.repairs_status_write', 'false', true);

  perform public.record_repair_event(
    organization_id,
    repair_id,
    'QUOTE_REVISION_CREATED',
    repair_row.status,
    new_status,
    actor_id,
    null,
    jsonb_build_object(
      'quote_id', new_quote_id,
      'version_number', version_number_value,
      'rejected_quote_id', rejected_quote_id,
      'rejected_version_number', rejected_quote_row.version_number,
      'submitted', submit_quote
    ),
    'REPAIR_QUOTE_REVISION_CREATED'
  );

  if submit_quote then
    perform public.record_repair_event(
      organization_id,
      repair_id,
      'QUOTE_SUBMITTED',
      new_status,
      new_status,
      actor_id,
      null,
      jsonb_build_object('quote_id', new_quote_id, 'version_number', version_number_value),
      'REPAIR_QUOTE_SUBMITTED'
    );
  end if;

  return new_quote_id;
end;
$$;

create or replace function public.approve_repair_quote(
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
begin
  actor_id := public.assert_repair_actor(requested_organization_id, 'REPAIRS_APPROVE_QUOTE');
  select repair.* into repair_row
  from public.repairs repair
  where repair.organization_id = requested_organization_id and repair.id = requested_repair_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_row.status <> 'waiting_customer_approval' then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_APPROVAL_STATE_INVALID';
  end if;

  select quote.* into quote_row
  from public.repair_quotes quote
  where quote.organization_id = requested_organization_id
    and quote.id = requested_quote_id
    and quote.repair_id = requested_repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_NOT_FOUND';
  end if;
  if not quote_row.is_current then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_STALE_VERSION';
  end if;
  if quote_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_NOT_PENDING';
  end if;

  update public.repair_quotes quote
  set status = 'approved', approved_by = actor_id, approved_at = now(),
      approval_observation = nullif(btrim(requested_observation), ''), updated_by = actor_id
  where quote.organization_id = requested_organization_id and quote.id = requested_quote_id;

  perform set_config('app.repairs_status_write', 'true', true);
  update public.repairs repair
  set status = 'quote_approved', updated_by = actor_id
  where repair.organization_id = requested_organization_id and repair.id = requested_repair_id;
  perform set_config('app.repairs_status_write', 'false', true);

  perform public.record_repair_event(
    requested_organization_id,
    requested_repair_id,
    'QUOTE_APPROVED',
    repair_row.status,
    'quote_approved',
    actor_id,
    requested_observation,
    jsonb_build_object('quote_id', requested_quote_id, 'version_number', quote_row.version_number),
    'REPAIR_QUOTE_APPROVED'
  );
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
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_NOT_FOUND';
  end if;
  if not quote_row.is_current then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_STALE_VERSION';
  end if;
  if quote_row.status <> 'pending' then
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

revoke all on function public.write_repair_quote(
  uuid, uuid, uuid, integer, text, text, boolean, numeric, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.revise_repair_quote(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.revise_repair_quote(jsonb)
  to authenticated, service_role;

comment on column public.repair_quotes.is_current is
  'Identifica la unica version vigente de la cotizacion para la reparacion.';
comment on function public.revise_repair_quote(jsonb) is
  'Crea atomicamente la siguiente version desde la cotizacion rechazada vigente.';

commit;
