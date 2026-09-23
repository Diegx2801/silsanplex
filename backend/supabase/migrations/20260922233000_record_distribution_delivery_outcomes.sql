-- Registra resultados de entrega por evento y por línea del pedido.
-- No genera movimientos de inventario: la salida ya se confirma en Ventas.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'distribution_deliveries_organization_id_key'
      and conrelid = 'public.distribution_deliveries'::regclass
  ) then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_organization_id_key unique (organization_id, id);
  end if;
end;
$$;

create table public.distribution_delivery_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  delivery_id uuid not null,
  operation_key uuid not null,
  result_status text not null,
  occurred_on date not null,
  evidence text not null default '',
  incidents jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint distribution_delivery_outcomes_org_id_key unique (organization_id, id),
  constraint distribution_delivery_outcomes_operation_key unique (organization_id, operation_key),
  constraint distribution_delivery_outcomes_delivery_same_org
    foreign key (organization_id, delivery_id)
    references public.distribution_deliveries (organization_id, id) on delete restrict,
  constraint distribution_delivery_outcomes_status_valid
    check (result_status in ('entregado', 'entrega_parcial', 'rechazado')),
  constraint distribution_delivery_outcomes_evidence_length
    check (char_length(evidence) <= 255),
  constraint distribution_delivery_outcomes_incidents_valid
    check (jsonb_typeof(incidents) = 'array' and jsonb_array_length(incidents) <= 20),
  constraint distribution_delivery_outcomes_success_evidence_required
    check (result_status not in ('entregado', 'entrega_parcial') or char_length(btrim(evidence)) > 0),
  constraint distribution_delivery_outcomes_rejection_incident_required
    check (result_status <> 'rechazado' or jsonb_array_length(incidents) > 0)
);

create table public.distribution_delivery_outcome_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  outcome_id uuid not null,
  order_id uuid not null,
  order_line_id uuid not null,
  quantity_delivered numeric(14,3) not null,

  constraint distribution_delivery_outcome_lines_outcome_same_org
    foreign key (organization_id, outcome_id)
    references public.distribution_delivery_outcomes (organization_id, id) on delete cascade,
  constraint distribution_delivery_outcome_lines_order_item_same_org
    foreign key (organization_id, order_id, order_line_id)
    references public.order_items (organization_id, order_id, id) on delete restrict,
  constraint distribution_delivery_outcome_lines_quantity_positive
    check (quantity_delivered > 0),
  constraint distribution_delivery_outcome_lines_one_per_item
    unique (organization_id, outcome_id, order_line_id)
);

alter table public.distribution_deliveries
  add column last_outcome_id uuid,
  add column quantity_reconciliation_required boolean not null default false;

alter table public.distribution_deliveries
  add constraint distribution_deliveries_last_outcome_same_org
  foreign key (organization_id, last_outcome_id)
  references public.distribution_delivery_outcomes (organization_id, id) on delete restrict;

-- Los estados históricos no contienen cantidades recibidas por línea. No
-- inventamos esos datos: quedan señalados para conciliar antes de continuarlos.
update public.distribution_deliveries
set quantity_reconciliation_required = true
where delivery_status in ('entregado', 'entrega_parcial', 'rechazado', 'devuelto');

create index distribution_delivery_outcomes_delivery_date_idx
  on public.distribution_delivery_outcomes (organization_id, delivery_id, occurred_on, created_at);
create index distribution_delivery_outcome_lines_order_item_idx
  on public.distribution_delivery_outcome_lines (organization_id, order_id, order_line_id);

alter table public.distribution_delivery_outcomes enable row level security;
alter table public.distribution_delivery_outcome_lines enable row level security;

revoke all on table public.distribution_delivery_outcomes,
  public.distribution_delivery_outcome_lines from anon, authenticated;
grant select on table public.distribution_delivery_outcomes,
  public.distribution_delivery_outcome_lines to authenticated;

create policy distribution_delivery_outcomes_select_policy
  on public.distribution_delivery_outcomes
  for select to authenticated
  using (public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'));

create policy distribution_delivery_outcome_lines_select_policy
  on public.distribution_delivery_outcome_lines
  for select to authenticated
  using (public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'));

comment on table public.distribution_delivery_outcomes is
  'Bitácora inmutable de resultados de entrega; sus cantidades describen recepción del cliente, no salidas de inventario.';
comment on table public.distribution_delivery_outcome_lines is
  'Cantidades recibidas por línea del pedido en cada evento de entrega.';

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

create or replace function public.require_distribution_delivery_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

drop trigger if exists distribution_deliveries_require_outcome on public.distribution_deliveries;
create trigger distribution_deliveries_require_outcome
before update of delivery_status, last_outcome_id on public.distribution_deliveries
for each row execute function public.require_distribution_delivery_outcome();

create or replace function public.sync_order_fulfillment_from_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  total_goods numeric(16,3);
  delivered_goods numeric(16,3);
  next_status text;
begin
  select order_data.*
    into order_row
  from public.orders order_data
  where order_data.organization_id = new.organization_id
    and order_data.id = new.order_id
  for update;

  if not found then
    return new;
  end if;

  select coalesce(sum(item.quantity), 0),
         coalesce(sum(coalesce(delivered.quantity, 0)), 0)
    into total_goods, delivered_goods
  from public.order_items item
  join public.products product
    on product.organization_id = item.organization_id
   and product.id = item.product_id
   and product.product_type = 'good'
  left join lateral (
    select sum(outcome_line.quantity_delivered) as quantity
    from public.distribution_delivery_outcomes outcome
    join public.distribution_delivery_outcome_lines outcome_line
      on outcome_line.organization_id = outcome.organization_id
     and outcome_line.outcome_id = outcome.id
    join public.distribution_deliveries delivery
      on delivery.organization_id = outcome.organization_id
     and delivery.id = outcome.delivery_id
    where delivery.organization_id = item.organization_id
      and delivery.order_id = item.order_id
      and outcome_line.order_line_id = item.id
  ) delivered on true
  where item.organization_id = new.organization_id
    and item.order_id = new.order_id;

  next_status := case
    when order_row.status = 'cancelado' or order_row.fulfillment_status = 'cancelled' then 'cancelled'
    when order_row.fulfillment_status = 'delivered' then 'delivered'
    when total_goods > 0 and delivered_goods >= total_goods then 'delivered'
    when delivered_goods > 0 then 'partially_fulfilled'
    when new.delivery_status = 'preparando' then 'preparing'
    when new.delivery_status in ('en_curso', 'en_destino', 'rechazado', 'devuelto') then 'dispatched'
    when new.delivery_status in ('programado', 'reprogramado') then 'pending'
    else order_row.fulfillment_status
  end;

  update public.orders
  set fulfillment_status = next_status,
      updated_at = pg_catalog.now()
  where organization_id = new.organization_id
    and id = new.order_id
    and fulfillment_status is distinct from next_status;

  return new;
end;
$$;

create or replace function public.record_distribution_delivery_outcome(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  requested_organization_id uuid;
  requested_delivery_id uuid;
  requested_operation_key uuid;
  expected_lock_version bigint;
  outcome_id uuid;
  outcome_status text;
  outcome_date date;
  evidence_text text;
  incidents_value jsonb;
  lines_value jsonb;
  parent_row public.distribution_deliveries%rowtype;
  order_line record;
  requested_quantity numeric(14,3);
  new_quantity numeric(16,3) := 0;
  total_quantity numeric(16,3) := 0;
  delivered_quantity numeric(16,3) := 0;
  incidence_count integer;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_PAYLOAD_INVALID';
  end if;

  requested_organization_id := nullif(payload ->> 'organizationId', '')::uuid;
  requested_delivery_id := nullif(payload ->> 'entregaId', '')::uuid;
  requested_operation_key := nullif(payload ->> 'operationKey', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expectedLockVersion', '')::bigint;
  outcome_status := nullif(btrim(payload ->> 'resultado'), '');
  outcome_date := nullif(payload ->> 'fecha', '')::date;
  evidence_text := btrim(coalesce(payload ->> 'evidencia', ''));
  incidents_value := coalesce(payload -> 'incidencias', '[]'::jsonb);
  lines_value := coalesce(payload -> 'lineas', '[]'::jsonb);

  if actor_id is null
    or requested_organization_id is null
    or not public.has_organization_permission(requested_organization_id, 'DISTRIBUTION_MANAGE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;
  if requested_delivery_id is null or requested_operation_key is null or expected_lock_version is null then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_PAYLOAD_REQUIRED';
  end if;

  select outcome.id into outcome_id
  from public.distribution_delivery_outcomes outcome
  where outcome.organization_id = requested_organization_id
    and outcome.operation_key = requested_operation_key;
  if found then
    return outcome_id;
  end if;

  if outcome_status not in ('entregado', 'entrega_parcial', 'rechazado') then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_INVALID';
  end if;
  if outcome_date is null or outcome_date > current_date then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_DATE_INVALID';
  end if;
  if jsonb_typeof(incidents_value) <> 'array' or jsonb_typeof(lines_value) <> 'array' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_LINES_INVALID';
  end if;
  if char_length(evidence_text) > 255 or jsonb_array_length(incidents_value) > 20 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_DATA_TOO_LONG';
  end if;
  if jsonb_array_length(lines_value) > 200 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_TOO_MANY_LINES';
  end if;

  perform public.lock_distribution_delivery_version(
    requested_organization_id,
    requested_delivery_id,
    expected_lock_version
  );

  select delivery.* into parent_row
  from public.distribution_deliveries delivery
  where delivery.organization_id = requested_organization_id
    and delivery.id = requested_delivery_id;

  if parent_row.delivery_status not in ('en_curso', 'en_destino', 'entrega_parcial') then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_STATE_INVALID';
  end if;
  if parent_row.quantity_reconciliation_required then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_RECONCILIATION_REQUIRED';
  end if;
  if outcome_date < parent_row.issue_date then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_DATE_INVALID';
  end if;

  select count(*) into incidence_count
  from jsonb_array_elements(incidents_value) incidence
  where char_length(btrim(incidence #>> '{}')) > 0;

  if outcome_status in ('entregado', 'entrega_parcial') then
    if char_length(evidence_text) = 0 then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_EVIDENCE_REQUIRED';
    end if;
    if jsonb_array_length(lines_value) = 0 then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_LINES_REQUIRED';
    end if;
    if (select count(*) from jsonb_array_elements(lines_value)) <> (
      select count(distinct nullif(entry ->> 'orderLineId', '')::uuid)
      from jsonb_array_elements(lines_value) entry
    ) then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_DUPLICATE_LINE';
    end if;
  else
    if jsonb_array_length(lines_value) > 0 or incidence_count = 0 then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_REJECTION_INVALID';
    end if;
  end if;

  for order_line in
    select item.id, item.quantity,
      coalesce((
        select sum(outcome_line.quantity_delivered)
        from public.distribution_delivery_outcomes outcome
        join public.distribution_delivery_outcome_lines outcome_line
          on outcome_line.organization_id = outcome.organization_id
         and outcome_line.outcome_id = outcome.id
        join public.distribution_deliveries delivery
          on delivery.organization_id = outcome.organization_id
         and delivery.id = outcome.delivery_id
        where delivery.organization_id = item.organization_id
          and delivery.order_id = item.order_id
          and outcome_line.order_line_id = item.id
      ), 0) as already_delivered
    from public.order_items item
    join public.products product
      on product.organization_id = item.organization_id
     and product.id = item.product_id
     and product.product_type = 'good'
    where item.organization_id = requested_organization_id
      and item.order_id = parent_row.order_id
  loop
    total_quantity := total_quantity + order_line.quantity;
    delivered_quantity := delivered_quantity + order_line.already_delivered;
    requested_quantity := coalesce((
      select sum((entry ->> 'cantidad')::numeric)
      from jsonb_array_elements(lines_value) entry
      where nullif(entry ->> 'orderLineId', '')::uuid = order_line.id
    ), 0);

    if requested_quantity < 0 or requested_quantity > 999999999
      or requested_quantity > order_line.quantity - order_line.already_delivered then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_QUANTITY_EXCEEDED';
    end if;

    new_quantity := new_quantity + requested_quantity;
  end loop;

  if total_quantity = 0 then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_GOODS_REQUIRED';
  end if;

  if outcome_status = 'entregado'
    and delivered_quantity + new_quantity <> total_quantity then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_TOTAL_INCOMPLETE';
  end if;
  if outcome_status = 'entrega_parcial'
    and (new_quantity <= 0 or delivered_quantity + new_quantity >= total_quantity) then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_OUTCOME_PARTIAL_INVALID';
  end if;
  if outcome_status = 'rechazado' and delivered_quantity >= total_quantity then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_OUTCOME_ALREADY_COMPLETE';
  end if;

  insert into public.distribution_delivery_outcomes (
    organization_id, delivery_id, operation_key, result_status,
    occurred_on, evidence, incidents, created_by
  ) values (
    requested_organization_id, requested_delivery_id, requested_operation_key, outcome_status,
    outcome_date, evidence_text, incidents_value, actor_id
  ) returning id into outcome_id;

  if jsonb_array_length(lines_value) > 0 then
    insert into public.distribution_delivery_outcome_lines (
      organization_id, outcome_id, order_id, order_line_id, quantity_delivered
    )
    select requested_organization_id, outcome_id, parent_row.order_id,
      entry."orderLineId", entry.cantidad
    from jsonb_to_recordset(lines_value) as entry("orderLineId" uuid, cantidad numeric)
    where entry.cantidad > 0;
  end if;

  update public.distribution_deliveries
  set delivery_status = outcome_status,
      actual_delivery_date = case
        when outcome_status in ('entregado', 'entrega_parcial') then outcome_date
        else actual_delivery_date
      end,
      delivery_date = case
        when outcome_status in ('entregado', 'entrega_parcial') then outcome_date
        else delivery_date
      end,
      evidencia = case when evidence_text <> '' then evidence_text else evidencia end,
      incidencias = case
        when jsonb_array_length(incidents_value) > 0 then incidencias || incidents_value
        else incidencias
      end,
      last_outcome_id = outcome_id,
      updated_by = actor_id
  where organization_id = requested_organization_id
    and id = requested_delivery_id;

  perform public.advance_distribution_delivery_version(requested_organization_id, requested_delivery_id);

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    requested_organization_id, actor_id, 'DISTRIBUTION_OUTCOME_RECORDED',
    'distribution_delivery', requested_delivery_id::text,
    jsonb_build_object('delivery_status', parent_row.delivery_status, 'lock_version', expected_lock_version),
    jsonb_build_object('delivery_status', outcome_status, 'outcome_id', outcome_id),
    jsonb_build_object('result_status', outcome_status, 'occurred_on', outcome_date,
      'line_count', jsonb_array_length(lines_value), 'quantity_delivered', new_quantity)
  );

  return outcome_id;
exception
  when unique_violation then
    select outcome.id into outcome_id
    from public.distribution_delivery_outcomes outcome
    where outcome.organization_id = requested_organization_id
      and outcome.operation_key = requested_operation_key;
    if outcome_id is not null then return outcome_id; end if;
    raise exception using errcode = '23505', message = 'DISTRIBUTION_OUTCOME_DUPLICATE';
end;
$$;

revoke all on function public.require_distribution_delivery_outcome(),
  public.record_distribution_delivery_outcome(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_distribution_delivery_outcome(jsonb) to authenticated;

comment on function public.record_distribution_delivery_outcome(jsonb) is
  'Confirma cantidades recibidas por línea, evidencia e incidencias de forma atómica sin duplicar movimientos de inventario.';
