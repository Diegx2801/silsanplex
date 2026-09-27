-- E2: historial de costos de compra derivado de recepciones reales.
--
-- La unidad historica de esta lectura es purchase_receipt_items. El costo
-- expuesto es el unit_cost registrado en la recepcion, no un costo neto
-- reconstruido ni un promedio entre monedas o bases tributarias distintas.

begin;

create index if not exists purchase_receipts_organization_received_idx
  on public.purchase_receipts (organization_id, received_at desc, id);

create or replace view public.supplier_price_history
with (security_invoker = true)
as
select
  purchase.organization_id,
  purchase.supplier_id,
  purchase.id as purchase_order_id,
  purchase.document_type,
  purchase.series,
  purchase.document_number,
  purchase.currency,
  receipt.received_at,
  order_item.id as purchase_order_item_id,
  receipt_item.product_id,
  order_item.product_code,
  order_item.product_description,
  receipt_item.quantity,
  receipt_item.unit_cost,
  purchase.supplier_name,
  receipt.id as purchase_receipt_id,
  receipt_item.id as purchase_receipt_item_id,
  purchase.status as order_status,
  order_item.unit_of_measure,
  order_item.product_type,
  receipt_item.fulfillment_mode,
  purchase.prices_include_tax,
  receipt_item.tax_affectation,
  case
    when receipt_item.tax_affectation = 'gravado' and purchase.prices_include_tax
      then round(receipt_item.unit_cost, 4)
    when receipt_item.tax_affectation = 'gravado' and not purchase.prices_include_tax
      then round(receipt_item.unit_cost * 1.18, 4)
    when receipt_item.tax_affectation in ('exonerado', 'inafecto')
      then round(receipt_item.unit_cost, 4)
    else null
  end as unit_cost_with_tax,
  case
    when receipt_item.tax_affectation = 'gravado' and purchase.prices_include_tax
      then round(receipt_item.unit_cost / 1.18, 4)
    when receipt_item.tax_affectation = 'gravado' and not purchase.prices_include_tax
      then round(receipt_item.unit_cost, 4)
    when receipt_item.tax_affectation in ('exonerado', 'inafecto')
      then round(receipt_item.unit_cost, 4)
    else null
  end as unit_cost_without_tax,
  case
    when order_item.product_type = 'good'
      and receipt_item.fulfillment_mode = 'physical' then true
    when order_item.product_type = 'service'
      or receipt_item.fulfillment_mode = 'administrative' then false
    else null
  end as is_inventory_receipt,
  'registered_unit_cost'::text as cost_basis,
  case
    when receipt_item.tax_affectation = 'gravado' and purchase.prices_include_tax
      then 'includes_igv'
    when receipt_item.tax_affectation = 'gravado' and not purchase.prices_include_tax
      then 'excludes_igv'
    when receipt_item.tax_affectation in ('exonerado', 'inafecto')
      then 'not_applicable'
    else 'tax_snapshot_unavailable'
  end::text as tax_basis
from public.purchase_receipt_items receipt_item
join public.purchase_receipts receipt
  on receipt.organization_id = receipt_item.organization_id
 and receipt.id = receipt_item.receipt_id
join public.purchase_order_items order_item
  on order_item.organization_id = receipt_item.organization_id
 and order_item.id = receipt_item.purchase_order_item_id
join public.purchase_orders purchase
  on purchase.organization_id = receipt_item.organization_id
 and purchase.id = receipt.purchase_order_id
where purchase.status in ('received', 'partially_received', 'closed_partial');

comment on view public.supplier_price_history is
  'Eventos de costo unitario registrado derivados de recepciones reales; excluye ordenes sin recepcion y conserva moneda/base tributaria.';

create or replace view public.supplier_purchase_price_summary
with (security_invoker = true)
as
with eligible_events as (
  select history.*
  from public.supplier_price_history history
  where history.is_inventory_receipt is true
), ordered_events as (
  select
    event.*,
    row_number() over (
      partition by event.organization_id, event.supplier_id, event.product_id,
        event.currency, event.unit_of_measure, event.prices_include_tax, event.tax_affectation
      order by event.received_at desc, event.purchase_receipt_id desc,
        event.purchase_receipt_item_id desc
    ) as latest_rank,
    lag(event.unit_cost) over (
      partition by event.organization_id, event.supplier_id, event.product_id,
        event.currency, event.unit_of_measure, event.prices_include_tax, event.tax_affectation
      order by event.received_at asc, event.purchase_receipt_id asc,
        event.purchase_receipt_item_id asc
    ) as previous_unit_cost
  from eligible_events event
), aggregated as (
  select
    event.organization_id,
    event.supplier_id,
    event.product_id,
    event.currency,
    event.prices_include_tax,
    event.tax_affectation,
    max(event.supplier_name) filter (where event.latest_rank = 1) as supplier_name,
    max(event.product_code) filter (where event.latest_rank = 1) as product_code,
    max(event.product_description) filter (where event.latest_rank = 1) as product_description,
    max(event.unit_of_measure) filter (where event.latest_rank = 1) as unit_of_measure,
    count(distinct event.purchase_receipt_id)::integer as receipt_count,
    count(distinct event.purchase_order_id)::integer as purchase_count,
    sum(event.quantity) as received_quantity,
    max(event.received_at) as last_received_at,
    max(event.unit_cost) filter (where event.latest_rank = 1) as latest_unit_cost,
    max(event.previous_unit_cost) filter (where event.latest_rank = 1) as previous_unit_cost,
    min(event.unit_cost) as minimum_unit_cost,
    round(sum(event.unit_cost * event.quantity) / nullif(sum(event.quantity), 0), 4)
      as weighted_average_unit_cost,
    max(event.unit_cost) as maximum_unit_cost,
    (array_agg(event.purchase_order_id order by event.received_at desc,
      event.purchase_receipt_id desc, event.purchase_receipt_item_id desc))[1]
      as latest_purchase_order_id,
    (array_agg(event.purchase_receipt_id order by event.received_at desc,
      event.purchase_receipt_id desc, event.purchase_receipt_item_id desc))[1]
      as latest_purchase_receipt_id,
    max(event.order_status) filter (where event.latest_rank = 1) as latest_order_status
  from ordered_events event
  group by event.organization_id, event.supplier_id, event.product_id,
    event.currency, event.unit_of_measure, event.prices_include_tax, event.tax_affectation
)
select
  aggregated.organization_id,
  aggregated.supplier_id,
  aggregated.supplier_name,
  aggregated.product_id,
  aggregated.product_code,
  aggregated.product_description,
  aggregated.unit_of_measure,
  aggregated.currency,
  aggregated.prices_include_tax,
  aggregated.tax_affectation,
  aggregated.receipt_count,
  aggregated.purchase_count,
  aggregated.received_quantity,
  aggregated.last_received_at,
  aggregated.latest_unit_cost,
  aggregated.previous_unit_cost,
  case
    when aggregated.latest_unit_cost is null or aggregated.previous_unit_cost is null
      then null
    else round(aggregated.latest_unit_cost - aggregated.previous_unit_cost, 4)
  end as absolute_variation,
  case
    when aggregated.latest_unit_cost is null
      or aggregated.previous_unit_cost is null
      or aggregated.previous_unit_cost = 0 then null
    else round(
      (aggregated.latest_unit_cost - aggregated.previous_unit_cost)
      / aggregated.previous_unit_cost * 100, 2
    )
  end as percentage_variation,
  aggregated.minimum_unit_cost,
  aggregated.weighted_average_unit_cost,
  aggregated.maximum_unit_cost,
  aggregated.latest_purchase_order_id,
  aggregated.latest_purchase_receipt_id,
  aggregated.latest_order_status,
  'registered_unit_cost'::text as cost_basis,
  case
    when aggregated.tax_affectation = 'gravado' and aggregated.prices_include_tax
      then 'includes_igv'
    when aggregated.tax_affectation = 'gravado' and not aggregated.prices_include_tax
      then 'excludes_igv'
    when aggregated.tax_affectation in ('exonerado', 'inafecto')
      then 'not_applicable'
    else 'tax_snapshot_unavailable'
  end::text as tax_basis
from aggregated;

comment on view public.supplier_purchase_price_summary is
  'Resumen por producto/proveedor y dimensiones compatibles. El promedio es ponderado por cantidad recibida.';

-- Conserva la superficie historica usada por consultas existentes, pero deja
-- de sumar cantidades ordenadas y de mezclar costos tributaria o
-- monetariamente incompatibles.
create or replace view public.supplier_supplied_products
with (security_invoker = true)
as
select
  summary.organization_id,
  summary.supplier_id,
  summary.product_id,
  summary.product_code,
  summary.product_description,
  summary.unit_of_measure,
  summary.purchase_count,
  summary.received_quantity as supplied_quantity,
  summary.minimum_unit_cost,
  summary.weighted_average_unit_cost as average_unit_cost,
  summary.maximum_unit_cost,
  summary.latest_unit_cost,
  summary.last_received_at,
  summary.currency,
  summary.prices_include_tax,
  summary.tax_affectation,
  summary.receipt_count
from public.supplier_purchase_price_summary summary;

create or replace function public.get_supplier_purchase_price_history(
  requested_organization_id uuid,
  requested_product_id uuid default null,
  requested_supplier_id uuid default null,
  requested_from timestamptz default null,
  requested_to timestamptz default null
)
returns setof public.supplier_price_history
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not public.has_organization_permission(requested_organization_id, 'PURCHASES_VIEW') then
    raise exception using errcode = '42501', message = 'E2_PRICE_HISTORY_FORBIDDEN';
  end if;
  if requested_supplier_id is not null
    and not public.has_organization_permission(requested_organization_id, 'SUPPLIERS_VIEW') then
    raise exception using errcode = '42501', message = 'E2_SUPPLIER_PRICE_HISTORY_FORBIDDEN';
  end if;
  if requested_from is not null and requested_to is not null and requested_from > requested_to then
    raise exception using errcode = '22023', message = 'E2_PRICE_HISTORY_PERIOD_INVALID';
  end if;

  return query
  select history.*
  from public.supplier_price_history history
  where history.organization_id = requested_organization_id
    and history.is_inventory_receipt is true
    and (requested_product_id is null or history.product_id = requested_product_id)
    and (requested_supplier_id is null or history.supplier_id = requested_supplier_id)
    and (requested_from is null or history.received_at >= requested_from)
    and (requested_to is null or history.received_at < requested_to)
  order by history.received_at desc, history.purchase_receipt_id desc,
    history.purchase_receipt_item_id desc;
end;
$$;

create or replace function public.get_supplier_purchase_price_summary(
  requested_organization_id uuid,
  requested_product_id uuid default null,
  requested_supplier_id uuid default null,
  requested_from timestamptz default null,
  requested_to timestamptz default null
)
returns setof public.supplier_purchase_price_summary
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not public.has_organization_permission(requested_organization_id, 'PURCHASES_VIEW') then
    raise exception using errcode = '42501', message = 'E2_PRICE_HISTORY_FORBIDDEN';
  end if;
  if requested_supplier_id is not null
    and not public.has_organization_permission(requested_organization_id, 'SUPPLIERS_VIEW') then
    raise exception using errcode = '42501', message = 'E2_SUPPLIER_PRICE_HISTORY_FORBIDDEN';
  end if;
  if requested_from is not null and requested_to is not null and requested_from > requested_to then
    raise exception using errcode = '22023', message = 'E2_PRICE_HISTORY_PERIOD_INVALID';
  end if;

  return query
  with eligible_events as (
    select history.*
    from public.supplier_price_history history
    where history.organization_id = requested_organization_id
      and history.is_inventory_receipt is true
      and (requested_product_id is null or history.product_id = requested_product_id)
      and (requested_supplier_id is null or history.supplier_id = requested_supplier_id)
      and (requested_from is null or history.received_at >= requested_from)
      and (requested_to is null or history.received_at < requested_to)
  ), ordered_events as (
    select
      event.*,
      row_number() over (
        partition by event.organization_id, event.supplier_id, event.product_id,
          event.currency, event.unit_of_measure, event.prices_include_tax, event.tax_affectation
        order by event.received_at desc, event.purchase_receipt_id desc,
          event.purchase_receipt_item_id desc
      ) as latest_rank,
      lag(event.unit_cost) over (
        partition by event.organization_id, event.supplier_id, event.product_id,
          event.currency, event.unit_of_measure, event.prices_include_tax, event.tax_affectation
        order by event.received_at asc, event.purchase_receipt_id asc,
          event.purchase_receipt_item_id asc
      ) as previous_unit_cost
    from eligible_events event
  ), aggregated as (
    select
      event.organization_id,
      event.supplier_id,
      event.product_id,
      event.currency,
      event.prices_include_tax,
      event.tax_affectation,
      max(event.supplier_name) filter (where event.latest_rank = 1) as supplier_name,
      max(event.product_code) filter (where event.latest_rank = 1) as product_code,
      max(event.product_description) filter (where event.latest_rank = 1) as product_description,
      max(event.unit_of_measure) filter (where event.latest_rank = 1) as unit_of_measure,
      count(distinct event.purchase_receipt_id)::integer as receipt_count,
      count(distinct event.purchase_order_id)::integer as purchase_count,
      sum(event.quantity) as received_quantity,
      max(event.received_at) as last_received_at,
      max(event.unit_cost) filter (where event.latest_rank = 1) as latest_unit_cost,
      max(event.previous_unit_cost) filter (where event.latest_rank = 1) as previous_unit_cost,
      min(event.unit_cost) as minimum_unit_cost,
      round(sum(event.unit_cost * event.quantity) / nullif(sum(event.quantity), 0), 4)
        as weighted_average_unit_cost,
      max(event.unit_cost) as maximum_unit_cost,
      (array_agg(event.purchase_order_id order by event.received_at desc,
        event.purchase_receipt_id desc, event.purchase_receipt_item_id desc))[1]
        as latest_purchase_order_id,
      (array_agg(event.purchase_receipt_id order by event.received_at desc,
        event.purchase_receipt_id desc, event.purchase_receipt_item_id desc))[1]
        as latest_purchase_receipt_id,
      max(event.order_status) filter (where event.latest_rank = 1) as latest_order_status
    from ordered_events event
    group by event.organization_id, event.supplier_id, event.product_id,
      event.currency, event.unit_of_measure, event.prices_include_tax, event.tax_affectation
  )
  select
    aggregated.organization_id,
    aggregated.supplier_id,
    aggregated.supplier_name,
    aggregated.product_id,
    aggregated.product_code,
    aggregated.product_description,
    aggregated.unit_of_measure,
    aggregated.currency,
    aggregated.prices_include_tax,
    aggregated.tax_affectation,
    aggregated.receipt_count,
    aggregated.purchase_count,
    aggregated.received_quantity,
    aggregated.last_received_at,
    aggregated.latest_unit_cost,
    aggregated.previous_unit_cost,
    case
      when aggregated.latest_unit_cost is null or aggregated.previous_unit_cost is null
        then null
      else round(aggregated.latest_unit_cost - aggregated.previous_unit_cost, 4)
    end as absolute_variation,
    case
      when aggregated.latest_unit_cost is null
        or aggregated.previous_unit_cost is null
        or aggregated.previous_unit_cost = 0 then null
      else round(
        (aggregated.latest_unit_cost - aggregated.previous_unit_cost)
        / aggregated.previous_unit_cost * 100, 2
      )
    end as percentage_variation,
    aggregated.minimum_unit_cost,
    aggregated.weighted_average_unit_cost,
    aggregated.maximum_unit_cost,
    aggregated.latest_purchase_order_id,
    aggregated.latest_purchase_receipt_id,
    aggregated.latest_order_status,
    'registered_unit_cost'::text as cost_basis,
    case
      when aggregated.tax_affectation = 'gravado' and aggregated.prices_include_tax
        then 'includes_igv'
      when aggregated.tax_affectation = 'gravado' and not aggregated.prices_include_tax
        then 'excludes_igv'
      when aggregated.tax_affectation in ('exonerado', 'inafecto')
        then 'not_applicable'
      else 'tax_snapshot_unavailable'
    end::text as tax_basis
  from aggregated;
end;
$$;

revoke all on table public.supplier_price_history,
  public.supplier_purchase_price_summary,
  public.supplier_supplied_products from anon, authenticated;
grant select on table public.supplier_price_history,
  public.supplier_purchase_price_summary,
  public.supplier_supplied_products to authenticated, service_role;

revoke all on function public.get_supplier_purchase_price_history(uuid, uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_supplier_purchase_price_summary(uuid, uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_supplier_purchase_price_history(uuid, uuid, uuid, timestamptz, timestamptz)
  to authenticated, service_role;
grant execute on function public.get_supplier_purchase_price_summary(uuid, uuid, uuid, timestamptz, timestamptz)
  to authenticated, service_role;

commit;
