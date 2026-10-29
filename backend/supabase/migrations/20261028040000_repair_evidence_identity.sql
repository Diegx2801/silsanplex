begin;

-- Evidence belongs to the received identity. Serialize uploads with identity
-- corrections and make attachment registration visible in the aggregate audit.
do $$
declare definition text;
begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid = 'public.repair_events'::regclass and conname = 'repair_events_event_type_valid';
  alter table public.repair_events drop constraint repair_events_event_type_valid;
  execute 'alter table public.repair_events add constraint repair_events_event_type_valid check (('
    || substr(definition, 7) || ') or event_type = ''ATTACHMENT_ADDED'')';
end;
$$;

create function public.lock_repair_attachment_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.repairs where organization_id = new.organization_id and id = new.repair_id for update;
  return new;
end;
$$;
create trigger repair_attachment_identity_lock before insert on public.repair_attachments
for each row execute function public.lock_repair_attachment_identity();

create function public.audit_repair_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare repair_status text;
begin
  select status into repair_status from public.repairs where organization_id = new.organization_id and id = new.repair_id;
  perform public.record_repair_event(new.organization_id, new.repair_id, 'ATTACHMENT_ADDED', repair_status,
    repair_status, auth.uid(), null, jsonb_build_object('attachment_id', new.id, 'file_name', new.file_name), 'REPAIR_ATTACHMENT_ADDED');
  perform public.advance_repair_version(new.organization_id, new.repair_id);
  return new;
end;
$$;
create trigger repair_attachment_audit after insert on public.repair_attachments
for each row execute function public.audit_repair_attachment();

create function public.guard_repair_evidence_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.customer_id, new.product_id, new.serial_number, new.requester_type, new.requesting_area,
      new.equipment_type, new.external_equipment_description) is distinct from
     (old.customer_id, old.product_id, old.serial_number, old.requester_type, old.requesting_area,
      old.equipment_type, old.external_equipment_description)
    and exists (select 1 from public.repair_attachments where organization_id = old.organization_id and repair_id = old.id)
  then raise exception using errcode = 'P0001', message = 'REPAIR_IDENTITY_LOCKED'; end if;
  return new;
end;
$$;
create trigger repairs_evidence_identity before update on public.repairs
for each row execute function public.guard_repair_evidence_identity();

revoke all on function public.lock_repair_attachment_identity(), public.audit_repair_attachment(),
  public.guard_repair_evidence_identity() from public, anon, authenticated, service_role;
commit;
