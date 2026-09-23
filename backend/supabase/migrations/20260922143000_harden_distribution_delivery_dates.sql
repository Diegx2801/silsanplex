-- SILSANPLEX: separa fecha programada y fecha real de entrega.
-- La columna delivery_date histórica se mantiene como compatibilidad para
-- migraciones y clientes anteriores, pero deja de ser la fuente ambigua.

alter table public.distribution_deliveries
  add column if not exists scheduled_date date,
  add column if not exists actual_delivery_date date;

update public.distribution_deliveries
set scheduled_date = delivery_date
where scheduled_date is null;

update public.distribution_deliveries
set actual_delivery_date = delivery_date
where actual_delivery_date is null
  and delivery_status in ('entregado', 'entrega_parcial');

create or replace function public.sync_distribution_delivery_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.scheduled_date := coalesce(new.scheduled_date, new.delivery_date);
    if new.delivery_status in ('entregado', 'entrega_parcial') then
      new.actual_delivery_date := coalesce(new.actual_delivery_date, new.delivery_date);
    end if;
  elsif new.delivery_status in ('entregado', 'entrega_parcial') then
    -- Al confirmar una entrega, delivery_date recibe la fecha real desde las
    -- funciones históricas. Conservamos la fecha programada ya registrada.
    new.scheduled_date := coalesce(old.scheduled_date, new.scheduled_date, old.delivery_date, new.delivery_date);
    new.actual_delivery_date := coalesce(new.actual_delivery_date, new.delivery_date, old.actual_delivery_date);
  else
    -- En planificación o ruta, delivery_date representa la fecha programada.
    new.scheduled_date := coalesce(new.scheduled_date, new.delivery_date, old.scheduled_date, old.delivery_date);
    new.actual_delivery_date := coalesce(new.actual_delivery_date, old.actual_delivery_date);
  end if;

  new.delivery_date := coalesce(new.actual_delivery_date, new.scheduled_date, new.delivery_date);
  return new;
end;
$$;

drop trigger if exists distribution_deliveries_sync_dates on public.distribution_deliveries;
create trigger distribution_deliveries_sync_dates
before insert or update of delivery_date, delivery_status, scheduled_date, actual_delivery_date
on public.distribution_deliveries
for each row execute function public.sync_distribution_delivery_dates();

alter table public.distribution_deliveries
  alter column scheduled_date set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'distribution_deliveries_scheduled_date_valid'
      and conrelid = 'public.distribution_deliveries'::regclass
  ) then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_scheduled_date_valid
      check (scheduled_date >= issue_date) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'distribution_deliveries_actual_date_valid'
      and conrelid = 'public.distribution_deliveries'::regclass
  ) then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_actual_date_valid
      check (actual_delivery_date is null or actual_delivery_date >= issue_date) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'distribution_deliveries_actual_date_required'
      and conrelid = 'public.distribution_deliveries'::regclass
  ) then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_actual_date_required
      check (delivery_status not in ('entregado', 'entrega_parcial') or actual_delivery_date is not null) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'distribution_deliveries_transport_data_required'
      and conrelid = 'public.distribution_deliveries'::regclass
  ) then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_transport_data_required
      check (
        delivery_status not in ('en_curso', 'en_destino', 'entregado', 'entrega_parcial')
        or modalidad = 'recojo_cliente'
        or (
          char_length(btrim(conductor)) > 0
          and char_length(btrim(vehiculo)) > 0
          and char_length(btrim(placa)) > 0
        )
      ) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'distribution_deliveries_external_carrier_required'
      and conrelid = 'public.distribution_deliveries'::regclass
  ) then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_external_carrier_required
      check (
        delivery_status not in ('en_curso', 'en_destino', 'entregado', 'entrega_parcial')
        or modalidad = 'recojo_cliente'
        or transport_type <> 'externo'
        or char_length(btrim(transportista)) > 0
      ) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'distribution_deliveries_evidence_required'
      and conrelid = 'public.distribution_deliveries'::regclass
  ) then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_evidence_required
      check (delivery_status <> 'entregado' or char_length(btrim(evidencia)) > 0) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'distribution_deliveries_incidents_required'
      and conrelid = 'public.distribution_deliveries'::regclass
  ) then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_incidents_required
      check (
        delivery_status not in ('rechazado', 'devuelto')
        or (jsonb_typeof(incidencias) = 'array' and jsonb_array_length(incidencias) > 0)
      ) not valid;
  end if;
end;
$$;

create index if not exists distribution_deliveries_organization_scheduled_date_idx
  on public.distribution_deliveries (organization_id, scheduled_date, id);

comment on column public.distribution_deliveries.scheduled_date is
  'Fecha calendario planificada para la entrega, en la zona horaria del negocio.';
comment on column public.distribution_deliveries.actual_delivery_date is
  'Fecha calendario en que se confirmó la entrega o entrega parcial.';

revoke all on function public.sync_distribution_delivery_dates() from public, anon, authenticated, service_role;
