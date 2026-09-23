-- A reprogramación no puede guardar una fecha anterior al día operativo
-- de SILSAN (Lima), incluso si la escritura no proviene de la interfaz.
create or replace function public.validate_distribution_rescheduled_date()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  business_date date := pg_catalog.timezone('America/Lima', pg_catalog.now())::date;
begin
  if new.delivery_status = 'reprogramado'
    and (
      old.delivery_status is distinct from new.delivery_status
      or old.scheduled_date is distinct from new.scheduled_date
    )
    and new.scheduled_date < business_date then
    raise exception using
      errcode = 'P0001',
      message = 'DISTRIBUTION_RESCHEDULE_DATE_IN_PAST';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_distribution_rescheduled_date()
  from public, anon, authenticated, service_role;

drop trigger if exists distribution_deliveries_validate_reprogram_date
  on public.distribution_deliveries;
create trigger distribution_deliveries_validate_reprogram_date
before update of delivery_status, scheduled_date
on public.distribution_deliveries
for each row execute function public.validate_distribution_rescheduled_date();

comment on function public.validate_distribution_rescheduled_date() is
  'Impide reprogramar una entrega con fecha pasada según el día operativo de Lima.';
