-- External custody and explicit post-service warranty are repair aggregate commands.
-- Neither operation represents a purchase or an inventory movement.
begin;

create table public.repair_external_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repair_id uuid not null,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_name_snapshot text not null,
  description text not null check (char_length(btrim(description)) between 3 and 2000),
  sent_at timestamptz not null default now(),
  expected_return_date date,
  returned_at timestamptz,
  cost_amount numeric(14,2),
  currency text not null default 'PEN' check (currency in ('PEN', 'USD')),
  created_by uuid references auth.users(id) on delete set null,
  received_by uuid references auth.users(id) on delete set null,
  constraint repair_external_services_repair_fk foreign key (organization_id, repair_id)
    references public.repairs(organization_id, id) on delete restrict,
  constraint repair_external_services_return_valid check (
    (returned_at is null and cost_amount is null and received_by is null)
    or (returned_at is not null and cost_amount is not null
      and returned_at >= sent_at and cost_amount >= 0 and cost_amount <= 999999999999.99)
  ),
  constraint repair_external_services_expected_date_valid check (
    expected_return_date is null or expected_return_date >= (sent_at at time zone 'America/Lima')::date
  )
);
create unique index repair_external_services_one_outstanding_idx
  on public.repair_external_services(organization_id, repair_id) where returned_at is null;
create index repair_external_services_repair_idx
  on public.repair_external_services(organization_id, repair_id, sent_at desc, id);

create table public.repair_service_warranties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repair_id uuid not null,
  warranty_days integer not null check (warranty_days between 1 and 3650),
  coverage text not null check (char_length(btrim(coverage)) between 3 and 2000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repair_service_warranties_repair_fk foreign key (organization_id, repair_id)
    references public.repairs(organization_id, id) on delete restrict,
  constraint repair_service_warranties_one_per_repair unique (organization_id, repair_id)
);

alter table public.repair_external_services enable row level security;
alter table public.repair_service_warranties enable row level security;
create policy repair_external_services_select_authorized on public.repair_external_services
for select to authenticated using (
  (select public.current_auth_session_is_active())
  and (select public.has_organization_permission(organization_id, 'REPAIRS_VIEW'))
);
create policy repair_service_warranties_select_authorized on public.repair_service_warranties
for select to authenticated using (
  (select public.current_auth_session_is_active())
  and (select public.has_organization_permission(organization_id, 'REPAIRS_VIEW'))
);
revoke all on public.repair_external_services, public.repair_service_warranties
  from public, anon, authenticated, service_role;
grant select on public.repair_external_services, public.repair_service_warranties to authenticated, service_role;

create view public.repair_service_warranty_details with (security_invoker = true) as
select warranty.*, repair.delivered_at as starts_at,
  repair.delivered_at + pg_catalog.make_interval(days => warranty.warranty_days) as ends_at
from public.repair_service_warranties warranty
join public.repairs repair on repair.organization_id = warranty.organization_id and repair.id = warranty.repair_id;
revoke all on public.repair_service_warranty_details from public, anon, authenticated, service_role;
grant select on public.repair_service_warranty_details to authenticated, service_role;

-- Extend prior checks without losing event/command types added by other repair blocks.
do $$
declare definition text;
begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid = 'public.repair_command_operations'::regclass
      and conname = 'repair_command_operations_command_type_valid';
  alter table public.repair_command_operations drop constraint repair_command_operations_command_type_valid;
  execute 'alter table public.repair_command_operations add constraint repair_command_operations_command_type_valid check (('
    || substr(definition, 7) || ') or command_type in (''send_repair_external_service'', ''receive_repair_external_service'', ''configure_repair_service_warranty''))';
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid = 'public.repair_events'::regclass and conname = 'repair_events_event_type_valid';
  alter table public.repair_events drop constraint repair_events_event_type_valid;
  execute 'alter table public.repair_events add constraint repair_events_event_type_valid check (('
    || substr(definition, 7) || ') or event_type in (''EXTERNAL_SERVICE_SENT'', ''EXTERNAL_SERVICE_RECEIVED'', ''SERVICE_WARRANTY_CONFIGURED''))';
end;
$$;

create function public.send_repair_external_service(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  repair_id_value uuid;
  operation uuid;
  actor uuid;
  result uuid;
  repair public.repairs%rowtype;
  supplier public.suppliers%rowtype;
  description_value text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  org := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id_value := nullif(payload ->> 'repair_id', '')::uuid;
  operation := nullif(payload ->> 'operation_key', '')::uuid;
  actor := public.assert_repair_actor(org, 'REPAIRS_UPDATE');
  result := public.replay_repair_command(org, operation, 'send_repair_external_service', payload);
  if result is not null then return result; end if;
  perform public.lock_repair_version(org, repair_id_value, nullif(payload ->> 'expected_lock_version', '')::bigint);
  select * into repair from public.repairs where organization_id = org and id = repair_id_value;
  if repair.status not in ('diagnosis', 'quote_approved', 'in_repair') then
    raise exception using errcode = 'P0001', message = 'REPAIR_EXTERNAL_SERVICE_STATE_INVALID';
  end if;
  if exists (select 1 from public.repair_external_services where organization_id = org
    and repair_id = repair_id_value and returned_at is null) then
    raise exception using errcode = 'P0001', message = 'REPAIR_EXTERNAL_SERVICE_OUTSTANDING';
  end if;
  select * into supplier from public.suppliers where organization_id = org
    and id = nullif(payload ->> 'supplier_id', '')::uuid and is_active for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_EXTERNAL_SUPPLIER_INVALID';
  end if;
  description_value := nullif(btrim(payload ->> 'description'), '');
  if description_value is null or char_length(description_value) not between 3 and 2000 then
    raise exception using errcode = '22023', message = 'REPAIR_EXTERNAL_DESCRIPTION_INVALID';
  end if;
  insert into public.repair_external_services(organization_id, repair_id, supplier_id,
    supplier_name_snapshot, description, expected_return_date, created_by)
  values (org, repair_id_value, supplier.id, supplier.business_name, description_value,
    nullif(payload ->> 'expected_return_date', '')::date, actor) returning id into result;
  perform public.record_repair_event(org, repair_id_value, 'EXTERNAL_SERVICE_SENT', repair.status,
    repair.status, actor, null, jsonb_build_object('external_service_id', result, 'supplier_id', supplier.id,
    'supplier_name', supplier.business_name, 'description', description_value), 'REPAIR_EXTERNAL_SERVICE_SENT');
  perform public.advance_repair_version(org, repair_id_value);
  perform public.complete_repair_command(org, operation, 'send_repair_external_service', payload, result);
  return result;
end;
$$;

create function public.receive_repair_external_service(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  repair_id_value uuid;
  operation uuid;
  actor uuid;
  result uuid;
  repair public.repairs%rowtype;
  service public.repair_external_services%rowtype;
  amount numeric;
  currency_value text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  org := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id_value := nullif(payload ->> 'repair_id', '')::uuid;
  operation := nullif(payload ->> 'operation_key', '')::uuid;
  actor := public.assert_repair_actor(org, 'REPAIRS_UPDATE');
  result := public.replay_repair_command(org, operation, 'receive_repair_external_service', payload);
  if result is not null then return result; end if;
  perform public.lock_repair_version(org, repair_id_value, nullif(payload ->> 'expected_lock_version', '')::bigint);
  select * into repair from public.repairs where organization_id = org and id = repair_id_value;
  select * into service from public.repair_external_services where organization_id = org
    and repair_id = repair_id_value and id = nullif(payload ->> 'external_service_id', '')::uuid for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_EXTERNAL_SERVICE_NOT_FOUND'; end if;
  if service.returned_at is not null then
    raise exception using errcode = 'P0001', message = 'REPAIR_EXTERNAL_SERVICE_ALREADY_RECEIVED';
  end if;
  amount := nullif(payload ->> 'cost_amount', '')::numeric;
  currency_value := upper(btrim(payload ->> 'currency'));
  if amount is null or amount < 0 or amount > 999999999999.99 or amount <> round(amount, 2)
    or currency_value is null or currency_value not in ('PEN', 'USD') then
    raise exception using errcode = '22023', message = 'REPAIR_EXTERNAL_COST_INVALID';
  end if;
  update public.repair_external_services set returned_at = now(), received_by = actor,
    cost_amount = amount, currency = currency_value where id = service.id;
  perform public.record_repair_event(org, repair_id_value, 'EXTERNAL_SERVICE_RECEIVED', repair.status,
    repair.status, actor, null, jsonb_build_object('external_service_id', service.id,
    'cost_amount', amount, 'currency', currency_value), 'REPAIR_EXTERNAL_SERVICE_RECEIVED');
  perform public.advance_repair_version(org, repair_id_value);
  perform public.complete_repair_command(org, operation, 'receive_repair_external_service', payload, service.id);
  return service.id;
end;
$$;

create function public.configure_repair_service_warranty(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  repair_id_value uuid;
  operation uuid;
  actor uuid;
  result uuid;
  repair public.repairs%rowtype;
  days integer;
  coverage_value text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  org := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id_value := nullif(payload ->> 'repair_id', '')::uuid;
  operation := nullif(payload ->> 'operation_key', '')::uuid;
  actor := public.assert_repair_actor(org, 'REPAIRS_DELIVER');
  result := public.replay_repair_command(org, operation, 'configure_repair_service_warranty', payload);
  if result is not null then return result; end if;
  perform public.lock_repair_version(org, repair_id_value, nullif(payload ->> 'expected_lock_version', '')::bigint);
  select * into repair from public.repairs where organization_id = org and id = repair_id_value;
  if repair.status not in ('ready_for_delivery', 'delivered') then
    raise exception using errcode = 'P0001', message = 'REPAIR_SERVICE_WARRANTY_STATE_INVALID';
  end if;
  if repair.status = 'delivered' and exists (select 1 from public.repair_service_warranties
    where organization_id = org and repair_id = repair_id_value) then
    raise exception using errcode = 'P0001', message = 'REPAIR_SERVICE_WARRANTY_IMMUTABLE';
  end if;
  days := nullif(payload ->> 'warranty_days', '')::integer;
  coverage_value := nullif(btrim(payload ->> 'coverage'), '');
  if days is null or days not between 1 and 3650 or coverage_value is null
    or char_length(coverage_value) not between 3 and 2000 then
    raise exception using errcode = '22023', message = 'REPAIR_SERVICE_WARRANTY_INVALID';
  end if;
  insert into public.repair_service_warranties(organization_id, repair_id, warranty_days, coverage, created_by, updated_by)
  values (org, repair_id_value, days, coverage_value, actor, actor)
  on conflict (organization_id, repair_id) do update set warranty_days = excluded.warranty_days,
    coverage = excluded.coverage, updated_by = actor, updated_at = now() returning id into result;
  perform public.record_repair_event(org, repair_id_value, 'SERVICE_WARRANTY_CONFIGURED', repair.status,
    repair.status, actor, null, jsonb_build_object('warranty_days', days, 'coverage', coverage_value),
    'REPAIR_SERVICE_WARRANTY_CONFIGURED');
  perform public.advance_repair_version(org, repair_id_value);
  perform public.complete_repair_command(org, operation, 'configure_repair_service_warranty', payload, result);
  return result;
end;
$$;

-- Existing commands retain their guards; add only the physical custody invariant.
create function public.guard_repair_external_custody()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status in ('ready_for_delivery', 'delivered', 'cancelled', 'rejected')
    and exists (select 1 from public.repair_external_services
      where organization_id = old.organization_id and repair_id = old.id and returned_at is null) then
    raise exception using errcode = 'P0001', message = 'REPAIR_EXTERNAL_SERVICE_OUTSTANDING';
  end if;
  return new;
end;
$$;
create trigger repairs_guard_external_custody before update of status on public.repairs
for each row execute function public.guard_repair_external_custody();

revoke all on function public.guard_repair_external_custody() from public, anon, authenticated, service_role;
revoke all on function public.send_repair_external_service(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.receive_repair_external_service(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.configure_repair_service_warranty(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.send_repair_external_service(jsonb) to authenticated, service_role;
grant execute on function public.receive_repair_external_service(jsonb) to authenticated, service_role;
grant execute on function public.configure_repair_service_warranty(jsonb) to authenticated, service_role;

comment on table public.repair_external_services is 'Custodia temporal del equipo con un proveedor externo. No crea compras ni mueve inventario.';
comment on table public.repair_service_warranties is 'Garantía explícita del trabajo realizado, distinta de la garantía de ingreso del equipo. Inicia en delivered_at.';
commit;
