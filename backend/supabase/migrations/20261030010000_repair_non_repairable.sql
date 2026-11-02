-- A technical decision is not a successful repair delivery. Keep historical rows untouched.
begin;

alter table public.repairs drop constraint repairs_status_valid;
alter table public.repairs add constraint repairs_status_valid check (status in (
  'received','diagnosis','quote_pending','waiting_customer_approval','quote_approved','in_repair',
  'awaiting_parts','testing','ready_for_delivery','delivered','cancelled','rejected','warranty',
  'non_repairable','returned_unrepaired'));
alter table public.repair_events add constraint repair_events_scope_id unique (organization_id,repair_id,id);
alter table public.repairs
  add column non_repairable_decision_event_id bigint,
  add column returned_unrepaired_at timestamptz,
  add constraint repairs_non_repairable_decision_fk foreign key (organization_id,id,non_repairable_decision_event_id)
    references public.repair_events(organization_id,repair_id,id) on delete restrict,
  add constraint repairs_non_repairable_consistency check (
    (non_repairable_decision_event_id is not null) = (status in ('non_repairable','returned_unrepaired'))
    and ((status = 'returned_unrepaired' and returned_unrepaired_at is not null
      and returned_unrepaired_at >= received_at and delivered_at is null)
      or (status <> 'returned_unrepaired' and returned_unrepaired_at is null)));

do $$ declare definition text; begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid='public.repair_events'::regclass and conname='repair_events_event_type_valid';
  alter table public.repair_events drop constraint repair_events_event_type_valid;
  execute 'alter table public.repair_events add constraint repair_events_event_type_valid check (('
    || substr(definition,7) || ') or event_type in (''NON_REPAIRABLE_DECLARED'',''NON_REPAIRABLE_REOPENED'',''RETURNED_UNREPAIRED''))';
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid='public.repair_command_operations'::regclass and conname='repair_command_operations_command_type_valid';
  alter table public.repair_command_operations drop constraint repair_command_operations_command_type_valid;
  execute 'alter table public.repair_command_operations add constraint repair_command_operations_command_type_valid check (('
    || substr(definition,7) || ') or command_type in (''declare_repair_non_repairable'',''return_unrepaired_repair'',''reopen_repair_non_repairable_assessment''))';
end $$;

alter function public.repair_status_transition_allowed(text,text) rename to repair_status_transition_before_non_repairable;
create function public.repair_status_transition_allowed(requested_from_status text, requested_to_status text)
returns boolean language sql immutable set search_path='' as $$
  select case
    when requested_to_status='non_repairable' then requested_from_status in ('diagnosis','quote_approved','in_repair','awaiting_parts','testing')
    when requested_from_status='non_repairable' then requested_to_status in ('diagnosis','returned_unrepaired')
    when requested_from_status='returned_unrepaired' then false
    else public.repair_status_transition_before_non_repairable(requested_from_status,requested_to_status) end;
$$;

-- Defense in depth for ALL old RPCs. Version advances and authorized reassignment
-- before return remain possible; technical/reception changes cannot bypass B1.
create function public.guard_repair_non_repairable() returns trigger
language plpgsql security definer set search_path='' as $$
declare specialized boolean := coalesce(current_setting('app.repairs_non_repairable_write',true),'')='true';
begin
  if tg_op='INSERT' then
    if new.status in ('non_repairable','returned_unrepaired') or new.non_repairable_decision_event_id is not null
      or new.returned_unrepaired_at is not null then
      raise exception using errcode='P0001',message='REPAIR_SPECIALIZED_STATUS_REQUIRED';
    end if;
    return new;
  end if;
  if not specialized then
    if (new.non_repairable_decision_event_id,new.returned_unrepaired_at) is distinct from
      (old.non_repairable_decision_event_id,old.returned_unrepaired_at)
      or (new.status is distinct from old.status and
        (new.status in ('non_repairable','returned_unrepaired') or old.status in ('non_repairable','returned_unrepaired'))) then
      raise exception using errcode='P0001',message='REPAIR_SPECIALIZED_STATUS_REQUIRED';
    end if;
    if old.status='returned_unrepaired' and
      (to_jsonb(new)-array['lock_version','updated_by','updated_at']) is distinct from
      (to_jsonb(old)-array['lock_version','updated_by','updated_at']) then
      raise exception using errcode='P0001',message='REPAIR_NOT_EDITABLE';
    end if;
    if old.status='non_repairable' and
      (to_jsonb(new)-array['lock_version','updated_by','updated_at','assigned_technician_id']) is distinct from
      (to_jsonb(old)-array['lock_version','updated_by','updated_at','assigned_technician_id']) then
      raise exception using errcode='P0001',message='REPAIR_NON_REPAIRABLE_ACTIVE';
    end if;
  end if;
  if new.non_repairable_decision_event_id is not null and not exists (
    select 1 from public.repair_events e where e.organization_id=new.organization_id and e.repair_id=new.id
      and e.id=new.non_repairable_decision_event_id and e.event_type='NON_REPAIRABLE_DECLARED') then
    raise exception using errcode='P0001',message='REPAIR_NON_REPAIRABLE_DECISION_INVALID';
  end if;
  return new;
end $$;
create trigger repairs_guard_non_repairable before insert or update on public.repairs
for each row execute function public.guard_repair_non_repairable();

-- Reject even no-op legacy writes, not only changed row values. Public wrappers
-- retain their permission/version/replay checks and delegate through these cores.
alter function public.update_repair_unchecked(jsonb) rename to update_repair_before_non_repairable;
create function public.update_repair_unchecked(payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.repairs where organization_id=(payload->>'organization_id')::uuid and id=(payload->>'id')::uuid for update;
  if exists(select 1 from public.repairs where organization_id=(payload->>'organization_id')::uuid
    and id=(payload->>'id')::uuid and status in ('non_repairable','returned_unrepaired')) then
    raise exception using errcode='P0001',message='REPAIR_NOT_EDITABLE';
  end if;
  perform public.update_repair_before_non_repairable(payload);
end $$;
alter function public.assign_repair_unchecked(uuid,uuid,uuid) rename to assign_repair_before_non_repairable;
create function public.assign_repair_unchecked(requested_organization_id uuid,requested_repair_id uuid,requested_technician_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.repairs where organization_id=requested_organization_id and id=requested_repair_id for update;
  if exists(select 1 from public.repairs where organization_id=requested_organization_id and id=requested_repair_id and status='returned_unrepaired') then
    raise exception using errcode='P0001',message='REPAIR_NOT_EDITABLE';
  end if;
  perform public.assign_repair_before_non_repairable(requested_organization_id,requested_repair_id,requested_technician_id);
end $$;
alter function public.record_repair_solution_unchecked(jsonb) rename to record_repair_solution_before_non_repairable;
create function public.record_repair_solution_unchecked(payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.repairs where organization_id=(payload->>'organization_id')::uuid and id=(payload->>'repair_id')::uuid for update;
  if exists(select 1 from public.repairs where organization_id=(payload->>'organization_id')::uuid
    and id=(payload->>'repair_id')::uuid and status in ('non_repairable','returned_unrepaired')) then
    raise exception using errcode='P0001',message='REPAIR_NON_REPAIRABLE_ACTIVE';
  end if;
  perform public.record_repair_solution_before_non_repairable(payload);
end $$;

-- Preserve the existing custody gate, adding only the new physical return.
create or replace function public.guard_repair_external_custody() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and new.status in
    ('testing','ready_for_delivery','delivered','cancelled','rejected','returned_unrepaired')
    and exists(select 1 from public.repair_external_services s
      where s.organization_id=old.organization_id and s.repair_id=old.id and s.returned_at is null) then
    raise exception using errcode='P0001',message='REPAIR_EXTERNAL_SERVICE_OUTSTANDING';
  end if;
  return new;
end $$;

alter function public.apply_repair_accessories(uuid,uuid,jsonb,uuid,uuid) rename to apply_repair_accessories_before_non_repairable;
create function public.apply_repair_accessories(org uuid,repair uuid,items jsonb,actor uuid,operation uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.repairs r where r.organization_id=org and r.id=repair
    and r.status in ('non_repairable','returned_unrepaired')) then
    raise exception using errcode='P0001',message='REPAIR_NOT_EDITABLE';
  end if;
  perform public.apply_repair_accessories_before_non_repairable(org,repair,items,actor,operation);
end $$;

alter function public.apply_repair_accessory_returns(uuid,uuid,jsonb,uuid,uuid) rename to apply_repair_accessory_returns_before_non_repairable;
create function public.apply_repair_accessory_returns(org uuid,repair uuid,items jsonb,actor uuid,operation uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.repairs r where r.organization_id=org and r.id=repair and r.status='returned_unrepaired')
    and not exists(select 1 from public.repair_events e where e.organization_id=org and e.repair_id=repair
      and e.event_type='ACCESSORY_DELIVERY_EXCEPTION') then
    raise exception using errcode='P0001',message='REPAIR_ACCESSORY_RETURN_STATE_INVALID';
  end if;
  perform public.apply_repair_accessory_returns_before_non_repairable(org,repair,items,actor,operation);
end $$;

create function public.assert_non_repairable_payload(payload jsonb) returns void
language plpgsql set search_path='' as $$
begin
  if payload is null or jsonb_typeof(payload)<>'object' then
    raise exception using errcode='22023',message='REPAIR_PAYLOAD_INVALID';
  end if;
  if payload ?| array['actor_id','confirmed_by','technician_id','decided_at','returned_unrepaired_at','delivered_at'] then
    raise exception using errcode='22023',message='REPAIR_NON_REPAIRABLE_SERVER_FIELDS';
  end if;
end $$;

-- ECMAScript String.trim whitespace, explicitly enumerated so PostgreSQL locale
-- and btrim's default ASCII-space rule cannot accept visually empty reasons.
-- Only boundary whitespace is removed; internal formatting remains untouched.
create function public.normalize_repair_non_repairable_reason(value jsonb,failure_message text) returns text
language plpgsql immutable set search_path='' as $$
declare reason text;
begin
  if jsonb_typeof(value) is distinct from 'string' then
    raise exception using errcode='22023',message=failure_message;
  end if;
  reason:=nullif(btrim(value#>>'{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'');
  if reason is null or char_length(reason)>2000 then
    raise exception using errcode='22023',message=failure_message;
  end if;
  return reason;
end $$;

create function public.assert_non_repairable_technician(org uuid,repair uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  actor:=public.assert_repair_accessory_actor(org,'REPAIRS_CHANGE_STATUS');
  perform public.assert_repair_actor(org,'REPAIRS_PERFORM_TECHNICAL');
  if not public.repair_technician_is_active(org,actor) or not exists(
    select 1 from public.repairs r where r.organization_id=org and r.id=repair and r.assigned_technician_id=actor) then
    raise exception using errcode='42501',message='REPAIR_NON_REPAIRABLE_ASSIGNED_TECHNICIAN_REQUIRED';
  end if;
  return actor;
end $$;

create function public.assert_repair_no_pending_parts(org uuid,repair uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.repair_parts p where p.organization_id=org and p.repair_id=repair
    and p.status='reserved' and p.quantity_consumed<p.quantity_requested) then
    raise exception using errcode='P0001',message='REPAIR_PENDING_PARTS';
  end if;
end $$;

create function public.declare_repair_non_repairable(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid; repair uuid; operation uuid; actor uuid; result uuid; event_id bigint;
  reason text; r public.repairs%rowtype; d public.repair_diagnostics%rowtype;
begin
  perform public.assert_non_repairable_payload(payload);
  org:=(payload->>'organization_id')::uuid; repair:=(payload->>'repair_id')::uuid; operation:=(payload->>'operation_key')::uuid;
  perform public.assert_repair_accessory_actor(org,'REPAIRS_CHANGE_STATUS');
  perform public.assert_repair_actor(org,'REPAIRS_PERFORM_TECHNICAL');
  result:=public.replay_repair_command(org,operation,'declare_repair_non_repairable',payload);
  if result is not null then return result; end if;
  perform public.lock_repair_version(org,repair,(payload->>'expected_lock_version')::bigint);
  actor:=public.assert_non_repairable_technician(org,repair);
  select * into r from public.repairs where organization_id=org and id=repair;
  if r.status not in ('diagnosis','quote_approved','in_repair','awaiting_parts','testing') then
    raise exception using errcode='P0001',message='REPAIR_NON_REPAIRABLE_STATE_INVALID';
  end if;
  reason:=public.normalize_repair_non_repairable_reason(payload->'reason','REPAIR_NON_REPAIRABLE_REASON_REQUIRED');
  select * into d from public.repair_diagnostics where organization_id=org and repair_id=repair
    and id=nullif(payload->>'diagnosis_id','')::uuid for share;
  if not found then raise exception using errcode='P0001',message='REPAIR_NON_REPAIRABLE_DIAGNOSIS_INVALID'; end if;
  perform public.assert_repair_no_pending_parts(org,repair);
  event_id:=public.record_repair_event(org,repair,'NON_REPAIRABLE_DECLARED',r.status,'non_repairable',actor,reason,
    jsonb_build_object('diagnosis_id',d.id,'diagnosis_snapshot',to_jsonb(d),'reason',reason,
      'technician_id',actor,'technician_name',(select full_name from public.profiles where id=actor),
      'old_values',jsonb_build_object('status',r.status,'decision_event_id',null),
      'new_values',jsonb_build_object('status','non_repairable','reason',reason)), 'REPAIR_NON_REPAIRABLE_DECLARED');
  perform set_config('app.repairs_non_repairable_write','true',true);
  perform set_config('app.repairs_status_write','true',true);
  update public.repairs set status='non_repairable',non_repairable_decision_event_id=event_id,updated_by=actor
    where organization_id=org and id=repair;
  perform set_config('app.repairs_status_write','false',true);
  perform set_config('app.repairs_non_repairable_write','false',true);
  perform public.advance_repair_version(org,repair);
  perform public.complete_repair_command(org,operation,'declare_repair_non_repairable',payload,repair);
  return repair;
end $$;

create function public.return_unrepaired_repair(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid; repair uuid; operation uuid; actor uuid; result uuid; r public.repairs%rowtype;
  pending jsonb; reason text; exception_allowed boolean;
begin
  perform public.assert_non_repairable_payload(payload);
  org:=(payload->>'organization_id')::uuid; repair:=(payload->>'repair_id')::uuid; operation:=(payload->>'operation_key')::uuid;
  actor:=public.assert_repair_accessory_actor(org,'REPAIRS_DELIVER');
  if payload ? 'authorize_exception' and jsonb_typeof(payload->'authorize_exception')<>'boolean' then
    raise exception using errcode='22023',message='REPAIR_PAYLOAD_INVALID';
  end if;
  exception_allowed:=coalesce((payload->>'authorize_exception')::boolean,false);
  if exception_allowed then
    perform public.assert_repair_actor(org,'REPAIRS_AUTHORIZE_ACCESSORY_EXCEPTION');
    reason:=public.normalize_repair_non_repairable_reason(payload->'exception_reason','REPAIR_ACCESSORY_REASON_REQUIRED');
  end if;
  result:=public.replay_repair_command(org,operation,'return_unrepaired_repair',payload);
  if result is not null then return result; end if;
  perform public.lock_repair_version(org,repair,(payload->>'expected_lock_version')::bigint);
  select * into r from public.repairs where organization_id=org and id=repair;
  if r.status<>'non_repairable' then raise exception using errcode='P0001',message='REPAIR_NON_REPAIRABLE_STATE_INVALID'; end if;
  if nullif(payload->>'decision_event_id','')::bigint is distinct from r.non_repairable_decision_event_id then
    raise exception using errcode='P0001',message='REPAIR_NON_REPAIRABLE_DECISION_INVALID';
  end if;
  if exists(select 1 from public.repair_external_services where organization_id=org and repair_id=repair and returned_at is null) then
    raise exception using errcode='P0001',message='REPAIR_EXTERNAL_SERVICE_OUTSTANDING';
  end if;
  perform public.assert_repair_no_pending_parts(org,repair);
  perform public.apply_repair_accessory_returns(org,repair,coalesce(payload->'returns','[]'::jsonb),actor,operation);
  pending:=public.repair_accessory_pending(org,repair);
  if jsonb_array_length(pending)>0 then
    if not exception_allowed then raise exception using errcode='P0001',message='REPAIR_ACCESSORIES_PENDING'; end if;
    perform public.record_repair_event(org,repair,'ACCESSORY_DELIVERY_EXCEPTION',r.status,r.status,actor,reason,
      jsonb_build_object('pending_accessories',pending,'reason',reason,'operation_key',operation,
        'actor_name',(select full_name from public.profiles where id=actor),'return_kind','unrepaired'), 'REPAIR_ACCESSORY_DELIVERY_EXCEPTION');
  elsif exception_allowed then raise exception using errcode='P0001',message='REPAIR_ACCESSORY_EXCEPTION_NOT_REQUIRED';
  end if;
  perform set_config('app.repairs_non_repairable_write','true',true);
  perform set_config('app.repairs_status_write','true',true);
  update public.repairs set status='returned_unrepaired',returned_unrepaired_at=now(),updated_by=actor
    where organization_id=org and id=repair;
  perform set_config('app.repairs_status_write','false',true);
  perform set_config('app.repairs_non_repairable_write','false',true);
  perform public.record_repair_event(org,repair,'RETURNED_UNREPAIRED',r.status,'returned_unrepaired',actor,null,
    jsonb_build_object('decision_event_id',r.non_repairable_decision_event_id::text,'returned_unrepaired_at',now(),
      'actor_name',(select full_name from public.profiles where id=actor),
      'old_values',jsonb_build_object('status',r.status,'returned_unrepaired_at',null),
      'new_values',jsonb_build_object('status','returned_unrepaired','returned_unrepaired_at',now())), 'REPAIR_RETURNED_UNREPAIRED');
  perform public.advance_repair_version(org,repair);
  perform public.complete_repair_command(org,operation,'return_unrepaired_repair',payload,repair);
  return repair;
end $$;

create function public.reopen_repair_non_repairable_assessment(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid; repair uuid; operation uuid; actor uuid; result uuid; reason text; r public.repairs%rowtype;
begin
  perform public.assert_non_repairable_payload(payload);
  org:=(payload->>'organization_id')::uuid; repair:=(payload->>'repair_id')::uuid; operation:=(payload->>'operation_key')::uuid;
  perform public.assert_repair_accessory_actor(org,'REPAIRS_CHANGE_STATUS');
  perform public.assert_repair_actor(org,'REPAIRS_PERFORM_TECHNICAL');
  result:=public.replay_repair_command(org,operation,'reopen_repair_non_repairable_assessment',payload);
  if result is not null then return result; end if;
  perform public.lock_repair_version(org,repair,(payload->>'expected_lock_version')::bigint);
  actor:=public.assert_non_repairable_technician(org,repair);
  select * into r from public.repairs where organization_id=org and id=repair;
  if r.status<>'non_repairable' then raise exception using errcode='P0001',message='REPAIR_NON_REPAIRABLE_STATE_INVALID'; end if;
  if nullif(payload->>'decision_event_id','')::bigint is distinct from r.non_repairable_decision_event_id then
    raise exception using errcode='P0001',message='REPAIR_NON_REPAIRABLE_DECISION_INVALID';
  end if;
  reason:=public.normalize_repair_non_repairable_reason(payload->'reason','REPAIR_NON_REPAIRABLE_REASON_REQUIRED');
  perform public.record_repair_event(org,repair,'NON_REPAIRABLE_REOPENED',r.status,'diagnosis',actor,reason,
    jsonb_build_object('decision_event_id',r.non_repairable_decision_event_id::text,'reason',reason,
      'actor_name',(select full_name from public.profiles where id=actor),
      'old_values',jsonb_build_object('status',r.status,'decision_event_id',r.non_repairable_decision_event_id::text),
      'new_values',jsonb_build_object('status','diagnosis','decision_event_id',null)), 'REPAIR_NON_REPAIRABLE_REOPENED');
  perform set_config('app.repairs_non_repairable_write','true',true);
  perform set_config('app.repairs_status_write','true',true);
  update public.repairs set status='diagnosis',non_repairable_decision_event_id=null,updated_by=actor
    where organization_id=org and id=repair;
  perform set_config('app.repairs_status_write','false',true);
  perform set_config('app.repairs_non_repairable_write','false',true);
  perform public.advance_repair_version(org,repair);
  perform public.complete_repair_command(org,operation,'reopen_repair_non_repairable_assessment',payload,repair);
  return repair;
end $$;

-- Append API columns without changing earlier view column names or order.
create or replace view public.repair_list with (security_invoker=true) as
select r.id,r.organization_id,r.repair_code,r.customer_id,r.product_id,r.serial_number,r.received_at,
  r.estimated_delivery_date,r.delivered_at,r.status,r.priority,r.problem_description,r.diagnosis,r.applied_solution,
  r.notes,r.customer_reference,r.sale_document_id,r.warranty_reference,r.assigned_technician_id,
  r.customer_name_snapshot,r.customer_document_snapshot,r.product_code_snapshot,r.product_description_snapshot,
  r.created_by,r.updated_by,r.created_at,r.updated_at,r.serial_control_snapshot,r.lock_version,
  r.requester_type,r.requesting_area,r.equipment_type,r.external_equipment_description,
  exists(select 1 from public.repair_external_services s where s.organization_id=r.organization_id and s.repair_id=r.id and s.returned_at is null) as external_service_pending,
  r.non_repairable_decision_event_id::text as non_repairable_decision_id,r.returned_unrepaired_at,
  (select e.metadata || jsonb_build_object('id',e.id::text,'decided_at',e.created_at,'confirmed_by',e.actor_user_id)
    from public.repair_events e where e.organization_id=r.organization_id and e.repair_id=r.id
      and e.id=r.non_repairable_decision_event_id) as non_repairable_decision
from public.repairs r;

revoke all on function public.repair_status_transition_before_non_repairable(text,text),
  public.repair_status_transition_allowed(text,text),public.guard_repair_non_repairable(),
  public.update_repair_before_non_repairable(jsonb),public.update_repair_unchecked(jsonb),
  public.assign_repair_before_non_repairable(uuid,uuid,uuid),public.assign_repair_unchecked(uuid,uuid,uuid),
  public.record_repair_solution_before_non_repairable(jsonb),public.record_repair_solution_unchecked(jsonb),
  public.apply_repair_accessories_before_non_repairable(uuid,uuid,jsonb,uuid,uuid),public.apply_repair_accessories(uuid,uuid,jsonb,uuid,uuid),
  public.apply_repair_accessory_returns_before_non_repairable(uuid,uuid,jsonb,uuid,uuid),public.apply_repair_accessory_returns(uuid,uuid,jsonb,uuid,uuid),
  public.assert_non_repairable_payload(jsonb),public.normalize_repair_non_repairable_reason(jsonb,text),
  public.assert_non_repairable_technician(uuid,uuid),public.assert_repair_no_pending_parts(uuid,uuid)
from public,anon,authenticated,service_role;
revoke all on function public.declare_repair_non_repairable(jsonb),public.return_unrepaired_repair(jsonb),
  public.reopen_repair_non_repairable_assessment(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.declare_repair_non_repairable(jsonb),public.return_unrepaired_repair(jsonb),
  public.reopen_repair_non_repairable_assessment(jsonb) to authenticated;
commit;
