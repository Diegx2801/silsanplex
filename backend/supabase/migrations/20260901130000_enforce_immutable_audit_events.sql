-- Audit history is append-only. Application roles write through trusted
-- SECURITY DEFINER routines and cannot mutate the resulting evidence.

begin;

alter table public.audit_events
  drop constraint audit_events_actor_user_id_fkey;

alter table public.audit_events
  add constraint audit_events_actor_user_id_fkey
  foreign key (actor_user_id)
  references auth.users(id)
  on delete restrict;

create or replace function public.prevent_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'AUDIT_EVENT_IMMUTABLE';
end;
$$;

create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function public.prevent_audit_event_mutation();

revoke all on table public.audit_events
  from public, anon, authenticated, service_role;
grant select on table public.audit_events to authenticated;

revoke all on function public.prevent_audit_event_mutation()
  from public, anon, authenticated, service_role;

comment on function public.prevent_audit_event_mutation() is
  'Impide modificar o eliminar el historial append-only de auditoria.';
comment on trigger audit_events_immutable on public.audit_events is
  'Rechaza UPDATE y DELETE sobre eventos de auditoria persistidos.';

commit;
