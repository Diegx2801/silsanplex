-- Bloquea transiciones de registros históricos cuyo resultado no puede
-- reconstruirse con cantidades por línea sin una conciliación explícita.

create or replace function public.require_distribution_delivery_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.quantity_reconciliation_required
    and new.delivery_status is distinct from old.delivery_status then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_RECONCILIATION_REQUIRED';
  end if;

  if (new.delivery_status is distinct from old.delivery_status
      or new.last_outcome_id is distinct from old.last_outcome_id)
    and new.delivery_status in ('entregado', 'entrega_parcial', 'rechazado')
    and not exists (
      select 1
      from public.distribution_delivery_outcomes outcome
      where outcome.organization_id = new.organization_id
        and outcome.delivery_id = new.id
        and outcome.id = new.last_outcome_id
        and outcome.result_status = new.delivery_status
    ) then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function public.require_distribution_delivery_outcome()
  from public, anon, authenticated, service_role;
