-- R13: the existing, server-dated ready event is the only completion record.
begin;

do $$ declare definition text; begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid='public.repair_command_operations'::regclass and conname='repair_command_operations_command_type_valid';
  alter table public.repair_command_operations drop constraint repair_command_operations_command_type_valid;
  execute 'alter table public.repair_command_operations add constraint repair_command_operations_command_type_valid check (('
    || substr(definition,7) || ') or command_type = ''change_repair_status'')';
end $$;

create or replace function public.change_repair_status_unchecked(
  requested_organization_id uuid, requested_repair_id uuid, requested_status text, requested_observation text
) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid; r public.repairs%rowtype; target text:=lower(btrim(requested_status)); cycle integer; m jsonb;
begin
  actor:=public.assert_repair_actor(requested_organization_id,'REPAIRS_CHANGE_STATUS');
  if target in ('quote_approved','rejected','delivered','cancelled') then
    raise exception using errcode='P0001',message='REPAIR_SPECIALIZED_STATUS_REQUIRED';
  end if;
  select * into r from public.repairs where organization_id=requested_organization_id and id=requested_repair_id for update;
  if not found then raise exception using errcode='P0001',message='REPAIR_NOT_FOUND'; end if;
  if r.status='rejected' then raise exception using errcode='P0001',message='REPAIR_QUOTE_REVISION_REQUIRED'; end if;
  if not public.repair_status_transition_allowed(r.status,target) then
    raise exception using errcode='P0001',message='REPAIR_STATUS_TRANSITION_INVALID';
  end if;
  if target='waiting_customer_approval' and not exists(select 1 from public.repair_quotes q
    where q.organization_id=requested_organization_id and q.repair_id=requested_repair_id and q.status='pending' and q.is_current) then
    raise exception using errcode='P0001',message='REPAIR_PENDING_QUOTE_REQUIRED';
  end if;
  if target='ready_for_delivery' then perform public.assert_repair_ready_for_delivery(requested_organization_id,requested_repair_id); end if;
  cycle:=r.current_test_cycle_number+case when target='testing' then 1 else 0 end;
  m:=case when target='testing' then jsonb_build_object('test_cycle_number',cycle) else '{}'::jsonb end;
  if target='ready_for_delivery' then
    m:=jsonb_build_object('technical_completion_version',1,'test_cycle_number',cycle,
      'assigned_technician_id',r.assigned_technician_id,
      'assigned_technician_name',(select full_name from public.profiles where id=r.assigned_technician_id),
      'actor_name',(select full_name from public.profiles where id=actor));
  end if;
  perform set_config('app.repairs_status_write','true',true);
  update public.repairs set status=target,current_test_cycle_number=cycle,updated_by=actor
    where organization_id=requested_organization_id and id=requested_repair_id;
  perform set_config('app.repairs_status_write','false',true);
  perform public.record_repair_event(requested_organization_id,requested_repair_id,'STATUS_CHANGED',r.status,target,
    actor,requested_observation,m,'REPAIR_STATUS_CHANGED');
end $$;

-- A distinct RPC name avoids all default-argument/overload ambiguity. The original
-- five-argument RPC remains unchanged for every existing SQL/PostgREST client.
create function public.change_repair_status_idempotent(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid; repair uuid; operation uuid; result uuid;
begin
  if payload is null or jsonb_typeof(payload)<>'object' or payload - array[
    'organization_id','repair_id','operation_key','expected_lock_version','status','observation'] <> '{}'::jsonb then
    raise exception using errcode='22023',message='REPAIR_PAYLOAD_INVALID';
  end if;
  org:=(payload->>'organization_id')::uuid; repair:=(payload->>'repair_id')::uuid; operation:=(payload->>'operation_key')::uuid;
  perform public.assert_repair_actor(org,'REPAIRS_CHANGE_STATUS');
  result:=public.replay_repair_command(org,operation,'change_repair_status',payload);
  if result is not null then return result; end if;
  perform public.lock_repair_version(org,repair,(payload->>'expected_lock_version')::bigint);
  perform public.change_repair_status_unchecked(org,repair,payload->>'status',payload->>'observation');
  perform public.advance_repair_version(org,repair);
  perform public.complete_repair_command(org,operation,'change_repair_status',payload,repair);
  return repair;
end $$;

-- Invoker, not definer: both the aggregate and ALL evidence retain their RLS.
-- IDs order the locked aggregate; transaction timestamps are never used as order.
-- Filter irrelevant events BEFORE reconstructing. A known gap is sticky for
-- legacy evidence. Only a complete server-issued v1 certificate can anchor a
-- later, internally contiguous cycle; it never rehabilitates an older decision.
create function public.repair_technical_completions(org uuid,repair uuid)
returns table(technical_completion jsonb,first_technical_completion jsonb,verified_technical_completions jsonb)
language plpgsql stable security invoker rows 1 set search_path='' as $$
declare r public.repairs%rowtype; e public.repair_events%rowtype; state text; cycle integer;
  candidate jsonb; entry_cycle integer; entry_event bigint; legacy_chain_valid boolean:=true;
  cycle_chain_valid boolean:=true; legacy_valid boolean; certificate boolean; contiguous boolean;
begin
  select * into r from public.repairs where organization_id=org and id=repair;
  if not found then return; end if;
  verified_technical_completions:='[]'::jsonb;
  -- Most list rows have never reached ready. This indexed, SQL-filtered probe
  -- avoids examining their reception/accessory/update histories at all.
  if not exists(select 1 from public.repair_events where organization_id=org and repair_id=repair
    and event_type='STATUS_CHANGED' and from_status='testing' and to_status='ready_for_delivery') then
    return next; return;
  end if;
  for e in select * from public.repair_events where organization_id=org and repair_id=repair
    and to_status is not null and from_status is distinct from to_status order by id loop
    contiguous:=state is null or state is not distinct from e.from_status;
    if not contiguous then
      candidate:=null; entry_cycle:=null; entry_event:=null;
      legacy_chain_valid:=false; cycle_chain_valid:=false;
    end if;
    if e.event_type='STATUS_CHANGED' and e.to_status='testing' then
      entry_cycle:=case when jsonb_typeof(e.metadata->'test_cycle_number')='number' and e.metadata->>'test_cycle_number' ~ '^[1-9][0-9]{0,8}$'
        then (e.metadata->>'test_cycle_number')::integer end;
      entry_event:=e.id;
      cycle_chain_valid:=contiguous;
      candidate:=null;
    elsif e.event_type='STATUS_CHANGED' and e.from_status='testing' and e.to_status='ready_for_delivery' then
      certificate:=e.metadata->'technical_completion_version'='1'::jsonb;
      cycle:=case when certificate and e.metadata->>'test_cycle_number' ~ '^[1-9][0-9]{0,8}$'
        then (e.metadata->>'test_cycle_number')::integer else entry_cycle end;
      legacy_valid:=false;
      if not (e.metadata ? 'technical_completion_version') and legacy_chain_valid and cycle_chain_valid and entry_cycle is not null then
        -- Set-based, complete evidence for this legacy cycle. Count ALL test
        -- rows, not just those mentioned by an event. Global event counts catch
        -- duplicate associations even when the duplicate lies outside the cycle.
        with cycle_tests as materialized (
          select t.id,t.passed from public.repair_tests t
          where t.organization_id=org and t.repair_id=repair and t.test_cycle_number=entry_cycle
        ), evidence as materialized (
          select ev.id,t.id as test_id,t.passed,ev.from_status,ev.to_status,ev.metadata
          from public.repair_events ev left join cycle_tests t on ev.metadata->>'test_id'=t.id::text
          where ev.organization_id=org and ev.repair_id=repair and ev.event_type='TEST_COMPLETED'
        ), associations as (
          select t.id,t.passed,count(ev.id) as event_count,
            count(ev.id) filter(where ev.id>entry_event and ev.id<e.id
              and ev.from_status='testing' and ev.to_status='testing'
              and ev.metadata->'test_cycle_number'=to_jsonb(entry_cycle)
              and ev.metadata->'passed'=to_jsonb(t.passed)) as valid_count
          from cycle_tests t left join evidence ev on ev.test_id=t.id group by t.id,t.passed
        ) select exists(select 1 from cycle_tests)
          and not exists(select 1 from associations where not passed or event_count<>1 or valid_count<>1)
          and not exists(select 1 from evidence where id>entry_event and id<e.id and test_id is null)
          into legacy_valid;
      end if;
      if contiguous and cycle_chain_valid and cycle is not null and
        ((certificate and (entry_cycle is null or entry_cycle=cycle)
          and e.metadata->'test_cycle_number'=to_jsonb(cycle)
          and e.metadata ?& array['assigned_technician_id','assigned_technician_name','actor_name']
          and jsonb_typeof(e.metadata->'assigned_technician_name') in ('string','null')
          and jsonb_typeof(e.metadata->'actor_name') in ('string','null')
          and e.metadata->>'assigned_technician_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
          or (legacy_valid
            and (not (e.metadata ? 'test_cycle_number') or e.metadata->'test_cycle_number'=to_jsonb(entry_cycle)))) then
        candidate:=jsonb_build_object('event_id',e.id::text,'completed_at',e.created_at,'test_cycle_number',cycle,
          'actor_user_id',e.actor_user_id,'actor_name',case when certificate then e.metadata->'actor_name' end,
          'assigned_technician_id',case when certificate then e.metadata->'assigned_technician_id' end,
          'assigned_technician_name',case when certificate then e.metadata->'assigned_technician_name' end);
        if first_technical_completion is null then first_technical_completion:=candidate; end if;
        verified_technical_completions:=verified_technical_completions||jsonb_build_array(candidate);
      else candidate:=null; end if;
    elsif not (e.event_type='DELIVERED' and e.from_status='ready_for_delivery' and e.to_status='delivered' and contiguous) then
      candidate:=null; entry_cycle:=null; entry_event:=null;
    end if;
    state:=e.to_status;
  end loop;
  if r.status in ('ready_for_delivery','delivered') and state=r.status
    and (candidate->>'test_cycle_number')::integer=r.current_test_cycle_number then technical_completion:=candidate; end if;
  return next;
end $$;

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
      and e.id=r.non_repairable_decision_event_id) as non_repairable_decision,
  (select c.technical_completion from public.repair_technical_completions(r.organization_id,r.id) c) as technical_completion,
  (select c.first_technical_completion from public.repair_technical_completions(r.organization_id,r.id) c) as first_technical_completion,
  -- Detail clients select this one object instead of invoking the same
  -- reconstruction separately for current, first and validated history.
  (select to_jsonb(c) from public.repair_technical_completions(r.organization_id,r.id) c) as technical_completion_summary
from public.repairs r;

revoke all on function public.change_repair_status_idempotent(jsonb),public.repair_technical_completions(uuid,uuid),
  public.change_repair_status_unchecked(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.change_repair_status_idempotent(jsonb),public.repair_technical_completions(uuid,uuid) to authenticated,service_role;
comment on function public.repair_technical_completions(uuid,uuid) is
  'R13: read-only RLS projection of server-dated ready events; unknown legacy evidence stays NULL. No backfill.';
commit;
