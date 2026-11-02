-- Customer belongings are custody, never stock. All writes serialize the repair aggregate.
begin;

insert into public.permissions(code, name, description, is_directly_assignable)
values ('REPAIRS_AUTHORIZE_ACCESSORY_EXCEPTION', 'Autorizar entrega con accesorios pendientes',
  'Autorizar explícitamente una entrega con pertenencias pendientes y motivo obligatorio.', false);
insert into public.role_permissions(role_code, permission_code)
values ('ADMIN', 'REPAIRS_AUTHORIZE_ACCESSORY_EXCEPTION');

-- NULL means no structured reception was recorded; do not interpret historical notes.
alter table public.repairs add column accessories_reviewed_at timestamptz;

create table public.repair_accessories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repair_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  quantity_received integer not null check (quantity_received between 1 and 1000000),
  received_condition text check (char_length(received_condition) <= 500),
  observations text check (char_length(observations) <= 2000),
  registered_by uuid not null references auth.users(id) on delete restrict,
  registered_by_name text not null,
  registered_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  constraint repair_accessories_scope unique (organization_id, repair_id, id),
  constraint repair_accessories_repair_fk foreign key (organization_id, repair_id)
    references public.repairs(organization_id, id) on delete restrict,
  constraint repair_accessories_void_valid check ((voided_at is null and void_reason is null)
    or (voided_at is not null and char_length(btrim(void_reason)) between 1 and 2000))
);
create index repair_accessories_repair_idx on public.repair_accessories(organization_id, repair_id, registered_at, id);

create table public.repair_accessory_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repair_id uuid not null,
  accessory_id uuid not null,
  quantity integer not null check (quantity between 1 and 1000000),
  returned_by uuid not null references auth.users(id) on delete restrict,
  returned_by_name text not null,
  returned_at timestamptz not null default now(),
  observation text check (char_length(observation) <= 2000),
  operation_key uuid not null,
  constraint repair_accessory_returns_accessory_fk foreign key (organization_id, repair_id, accessory_id)
    references public.repair_accessories(organization_id, repair_id, id) on delete restrict,
  constraint repair_accessory_returns_operation_unique unique (organization_id, operation_key, accessory_id)
);
create index repair_accessory_returns_repair_idx on public.repair_accessory_returns(organization_id, repair_id, accessory_id);

alter table public.repair_accessories enable row level security;
alter table public.repair_accessory_returns enable row level security;
create policy repair_accessories_select on public.repair_accessories for select to authenticated using (
  (select public.current_auth_session_is_active())
  and (select public.has_organization_permission(organization_id, 'REPAIRS_VIEW'))
);
create policy repair_accessory_returns_select on public.repair_accessory_returns for select to authenticated using (
  (select public.current_auth_session_is_active())
  and (select public.has_organization_permission(organization_id, 'REPAIRS_VIEW'))
);
revoke all on public.repair_accessories, public.repair_accessory_returns from public, anon, authenticated, service_role;
grant select on public.repair_accessories, public.repair_accessory_returns to authenticated, service_role;

create function public.prevent_repair_accessory_return_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'REPAIR_ACCESSORY_RETURN_IMMUTABLE';
end;
$$;
create trigger repair_accessory_returns_immutable before update or delete on public.repair_accessory_returns
for each row execute function public.prevent_repair_accessory_return_mutation();

-- Preserve all event/command types introduced by earlier repair functionality.
do $$ declare definition text; begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid = 'public.repair_events'::regclass and conname = 'repair_events_event_type_valid';
  alter table public.repair_events drop constraint repair_events_event_type_valid;
  execute 'alter table public.repair_events add constraint repair_events_event_type_valid check (('
    || substr(definition, 7) || ') or event_type in (''ACCESSORY_RECEIVED'', ''ACCESSORY_UPDATED'',
      ''ACCESSORY_VOIDED'', ''ACCESSORY_RETURNED'', ''ACCESSORY_DELIVERY_EXCEPTION''))';
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid = 'public.repair_command_operations'::regclass and conname = 'repair_command_operations_command_type_valid';
  alter table public.repair_command_operations drop constraint repair_command_operations_command_type_valid;
  execute 'alter table public.repair_command_operations add constraint repair_command_operations_command_type_valid check (('
    || substr(definition, 7) || ') or command_type in (''save_repair_accessories'', ''update_repair_accessories'',
      ''record_repair_accessory_return'', ''deliver_repair_with_accessories''))';
end $$;

-- New custody commands require a real active user; no delegated actor is accepted.
create function public.assert_repair_accessory_actor(org uuid, capability text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if (auth.jwt()->>'role') is distinct from 'authenticated' or auth.uid() is null then
    raise exception using errcode = '42501', message = 'REPAIR_ACCESSORY_USER_REQUIRED';
  end if;
  return public.assert_repair_actor(org, capability);
end;
$$;

create function public.repair_accessory_quantity(value jsonb) returns integer
language plpgsql immutable set search_path = '' as $$
declare amount numeric;
begin
  if value is null or jsonb_typeof(value) <> 'number' then
    raise exception using errcode = '22023', message = 'REPAIR_ACCESSORY_QUANTITY_INVALID';
  end if;
  amount := value::text::numeric;
  if amount < 1 or amount > 1000000 or amount <> trunc(amount) then
    raise exception using errcode = '22023', message = 'REPAIR_ACCESSORY_QUANTITY_INVALID';
  end if;
  return amount::integer;
end;
$$;

-- Internal patch semantics: omitted IDs insert; existing IDs correct; void is explicit.
-- [] records a reviewed empty reception, NEVER deletes existing rows.
create function public.apply_repair_accessories(org uuid, repair uuid, items jsonb, actor uuid, operation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item jsonb; previous public.repair_accessories%rowtype; next_row public.repair_accessories%rowtype;
  accessory uuid; repair_status text; actor_name text; ids uuid[] := '{}'::uuid[]; action text; reason text;
begin
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 100 then
    raise exception using errcode = '22023', message = 'REPAIR_ACCESSORIES_INVALID';
  end if;
  select status into repair_status from public.repairs where organization_id = org and id = repair for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_status in ('delivered', 'cancelled', 'rejected') then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_EDITABLE';
  end if;
  select full_name into actor_name from public.profiles where id = actor;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception using errcode = '22023', message = 'REPAIR_ACCESSORIES_INVALID';
    end if;
    accessory := nullif(item->>'id', '')::uuid;
    previous := null;
    if accessory is not null then
      if accessory = any(ids) then raise exception using errcode = '22023', message = 'REPAIR_ACCESSORIES_INVALID'; end if;
      ids := array_append(ids, accessory);
      select * into previous from public.repair_accessories
        where organization_id = org and repair_id = repair and id = accessory for update;
      if not found then raise exception using errcode = 'P0001', message = 'REPAIR_ACCESSORY_NOT_FOUND'; end if;
      if previous.voided_at is not null then
        raise exception using errcode = 'P0001', message = 'REPAIR_ACCESSORY_VOIDED';
      end if;
      if exists(select 1 from public.repair_accessory_returns where organization_id = org and accessory_id = accessory) then
        raise exception using errcode = 'P0001', message = 'REPAIR_ACCESSORY_CORRECTION_LOCKED';
      end if;
    end if;
    if item ? 'void' and jsonb_typeof(item->'void') <> 'boolean' then
      raise exception using errcode = '22023', message = 'REPAIR_ACCESSORIES_INVALID';
    end if;
    if coalesce((item->>'void')::boolean, false) then
      reason := nullif(btrim(item->>'reason'), '');
      if accessory is null or jsonb_typeof(item->'reason') is distinct from 'string' or reason is null or char_length(reason) > 2000 then
        raise exception using errcode = '22023', message = 'REPAIR_ACCESSORY_REASON_REQUIRED';
      end if;
      update public.repair_accessories set voided_at = now(), void_reason = reason,
        updated_by = actor, updated_at = now() where id = accessory returning * into next_row;
      action := 'ACCESSORY_VOIDED';
    else
      if jsonb_typeof(item->'name') is distinct from 'string' or char_length(btrim(item->>'name')) not between 1 and 160
        or (item ? 'received_condition' and jsonb_typeof(item->'received_condition') not in ('string', 'null'))
        or (item ? 'observations' and jsonb_typeof(item->'observations') not in ('string', 'null')) then
        raise exception using errcode = '22023', message = 'REPAIR_ACCESSORY_DATA_INVALID';
      end if;
      if accessory is null then
        insert into public.repair_accessories(organization_id, repair_id, name, quantity_received,
          received_condition, observations, registered_by, registered_by_name, updated_by)
        values(org, repair, btrim(item->>'name'), public.repair_accessory_quantity(item->'quantity_received'),
          nullif(btrim(item->>'received_condition'), ''), nullif(btrim(item->>'observations'), ''), actor, coalesce(actor_name, actor::text), actor)
        returning * into next_row;
        action := 'ACCESSORY_RECEIVED';
      else
        update public.repair_accessories set name = btrim(item->>'name'),
          quantity_received = public.repair_accessory_quantity(item->'quantity_received'),
          received_condition = nullif(btrim(item->>'received_condition'), ''), observations = nullif(btrim(item->>'observations'), ''),
          updated_by = actor, updated_at = now() where id = accessory returning * into next_row;
        action := 'ACCESSORY_UPDATED';
      end if;
    end if;
    perform public.record_repair_event(org, repair, action, repair_status, repair_status, actor,
      case when action = 'ACCESSORY_VOIDED' then reason else null end,
      jsonb_build_object('accessory_id', next_row.id, 'name', next_row.name, 'operation_key', operation, 'actor_name', actor_name,
        'old_values', case when previous.id is null then null else to_jsonb(previous) end, 'new_values', to_jsonb(next_row)),
      'REPAIR_' || action);
  end loop;
  if (select count(*) from public.repair_accessories where organization_id = org and repair_id = repair and voided_at is null) > 100 then
    raise exception using errcode = '22023', message = 'REPAIR_ACCESSORIES_INVALID';
  end if;
  update public.repairs set accessories_reviewed_at = coalesce(accessories_reviewed_at, now())
    where organization_id = org and id = repair;
end;
$$;

alter function public.create_repair_unchecked(jsonb) rename to create_repair_before_accessories;
create function public.create_repair_unchecked(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare repair uuid; actor uuid;
begin
  repair := public.create_repair_before_accessories(payload);
  if payload ? 'accessories' then
    actor := public.assert_repair_accessory_actor((payload->>'organization_id')::uuid, 'REPAIRS_CREATE');
    perform public.apply_repair_accessories((payload->>'organization_id')::uuid, repair, payload->'accessories', actor,
      (payload->>'operation_key')::uuid);
  end if;
  return repair;
end;
$$;

alter function public.update_repair_unchecked(jsonb) rename to update_repair_before_accessories;
create function public.update_repair_unchecked(payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  perform public.update_repair_before_accessories(payload);
  if payload ? 'accessories' then
    actor := public.assert_repair_accessory_actor((payload->>'organization_id')::uuid, 'REPAIRS_UPDATE');
    perform public.apply_repair_accessories((payload->>'organization_id')::uuid, (payload->>'id')::uuid,
      payload->'accessories', actor, (payload->>'operation_key')::uuid);
  end if;
end;
$$;

-- Preserve old update payloads, and require replay protection only for the new collection contract.
alter function public.update_repair(jsonb) rename to update_repair_versioned;
create function public.update_repair(payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare org uuid; operation uuid; result uuid;
begin
  if payload ? 'accessories' then
    org := (payload->>'organization_id')::uuid;
    operation := (payload->>'operation_key')::uuid;
    perform public.assert_repair_accessory_actor(org, 'REPAIRS_UPDATE');
    result := public.replay_repair_command(org, operation, 'update_repair_accessories', payload);
    if result is not null then return; end if;
    perform public.update_repair_versioned(payload);
    perform public.complete_repair_command(org, operation, 'update_repair_accessories', payload, (payload->>'id')::uuid);
  else
    perform public.update_repair_versioned(payload);
  end if;
end;
$$;

create function public.save_repair_accessories(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare org uuid; repair uuid; actor uuid; operation uuid; result uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  org := (payload->>'organization_id')::uuid; repair := (payload->>'repair_id')::uuid; operation := (payload->>'operation_key')::uuid;
  actor := public.assert_repair_accessory_actor(org, 'REPAIRS_UPDATE');
  result := public.replay_repair_command(org, operation, 'save_repair_accessories', payload);
  if result is not null then return result; end if;
  perform public.lock_repair_version(org, repair, (payload->>'expected_lock_version')::bigint);
  perform public.apply_repair_accessories(org, repair, payload->'accessories', actor, operation);
  perform public.advance_repair_version(org, repair);
  perform public.complete_repair_command(org, operation, 'save_repair_accessories', payload, repair);
  return repair;
end;
$$;

create function public.repair_accessory_pending(org uuid, repair uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('accessory_id', a.id, 'name', a.name,
    'quantity_received', a.quantity_received, 'quantity_returned', coalesce(r.quantity, 0),
    'quantity_pending', a.quantity_received - coalesce(r.quantity, 0)) order by a.registered_at, a.id), '[]'::jsonb)
  from public.repair_accessories a
  left join lateral (select sum(quantity) quantity from public.repair_accessory_returns
    where organization_id = a.organization_id and accessory_id = a.id) r on true
  where a.organization_id = org and a.repair_id = repair and a.voided_at is null
    and a.quantity_received > coalesce(r.quantity, 0);
$$;

create function public.apply_repair_accessory_returns(org uuid, repair uuid, items jsonb, actor uuid, operation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item jsonb; accessory public.repair_accessories%rowtype; amount integer; returned bigint;
  result uuid; repair_status text; actor_name text; ids uuid[] := '{}'::uuid[];
begin
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 100 then
    raise exception using errcode = '22023', message = 'REPAIR_ACCESSORY_RETURNS_INVALID';
  end if;
  select status into repair_status from public.repairs where organization_id = org and id = repair for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_status = 'delivered' and not exists(select 1 from public.repair_events
    where organization_id = org and repair_id = repair and event_type = 'ACCESSORY_DELIVERY_EXCEPTION')
    and jsonb_array_length(items) > 0 then
    raise exception using errcode = 'P0001', message = 'REPAIR_ACCESSORY_RETURN_STATE_INVALID';
  end if;
  select full_name into actor_name from public.profiles where id = actor;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) <> 'object' or (item ? 'observation' and jsonb_typeof(item->'observation') not in ('string', 'null')) then
      raise exception using errcode = '22023', message = 'REPAIR_ACCESSORY_RETURNS_INVALID';
    end if;
    select * into accessory from public.repair_accessories
      where organization_id = org and repair_id = repair and id = (item->>'accessory_id')::uuid for update;
    if not found then raise exception using errcode = 'P0001', message = 'REPAIR_ACCESSORY_NOT_FOUND'; end if;
    if accessory.id = any(ids) then raise exception using errcode = '22023', message = 'REPAIR_ACCESSORY_RETURNS_INVALID'; end if;
    ids := array_append(ids, accessory.id);
    if accessory.voided_at is not null then raise exception using errcode = 'P0001', message = 'REPAIR_ACCESSORY_VOIDED'; end if;
    amount := public.repair_accessory_quantity(item->'quantity');
    select coalesce(sum(quantity), 0) into returned from public.repair_accessory_returns
      where organization_id = org and accessory_id = accessory.id;
    if amount + returned > accessory.quantity_received then
      raise exception using errcode = 'P0001', message = 'REPAIR_ACCESSORY_RETURN_EXCEEDED';
    end if;
    insert into public.repair_accessory_returns(organization_id, repair_id, accessory_id, quantity,
      returned_by, returned_by_name, observation, operation_key)
    values(org, repair, accessory.id, amount, actor, coalesce(actor_name, actor::text), nullif(btrim(item->>'observation'), ''), operation)
    returning id into result;
    perform public.record_repair_event(org, repair, 'ACCESSORY_RETURNED', repair_status, repair_status, actor,
      item->>'observation', jsonb_build_object('accessory_id', accessory.id, 'name', accessory.name,
        'return_id', result, 'quantity', amount, 'quantity_returned', returned + amount, 'actor_name', actor_name,
        'quantity_pending', accessory.quantity_received - returned - amount, 'operation_key', operation), 'REPAIR_ACCESSORY_RETURNED');
  end loop;
end;
$$;

create function public.record_repair_accessory_return(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare org uuid; repair uuid; actor uuid; operation uuid; result uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  org := (payload->>'organization_id')::uuid; repair := (payload->>'repair_id')::uuid; operation := (payload->>'operation_key')::uuid;
  actor := public.assert_repair_accessory_actor(org, 'REPAIRS_DELIVER');
  result := public.replay_repair_command(org, operation, 'record_repair_accessory_return', payload);
  if result is not null then return result; end if;
  perform public.lock_repair_version(org, repair, (payload->>'expected_lock_version')::bigint);
  if coalesce(jsonb_array_length(payload->'returns'), 0) = 0 then
    raise exception using errcode = '22023', message = 'REPAIR_ACCESSORY_RETURNS_INVALID';
  end if;
  perform public.apply_repair_accessory_returns(org, repair, payload->'returns', actor, operation);
  perform public.advance_repair_version(org, repair);
  perform public.complete_repair_command(org, operation, 'record_repair_accessory_return', payload, repair);
  return repair;
end;
$$;

-- Protect the ORIGINAL entry too. The shared technical-ready gate stays untouched.
alter function public.deliver_repair_unchecked(uuid, uuid, text) rename to deliver_repair_before_accessories;
create function public.deliver_repair_unchecked(requested_organization_id uuid, requested_repair_id uuid, requested_observation text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.repairs where organization_id = requested_organization_id and id = requested_repair_id for update;
  if jsonb_array_length(public.repair_accessory_pending(requested_organization_id, requested_repair_id)) > 0 then
    raise exception using errcode = 'P0001', message = 'REPAIR_ACCESSORIES_PENDING';
  end if;
  perform public.deliver_repair_before_accessories(requested_organization_id, requested_repair_id, requested_observation);
end;
$$;

create function public.deliver_repair_with_accessories(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare org uuid; repair uuid; actor uuid; operation uuid; result uuid; pending jsonb; reason text; exception_allowed boolean;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  org := (payload->>'organization_id')::uuid; repair := (payload->>'repair_id')::uuid; operation := (payload->>'operation_key')::uuid;
  actor := public.assert_repair_accessory_actor(org, 'REPAIRS_DELIVER');
  if payload ? 'authorize_exception' and jsonb_typeof(payload->'authorize_exception') <> 'boolean' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  exception_allowed := coalesce((payload->>'authorize_exception')::boolean, false);
  if exception_allowed then
    perform public.assert_repair_accessory_actor(org, 'REPAIRS_AUTHORIZE_ACCESSORY_EXCEPTION');
    reason := nullif(btrim(payload->>'exception_reason'), '');
    if jsonb_typeof(payload->'exception_reason') is distinct from 'string' or reason is null or char_length(reason) > 2000 then
      raise exception using errcode = '22023', message = 'REPAIR_ACCESSORY_REASON_REQUIRED';
    end if;
  end if;
  result := public.replay_repair_command(org, operation, 'deliver_repair_with_accessories', payload);
  if result is not null then return result; end if;
  perform public.lock_repair_version(org, repair, (payload->>'expected_lock_version')::bigint);
  perform public.apply_repair_accessory_returns(org, repair, coalesce(payload->'returns', '[]'::jsonb), actor, operation);
  pending := public.repair_accessory_pending(org, repair);
  if jsonb_array_length(pending) > 0 then
    if not exception_allowed then raise exception using errcode = 'P0001', message = 'REPAIR_ACCESSORIES_PENDING'; end if;
    perform public.record_repair_event(org, repair, 'ACCESSORY_DELIVERY_EXCEPTION', 'ready_for_delivery', 'ready_for_delivery',
      actor, reason, jsonb_build_object('pending_accessories', pending, 'operation_key', operation,
        'reason', reason, 'actor_name', (select full_name from public.profiles where id = actor)), 'REPAIR_ACCESSORY_DELIVERY_EXCEPTION');
  elsif exception_allowed then
    raise exception using errcode = 'P0001', message = 'REPAIR_ACCESSORY_EXCEPTION_NOT_REQUIRED';
  end if;
  -- Reuse all existing technical gates, custody guards, timestamps and DELIVERED audit.
  perform public.deliver_repair_before_accessories(org, repair, nullif(btrim(payload->>'observation'), ''));
  perform public.advance_repair_version(org, repair);
  perform public.complete_repair_command(org, operation, 'deliver_repair_with_accessories', payload, repair);
  return repair;
end;
$$;

create function public.get_repair_accessories(requested_organization_id uuid, requested_repair_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.assert_repair_actor(requested_organization_id, 'REPAIRS_VIEW');
  select jsonb_build_object('reviewed_at', repair.accessories_reviewed_at, 'lock_version', repair.lock_version,
    'accessories', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object(
      'quantity_returned', coalesce(r.quantity, 0),
      'quantity_pending', case when a.voided_at is not null then 0 else a.quantity_received - coalesce(r.quantity, 0) end,
      'returns', coalesce(r.items, '[]'::jsonb)) order by a.registered_at, a.id)
      from public.repair_accessories a left join lateral (
        select sum(quantity) quantity, jsonb_agg(to_jsonb(ret) order by ret.returned_at, ret.id) items
        from public.repair_accessory_returns ret where ret.organization_id = a.organization_id and ret.accessory_id = a.id
      ) r on true where a.organization_id = repair.organization_id and a.repair_id = repair.id), '[]'::jsonb))
    into result from public.repairs repair where repair.organization_id = requested_organization_id and repair.id = requested_repair_id;
  if result is null then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  return result;
end;
$$;

revoke all on function public.prevent_repair_accessory_return_mutation(), public.assert_repair_accessory_actor(uuid,text),
  public.repair_accessory_quantity(jsonb), public.apply_repair_accessories(uuid,uuid,jsonb,uuid,uuid),
  public.apply_repair_accessory_returns(uuid,uuid,jsonb,uuid,uuid), public.repair_accessory_pending(uuid,uuid),
  public.create_repair_before_accessories(jsonb), public.create_repair_unchecked(jsonb),
  public.update_repair_before_accessories(jsonb), public.update_repair_unchecked(jsonb), public.update_repair_versioned(jsonb),
  public.deliver_repair_before_accessories(uuid,uuid,text), public.deliver_repair_unchecked(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.save_repair_accessories(jsonb), public.record_repair_accessory_return(jsonb),
  public.deliver_repair_with_accessories(jsonb), public.get_repair_accessories(uuid,uuid), public.update_repair(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_repair_accessories(jsonb), public.record_repair_accessory_return(jsonb),
  public.deliver_repair_with_accessories(jsonb), public.get_repair_accessories(uuid,uuid) to authenticated;
grant execute on function public.update_repair(jsonb) to authenticated, service_role;

comment on table public.repair_accessories is 'Pertenencias recibidas, sin relación con stock. Correcciones previas a devolución y anulación auditada.';
comment on table public.repair_accessory_returns is 'Devoluciones físicas append-only. Saldo derivado; no son salidas de inventario.';
commit;
