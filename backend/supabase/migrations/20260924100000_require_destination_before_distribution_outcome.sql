-- Require a confirmed destination arrival before recording a delivery outcome.

create or replace function public.distribution_delivery_transition_allowed(
  current_status text,
  next_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case current_status
    when 'programado' then next_status = any (array['programado', 'preparando', 'reprogramado', 'cancelado']::text[])
    when 'preparando' then next_status = any (array['preparando', 'en_curso', 'reprogramado', 'cancelado']::text[])
    when 'en_curso' then next_status = any (array['en_curso', 'en_destino']::text[])
    when 'en_destino' then next_status = any (array['en_destino', 'entregado', 'entrega_parcial', 'rechazado']::text[])
    when 'entregado' then next_status = 'entregado'
    when 'entrega_parcial' then next_status = any (array['entrega_parcial', 'en_curso', 'en_destino', 'entregado', 'rechazado', 'reprogramado']::text[])
    when 'reprogramado' then next_status = any (array['reprogramado', 'preparando', 'cancelado']::text[])
    when 'rechazado' then next_status = any (array['rechazado', 'reprogramado']::text[])
    when 'devuelto' then next_status = 'devuelto'
    when 'cancelado' then next_status = 'cancelado'
    else false
  end;
$$;

create or replace function public.require_distribution_destination_before_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_delivery_status text;
  current_tracking_status text;
begin
  select delivery.delivery_status, delivery.tracking_status
    into current_delivery_status, current_tracking_status
  from public.distribution_deliveries delivery
  where delivery.organization_id = new.organization_id
    and delivery.id = new.delivery_id
  for update;

  if not found
    or not (
      current_delivery_status = 'en_destino'
      or (
        current_delivery_status = 'entrega_parcial'
        and current_tracking_status = 'en_destino'
      )
    ) then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_NOT_AT_DESTINATION';
  end if;

  return new;
end;
$$;

revoke all on function public.require_distribution_destination_before_outcome()
  from public, anon, authenticated, service_role;

drop trigger if exists distribution_delivery_outcomes_require_destination
  on public.distribution_delivery_outcomes;
create trigger distribution_delivery_outcomes_require_destination
before insert on public.distribution_delivery_outcomes
for each row execute function public.require_distribution_destination_before_outcome();

comment on function public.require_distribution_destination_before_outcome() is
  'Rejects delivery outcomes until arrival is confirmed, including follow-up receipts for a partial delivery still at destination.';
