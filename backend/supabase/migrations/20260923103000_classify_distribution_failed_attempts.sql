-- Distingue un intento sin entrega de un rechazo expreso del cliente, sin
-- alterar los resultados históricos ni las cantidades ya recibidas.

alter table public.distribution_delivery_outcomes
  add column failure_category text;

alter table public.distribution_delivery_outcomes
  add constraint distribution_delivery_outcomes_failure_category_valid
  check (
    failure_category is null
    or failure_category in (
      'cliente_ausente',
      'direccion_no_ubicada',
      'cliente_rechaza_recepcion',
      'restriccion_horaria_o_acceso',
      'otro'
    )
  );

alter function public.record_distribution_delivery_outcome(jsonb)
  rename to record_distribution_delivery_outcome_without_failure_category;

create function public.record_distribution_delivery_outcome(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  requested_organization_id uuid;
  requested_operation_key uuid;
  outcome_status text;
  failure_category_value text;
  existing_outcome_id uuid;
  existing_failure_category text;
  outcome_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_PAYLOAD_INVALID';
  end if;

  requested_organization_id := nullif(payload ->> 'organizationId', '')::uuid;
  requested_operation_key := nullif(payload ->> 'operationKey', '')::uuid;
  outcome_status := nullif(btrim(payload ->> 'resultado'), '');
  failure_category_value := nullif(btrim(payload ->> 'categoriaIncidencia'), '');

  if actor_id is null
    or requested_organization_id is null
    or not public.has_organization_permission(requested_organization_id, 'DISTRIBUTION_MANAGE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  if outcome_status = 'rechazado'
    and failure_category_value is null then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_FAILURE_CATEGORY_REQUIRED';
  end if;
  if failure_category_value is not null and failure_category_value not in (
    'cliente_ausente',
    'direccion_no_ubicada',
    'cliente_rechaza_recepcion',
    'restriccion_horaria_o_acceso',
    'otro'
  ) then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_FAILURE_CATEGORY_INVALID';
  end if;
  if outcome_status is distinct from 'rechazado' and failure_category_value is not null then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_FAILURE_CATEGORY_INVALID';
  end if;

  select outcome.id, outcome.failure_category
    into existing_outcome_id, existing_failure_category
  from public.distribution_delivery_outcomes outcome
  where outcome.organization_id = requested_organization_id
    and outcome.operation_key = requested_operation_key;
  if found then
    if existing_failure_category is distinct from failure_category_value then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED';
    end if;
    return existing_outcome_id;
  end if;

  outcome_id := public.record_distribution_delivery_outcome_without_failure_category(payload);

  update public.distribution_delivery_outcomes
  set failure_category = failure_category_value
  where organization_id = requested_organization_id
    and id = outcome_id;

  return outcome_id;
end;
$$;

revoke all on function public.record_distribution_delivery_outcome_without_failure_category(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.record_distribution_delivery_outcome(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_distribution_delivery_outcome(jsonb) to authenticated;

comment on column public.distribution_delivery_outcomes.failure_category is
  'Clasificación operativa del intento sin entrega; null para recepciones y datos históricos sin clasificar.';
comment on function public.record_distribution_delivery_outcome(jsonb) is
  'Registra recepciones o intentos fallidos; exige y conserva la categoría cuando no se entregan bienes.';
