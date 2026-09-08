-- SILSANPLEX: transiciones validas del ciclo operativo de distribucion.

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
    when 'en_curso' then next_status = any (array['en_curso', 'en_destino', 'entrega_parcial', 'reprogramado', 'rechazado']::text[])
    when 'en_destino' then next_status = any (array['en_destino', 'entregado', 'entrega_parcial', 'rechazado', 'devuelto']::text[])
    when 'entregado' then next_status = 'entregado'
    when 'entrega_parcial' then next_status = any (array['entrega_parcial', 'en_curso', 'en_destino', 'entregado', 'reprogramado', 'devuelto']::text[])
    when 'reprogramado' then next_status = any (array['reprogramado', 'preparando', 'cancelado']::text[])
    when 'rechazado' then next_status = any (array['rechazado', 'reprogramado', 'devuelto']::text[])
    when 'devuelto' then next_status = any (array['devuelto', 'reprogramado']::text[])
    when 'cancelado' then next_status = 'cancelado'
    else false
  end;
$$;

create or replace function public.validate_distribution_delivery_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.delivery_status <> 'programado' then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_INITIAL_STATUS_INVALID';
    end if;
  elsif new.delivery_status is distinct from old.delivery_status
    and not public.distribution_delivery_transition_allowed(old.delivery_status, new.delivery_status) then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_INVALID_TRANSITION';
  end if;

  return new;
end;
$$;

drop trigger if exists distribution_deliveries_validate_transition
  on public.distribution_deliveries;

create trigger distribution_deliveries_validate_transition
before insert or update of delivery_status on public.distribution_deliveries
for each row execute function public.validate_distribution_delivery_transition();

comment on function public.distribution_delivery_transition_allowed(text, text) is
  'Matriz unica de transiciones permitidas para el ciclo operativo de distribucion.';
comment on function public.validate_distribution_delivery_transition() is
  'Impide crear entregas en estados avanzados y bloquea transiciones invalidas.';
