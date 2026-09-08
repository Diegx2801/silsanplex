-- SILSANPLEX: auditoria de transiciones de estado en distribucion.

create or replace function public.record_distribution_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivery_status is distinct from old.delivery_status then
    insert into public.audit_events (
      organization_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      old_values,
      new_values,
      metadata
    ) values (
      new.organization_id,
      (select auth.uid()),
      'DISTRIBUTION_STATUS_CHANGED',
      'distribution_delivery',
      new.id::text,
      jsonb_build_object(
        'delivery_status', old.delivery_status,
        'lock_version', old.lock_version
      ),
      jsonb_build_object(
        'delivery_status', new.delivery_status,
        'lock_version', new.lock_version
      ),
      jsonb_build_object(
        'delivery_id', new.id,
        'source', 'distribution_delivery_update'
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists distribution_deliveries_record_status_transition
  on public.distribution_deliveries;

create trigger distribution_deliveries_record_status_transition
after update of delivery_status on public.distribution_deliveries
for each row execute function public.record_distribution_status_transition();

create index if not exists audit_events_distribution_status_idx
  on public.audit_events (organization_id, entity_type, entity_id, created_at desc)
  where action = 'DISTRIBUTION_STATUS_CHANGED';

comment on function public.record_distribution_status_transition() is
  'Registra cada transición válida de estado de una entrega en audit_events.';
