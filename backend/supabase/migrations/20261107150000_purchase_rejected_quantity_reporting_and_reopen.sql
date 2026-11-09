-- Las cantidades rechazadas no representan cumplimiento ni unidades recibidas.
-- Los reportes y el historial de precios usan el mismo criterio que Compras e Inventario.
begin;

create or replace function public.purchase_receipt_accepted_quantity(
  requested_organization_id uuid,
  requested_receipt_item_id uuid,
  physical_quantity numeric
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select inspection.accepted_quantity
    from public.purchase_receipt_inspections inspection
    where inspection.organization_id = requested_organization_id
      and inspection.purchase_receipt_item_id = requested_receipt_item_id
      and inspection.status = 'completed'
    limit 1
  ), physical_quantity)
$$;

revoke all on function public.purchase_receipt_accepted_quantity(uuid, uuid, numeric)
from public, anon;
grant execute on function public.purchase_receipt_accepted_quantity(uuid, uuid, numeric)
to authenticated, service_role;

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
  public.purchase_receipt_accepted_quantity(receipt_item.organization_id, receipt_item.id, receipt_item.quantity)::numeric(14,3) as quantity,
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

create or replace view public.supplier_operational_performance_facts
with (security_invoker = true)
as
with received_by_line as (
  select
    receipt_item.organization_id,
    receipt_item.purchase_order_item_id,
    coalesce(sum(public.purchase_receipt_accepted_quantity(receipt_item.organization_id, receipt_item.id, receipt_item.quantity)) filter (
      where receipt_item.fulfillment_mode = 'physical'
    ), 0)::numeric as received_quantity,
    min(receipt.received_at) filter (
      where receipt_item.fulfillment_mode = 'physical'
    ) as first_receipt_at,
    max(receipt.received_at) filter (
      where receipt_item.fulfillment_mode = 'physical'
    ) as last_receipt_at
  from public.purchase_receipt_items receipt_item
  join public.purchase_receipts receipt
    on receipt.organization_id = receipt_item.organization_id
   and receipt.id = receipt_item.receipt_id
  group by receipt_item.organization_id, receipt_item.purchase_order_item_id
)
select
  purchase.organization_id,
  purchase.supplier_id,
  purchase.id as purchase_order_id,
  purchase.status as order_status,
  purchase.issued_at,
  purchase.expected_delivery_date,
  purchase.received_at as order_received_at,
  purchase.closed_at,
  item.id as purchase_order_item_id,
  item.product_id,
  item.product_code,
  item.product_description,
  item.unit_of_measure,
  item.product_type,
  item.quantity as ordered_quantity,
  coalesce(received.received_quantity, 0)::numeric as received_quantity,
  coalesce(received.received_quantity, 0) >= item.quantity as complete_line,
  coalesce(received.received_quantity, 0) > item.quantity as over_received_line,
  received.first_receipt_at,
  received.last_receipt_at
from public.purchase_orders purchase
join public.purchase_order_items item
  on item.organization_id = purchase.organization_id
 and item.purchase_order_id = purchase.id
left join received_by_line received
  on received.organization_id = item.organization_id
 and received.purchase_order_item_id = item.id
where purchase.status in ('issued', 'partially_received', 'received', 'closed_partial')
  and item.product_type = 'good'
  and (
    (select auth.role()) = 'service_role'
    or (
      (select public.has_organization_permission(purchase.organization_id, 'PURCHASES_VIEW'))
      and (select public.has_organization_permission(purchase.organization_id, 'SUPPLIERS_VIEW'))
    )
  );

create or replace view public.supplier_operational_performance_summary
with (security_invoker = true)
as
with order_metrics as (
  select
    facts.organization_id,
    facts.supplier_id,
    facts.purchase_order_id,
    max(facts.order_status) as order_status,
    max(facts.issued_at) as issued_at,
    max(facts.expected_delivery_date) as expected_delivery_date,
    max(facts.order_received_at) as order_received_at,
    count(*)::integer as order_lines,
    count(*) filter (where facts.complete_line)::integer as complete_lines,
    count(*) filter (where not facts.complete_line)::integer as incomplete_lines,
    count(*) filter (where facts.over_received_line)::integer as over_received_lines,
    min(facts.first_receipt_at) as first_receipt_at,
    max(facts.last_receipt_at) as last_receipt_at
  from public.supplier_operational_performance_facts facts
  group by facts.organization_id, facts.supplier_id, facts.purchase_order_id
), quantity_metrics as (
  select
    facts.organization_id,
    facts.supplier_id,
    count(*)::integer as total_order_lines,
    count(distinct coalesce(nullif(btrim(facts.unit_of_measure), ''), '__unknown__'))::integer as quantity_dimensions,
    max(nullif(btrim(facts.unit_of_measure), ''))
      filter (where nullif(btrim(facts.unit_of_measure), '') is not null)
      as quantity_unit_candidate,
    sum(facts.ordered_quantity)::numeric as ordered_quantity_candidate,
    sum(facts.received_quantity)::numeric as received_quantity_candidate,
    count(*) filter (where facts.complete_line)::integer as complete_lines,
    count(*) filter (where not facts.complete_line)::integer as incomplete_lines,
    count(*) filter (where facts.over_received_line)::integer as over_received_lines
  from public.supplier_operational_performance_facts facts
  group by facts.organization_id, facts.supplier_id
), received_metrics as (
  select
    purchase.organization_id,
    purchase.supplier_id,
    count(distinct receipt_item.receipt_id)::integer as received_receipts,
    count(distinct coalesce(nullif(btrim(order_item.unit_of_measure), ''), '__unknown__'))::integer as received_quantity_dimensions,
    max(nullif(btrim(order_item.unit_of_measure), ''))
      filter (where nullif(btrim(order_item.unit_of_measure), '') is not null)
      as received_quantity_unit_candidate,
    sum(public.purchase_receipt_accepted_quantity(receipt_item.organization_id, receipt_item.id, receipt_item.quantity))::numeric as received_quantity_candidate
  from public.purchase_receipt_items receipt_item
  join public.purchase_receipts receipt
    on receipt.organization_id = receipt_item.organization_id
   and receipt.id = receipt_item.receipt_id
  join public.purchase_orders purchase
    on purchase.organization_id = receipt_item.organization_id
   and purchase.id = receipt.purchase_order_id
  join public.purchase_order_items order_item
    on order_item.organization_id = receipt_item.organization_id
   and order_item.id = receipt_item.purchase_order_item_id
  where receipt_item.fulfillment_mode = 'physical'
    and order_item.product_type = 'good'
    and purchase.status in ('partially_received', 'received', 'closed_partial')
  group by purchase.organization_id, purchase.supplier_id
), return_metrics as (
  select
    supplier_return.organization_id,
    supplier_return.supplier_id,
    count(*)::integer as completed_returns_count,
    count(distinct supplier_return.product_id)::integer as returned_product_count,
    count(distinct coalesce(nullif(btrim(order_item.unit_of_measure), ''), '__unknown__'))::integer as returned_quantity_dimensions,
    max(nullif(btrim(order_item.unit_of_measure), ''))
      filter (where nullif(btrim(order_item.unit_of_measure), '') is not null)
      as returned_quantity_unit_candidate,
    sum(supplier_return.quantity)::numeric as returned_quantity_candidate
  from public.supplier_returns supplier_return
  join public.purchase_receipt_items receipt_item
    on receipt_item.organization_id = supplier_return.organization_id
   and receipt_item.id = supplier_return.purchase_receipt_item_id
  join public.purchase_order_items order_item
    on order_item.organization_id = supplier_return.organization_id
   and order_item.id = supplier_return.purchase_order_item_id
  join public.purchase_orders purchase
    on purchase.organization_id = supplier_return.organization_id
   and purchase.id = supplier_return.purchase_order_id
  where supplier_return.status = 'completed'
    and receipt_item.fulfillment_mode = 'physical'
    and order_item.product_type = 'good'
    and purchase.status in ('partially_received', 'received', 'closed_partial')
    and purchase.supplier_id = supplier_return.supplier_id
  group by supplier_return.organization_id, supplier_return.supplier_id
)
select
  metrics.organization_id,
  metrics.supplier_id,
  metrics.total_orders,
  quantity.total_order_lines,
  case when quantity.quantity_dimensions = 1
    and quantity.quantity_unit_candidate is not null
    then quantity.ordered_quantity_candidate end as total_ordered_quantity,
  case when quantity.quantity_dimensions = 1
    and quantity.quantity_unit_candidate is not null
    then quantity.received_quantity_candidate end as total_received_quantity,
  case when quantity.quantity_dimensions = 1
    and quantity.quantity_unit_candidate is not null
    and quantity.ordered_quantity_candidate > 0
    then round(100 * quantity.received_quantity_candidate / quantity.ordered_quantity_candidate, 2)
    end as fulfillment_percentage,
  quantity.complete_lines,
  quantity.incomplete_lines,
  quantity.over_received_lines,
  metrics.received_orders,
  metrics.partially_received_orders,
  metrics.closed_partial_orders,
  metrics.orders_with_expected_delivery,
  metrics.on_time_orders,
  metrics.late_orders,
  case when metrics.orders_with_expected_delivery > 0
    then round(100 * metrics.on_time_orders::numeric / metrics.orders_with_expected_delivery, 2)
    end as on_time_percentage,
  metrics.first_receipt_sample_size,
  metrics.complete_delivery_sample_size,
  metrics.last_receipt_sample_size,
  metrics.avg_days_to_first_receipt,
  metrics.avg_days_to_last_receipt,
  metrics.avg_days_to_complete,
  coalesce(returns.completed_returns_count, 0) as completed_returns_count,
  coalesce(returns.returned_product_count, 0) as returned_product_count,
  case when coalesce(returns.returned_quantity_dimensions, 0) = 1
    and returns.returned_quantity_unit_candidate is not null
    then returns.returned_quantity_candidate
    when returns.completed_returns_count is null then 0::numeric
    end as returned_quantity,
  case when coalesce(returns.returned_quantity_dimensions, 0) = 1
    and returns.returned_quantity_unit_candidate is not null
    then returns.returned_quantity_unit_candidate
    end as returned_quantity_unit,
  case when coalesce(returns.completed_returns_count, 0) = 0
    and coalesce(received.received_quantity_dimensions, 0) = 1
    and received.received_quantity_unit_candidate is not null
    then 0::numeric
    when returns.returned_quantity_dimensions = 1
    and returns.returned_quantity_unit_candidate = received.received_quantity_unit_candidate
    and received.received_quantity_dimensions = 1
    and received.received_quantity_candidate > 0
    then round(100 * returns.returned_quantity_candidate / received.received_quantity_candidate, 2)
    end as returned_quantity_percentage,
  quantity.quantity_unit_candidate as quantity_unit,
  quantity.quantity_dimensions,
  metrics.total_orders as sample_size
from (
  select
    order_metrics.organization_id,
    order_metrics.supplier_id,
    count(*)::integer as total_orders,
    count(*) filter (where order_metrics.order_status = 'received')::integer as received_orders,
    count(*) filter (where order_metrics.order_status = 'partially_received')::integer as partially_received_orders,
    count(*) filter (where order_metrics.order_status = 'closed_partial')::integer as closed_partial_orders,
    count(*) filter (
      where order_metrics.order_status = 'received'
        and order_metrics.expected_delivery_date is not null
        and order_metrics.order_received_at is not null
        and order_metrics.issued_at is not null
    )::integer as orders_with_expected_delivery,
    count(*) filter (
      where order_metrics.order_status = 'received'
        and order_metrics.expected_delivery_date is not null
        and order_metrics.order_received_at is not null
        and order_metrics.issued_at is not null
        and order_metrics.order_received_at::date <= order_metrics.expected_delivery_date
    )::integer as on_time_orders,
    count(*) filter (
      where order_metrics.order_status = 'received'
        and order_metrics.expected_delivery_date is not null
        and order_metrics.order_received_at is not null
        and order_metrics.issued_at is not null
        and order_metrics.order_received_at::date > order_metrics.expected_delivery_date
    )::integer as late_orders,
    count(*) filter (
      where order_metrics.first_receipt_at is not null
        and order_metrics.issued_at is not null
    )::integer as first_receipt_sample_size,
    count(*) filter (
      where order_metrics.last_receipt_at is not null
    )::integer as last_receipt_sample_size,
    count(*) filter (
      where order_metrics.order_status = 'received'
        and order_metrics.order_received_at is not null
        and order_metrics.issued_at is not null
    )::integer as complete_delivery_sample_size,
    round((avg(
      extract(epoch from (order_metrics.first_receipt_at - order_metrics.issued_at)) / 86400.0
    ) filter (
      where order_metrics.first_receipt_at is not null
        and order_metrics.issued_at is not null
    ))::numeric, 2) as avg_days_to_first_receipt,
    round((avg(
      extract(epoch from (order_metrics.last_receipt_at - order_metrics.issued_at)) / 86400.0
    ) filter (
      where order_metrics.last_receipt_at is not null
        and order_metrics.issued_at is not null
    ))::numeric, 2) as avg_days_to_last_receipt,
    round((avg(
      extract(epoch from (order_metrics.order_received_at - order_metrics.issued_at)) / 86400.0
    ) filter (
      where order_metrics.order_status = 'received'
        and order_metrics.order_received_at is not null
        and order_metrics.issued_at is not null
    ))::numeric, 2) as avg_days_to_complete
  from order_metrics
  group by order_metrics.organization_id, order_metrics.supplier_id
) metrics
join quantity_metrics quantity
  on quantity.organization_id = metrics.organization_id
 and quantity.supplier_id = metrics.supplier_id
left join received_metrics received
  on received.organization_id = metrics.organization_id
 and received.supplier_id = metrics.supplier_id
left join return_metrics returns
  on returns.organization_id = metrics.organization_id
 and returns.supplier_id = metrics.supplier_id;

create or replace function public.get_supplier_operational_performance_summary(
  requested_organization_id uuid,
  requested_supplier_id uuid default null,
  requested_from timestamptz default null,
  requested_to timestamptz default null
)
returns setof public.supplier_operational_performance_summary
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not public.has_organization_permission(requested_organization_id, 'PURCHASES_VIEW')
    or not public.has_organization_permission(requested_organization_id, 'SUPPLIERS_VIEW') then
    raise exception using errcode = '42501', message = 'E4A_SUPPLIER_PERFORMANCE_FORBIDDEN';
  end if;
  if requested_from is not null and requested_to is not null and requested_from > requested_to then
    raise exception using errcode = '22023', message = 'E4A_PERFORMANCE_PERIOD_INVALID';
  end if;

  return query
  with facts as (
    select facts.*
    from public.supplier_operational_performance_facts facts
    where facts.organization_id = requested_organization_id
      and (requested_supplier_id is null or facts.supplier_id = requested_supplier_id)
      and (requested_from is null or facts.issued_at >= requested_from)
      and (requested_to is null or facts.issued_at < requested_to)
  ), order_metrics as (
    select
      facts.organization_id,
      facts.supplier_id,
      facts.purchase_order_id,
      max(facts.order_status) as order_status,
      max(facts.issued_at) as issued_at,
      max(facts.expected_delivery_date) as expected_delivery_date,
      max(facts.order_received_at) as order_received_at,
      min(facts.first_receipt_at) as first_receipt_at,
      max(facts.last_receipt_at) as last_receipt_at
    from facts
    group by facts.organization_id, facts.supplier_id, facts.purchase_order_id
  ), quantity_metrics as (
    select
      facts.organization_id,
      facts.supplier_id,
      count(*)::integer as total_order_lines,
      count(distinct coalesce(nullif(btrim(facts.unit_of_measure), ''), '__unknown__'))::integer as quantity_dimensions,
      max(nullif(btrim(facts.unit_of_measure), ''))
        filter (where nullif(btrim(facts.unit_of_measure), '') is not null)
        as quantity_unit_candidate,
      sum(facts.ordered_quantity)::numeric as ordered_quantity_candidate,
      sum(facts.received_quantity)::numeric as received_quantity_candidate,
      count(*) filter (where facts.complete_line)::integer as complete_lines,
      count(*) filter (where not facts.complete_line)::integer as incomplete_lines,
      count(*) filter (where facts.over_received_line)::integer as over_received_lines
    from facts
    group by facts.organization_id, facts.supplier_id
  ), received_metrics as (
    select
      purchase.organization_id,
      purchase.supplier_id,
      count(distinct coalesce(nullif(btrim(order_item.unit_of_measure), ''), '__unknown__'))::integer as received_quantity_dimensions,
      max(nullif(btrim(order_item.unit_of_measure), ''))
        filter (where nullif(btrim(order_item.unit_of_measure), '') is not null)
        as received_quantity_unit_candidate,
      sum(public.purchase_receipt_accepted_quantity(receipt_item.organization_id, receipt_item.id, receipt_item.quantity))::numeric as received_quantity_candidate
    from public.purchase_receipt_items receipt_item
    join public.purchase_receipts receipt
      on receipt.organization_id = receipt_item.organization_id
     and receipt.id = receipt_item.receipt_id
    join public.purchase_orders purchase
      on purchase.organization_id = receipt_item.organization_id
     and purchase.id = receipt.purchase_order_id
    join public.purchase_order_items order_item
      on order_item.organization_id = receipt_item.organization_id
     and order_item.id = receipt_item.purchase_order_item_id
    where purchase.organization_id = requested_organization_id
      and receipt_item.fulfillment_mode = 'physical'
      and order_item.product_type = 'good'
      and purchase.status in ('partially_received', 'received', 'closed_partial')
      and (requested_supplier_id is null or purchase.supplier_id = requested_supplier_id)
      and (requested_from is null or receipt.received_at >= requested_from)
      and (requested_to is null or receipt.received_at < requested_to)
    group by purchase.organization_id, purchase.supplier_id
  ), return_metrics as (
    select
      supplier_return.organization_id,
      supplier_return.supplier_id,
      count(*)::integer as completed_returns_count,
      count(distinct supplier_return.product_id)::integer as returned_product_count,
      count(distinct coalesce(nullif(btrim(order_item.unit_of_measure), ''), '__unknown__'))::integer as returned_quantity_dimensions,
      max(nullif(btrim(order_item.unit_of_measure), ''))
        filter (where nullif(btrim(order_item.unit_of_measure), '') is not null)
        as returned_quantity_unit_candidate,
      sum(supplier_return.quantity)::numeric as returned_quantity_candidate
    from public.supplier_returns supplier_return
    join public.purchase_receipt_items receipt_item
      on receipt_item.organization_id = supplier_return.organization_id
     and receipt_item.id = supplier_return.purchase_receipt_item_id
    join public.purchase_order_items order_item
      on order_item.organization_id = supplier_return.organization_id
     and order_item.id = supplier_return.purchase_order_item_id
    join public.purchase_orders purchase
      on purchase.organization_id = supplier_return.organization_id
     and purchase.id = supplier_return.purchase_order_id
    where supplier_return.organization_id = requested_organization_id
      and supplier_return.status = 'completed'
      and receipt_item.fulfillment_mode = 'physical'
      and order_item.product_type = 'good'
      and purchase.status in ('partially_received', 'received', 'closed_partial')
      and purchase.supplier_id = supplier_return.supplier_id
      and (requested_supplier_id is null or supplier_return.supplier_id = requested_supplier_id)
      and (requested_from is null or supplier_return.requested_at >= requested_from::date)
      and (requested_to is null or supplier_return.requested_at < requested_to::date)
    group by supplier_return.organization_id, supplier_return.supplier_id
  ), metrics as (
    select
      order_metrics.organization_id,
      order_metrics.supplier_id,
      count(*)::integer as total_orders,
      count(*) filter (where order_metrics.order_status = 'received')::integer as received_orders,
      count(*) filter (where order_metrics.order_status = 'partially_received')::integer as partially_received_orders,
      count(*) filter (where order_metrics.order_status = 'closed_partial')::integer as closed_partial_orders,
      count(*) filter (
        where order_metrics.order_status = 'received'
          and order_metrics.expected_delivery_date is not null
          and order_metrics.order_received_at is not null
          and order_metrics.issued_at is not null
      )::integer as orders_with_expected_delivery,
      count(*) filter (
        where order_metrics.order_status = 'received'
          and order_metrics.expected_delivery_date is not null
          and order_metrics.order_received_at is not null
          and order_metrics.issued_at is not null
          and order_metrics.order_received_at::date <= order_metrics.expected_delivery_date
      )::integer as on_time_orders,
      count(*) filter (
        where order_metrics.order_status = 'received'
          and order_metrics.expected_delivery_date is not null
          and order_metrics.order_received_at is not null
          and order_metrics.issued_at is not null
          and order_metrics.order_received_at::date > order_metrics.expected_delivery_date
      )::integer as late_orders,
      count(*) filter (where order_metrics.first_receipt_at is not null and order_metrics.issued_at is not null)::integer as first_receipt_sample_size,
      count(*) filter (where order_metrics.last_receipt_at is not null)::integer as last_receipt_sample_size,
      count(*) filter (
        where order_metrics.order_status = 'received'
          and order_metrics.order_received_at is not null
          and order_metrics.issued_at is not null
      )::integer as complete_delivery_sample_size,
      round((avg(extract(epoch from (order_metrics.first_receipt_at - order_metrics.issued_at)) / 86400.0) filter (
        where order_metrics.first_receipt_at is not null and order_metrics.issued_at is not null
      ))::numeric, 2) as avg_days_to_first_receipt,
      round((avg(extract(epoch from (order_metrics.last_receipt_at - order_metrics.issued_at)) / 86400.0) filter (
        where order_metrics.last_receipt_at is not null and order_metrics.issued_at is not null
      ))::numeric, 2) as avg_days_to_last_receipt,
      round((avg(extract(epoch from (order_metrics.order_received_at - order_metrics.issued_at)) / 86400.0) filter (
        where order_metrics.order_status = 'received'
          and order_metrics.order_received_at is not null
          and order_metrics.issued_at is not null
      ))::numeric, 2) as avg_days_to_complete
    from order_metrics
    group by order_metrics.organization_id, order_metrics.supplier_id
  )
  select
    metrics.organization_id,
    metrics.supplier_id,
    metrics.total_orders,
    quantity.total_order_lines,
    case when quantity.quantity_dimensions = 1 and quantity.quantity_unit_candidate is not null then quantity.ordered_quantity_candidate end,
    case when quantity.quantity_dimensions = 1 and quantity.quantity_unit_candidate is not null then quantity.received_quantity_candidate end,
    case when quantity.quantity_dimensions = 1 and quantity.quantity_unit_candidate is not null and quantity.ordered_quantity_candidate > 0
      then round(100 * quantity.received_quantity_candidate / quantity.ordered_quantity_candidate, 2) end,
    quantity.complete_lines,
    quantity.incomplete_lines,
    quantity.over_received_lines,
    metrics.received_orders,
    metrics.partially_received_orders,
    metrics.closed_partial_orders,
    metrics.orders_with_expected_delivery,
    metrics.on_time_orders,
    metrics.late_orders,
    case when metrics.orders_with_expected_delivery > 0 then round(100 * metrics.on_time_orders::numeric / metrics.orders_with_expected_delivery, 2) end,
    metrics.first_receipt_sample_size,
    metrics.complete_delivery_sample_size,
    metrics.last_receipt_sample_size,
    metrics.avg_days_to_first_receipt,
    metrics.avg_days_to_last_receipt,
    metrics.avg_days_to_complete,
    coalesce(returns.completed_returns_count, 0),
    coalesce(returns.returned_product_count, 0),
    case when coalesce(returns.returned_quantity_dimensions, 0) = 1 and returns.returned_quantity_unit_candidate is not null then returns.returned_quantity_candidate
      when returns.completed_returns_count is null then 0::numeric end,
    case when coalesce(returns.returned_quantity_dimensions, 0) = 1 and returns.returned_quantity_unit_candidate is not null then returns.returned_quantity_unit_candidate end,
    case when coalesce(returns.completed_returns_count, 0) = 0 and coalesce(received.received_quantity_dimensions, 0) = 1 and received.received_quantity_unit_candidate is not null then 0::numeric
      when returns.returned_quantity_dimensions = 1 and returns.returned_quantity_unit_candidate = received.received_quantity_unit_candidate and received.received_quantity_dimensions = 1 and received.received_quantity_candidate > 0
        then round(100 * returns.returned_quantity_candidate / received.received_quantity_candidate, 2) end,
    quantity.quantity_unit_candidate,
    quantity.quantity_dimensions,
    metrics.total_orders
  from metrics
  join quantity_metrics quantity
    on quantity.organization_id = metrics.organization_id and quantity.supplier_id = metrics.supplier_id
  left join received_metrics received
    on received.organization_id = metrics.organization_id and received.supplier_id = metrics.supplier_id
  left join return_metrics returns
    on returns.organization_id = metrics.organization_id and returns.supplier_id = metrics.supplier_id;
end;
$$;

create or replace function public.get_product_supplier_comparison(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_from timestamptz default null,
  requested_to timestamptz default null
)
returns table (
  organization_id uuid,
  supplier_id uuid,
  supplier_name text,
  product_id uuid,
  product_code text,
  product_description text,
  comparison_status text,
  comparison_dimension_count integer,
  comparison_key text,
  currency text,
  unit_of_measure text,
  prices_include_tax boolean,
  tax_affectation text,
  tax_basis text,
  cost_basis text,
  latest_unit_cost numeric,
  previous_unit_cost numeric,
  absolute_variation numeric,
  percentage_variation numeric,
  minimum_unit_cost numeric,
  weighted_average_unit_cost numeric,
  maximum_unit_cost numeric,
  price_received_quantity numeric,
  price_receipt_count integer,
  price_purchase_count integer,
  last_price_received_at timestamptz,
  latest_purchase_order_id uuid,
  latest_purchase_receipt_id uuid,
  latest_order_status text,
  total_orders integer,
  total_order_lines integer,
  ordered_quantity numeric,
  received_quantity numeric,
  fulfillment_percentage numeric,
  complete_lines integer,
  incomplete_lines integer,
  over_received_lines integer,
  received_orders integer,
  partially_received_orders integer,
  closed_partial_orders integer,
  operational_receipt_count integer,
  first_receipt_sample_size integer,
  last_receipt_sample_size integer,
  complete_delivery_sample_size integer,
  orders_with_expected_delivery integer,
  on_time_orders integer,
  late_orders integer,
  on_time_percentage numeric,
  avg_days_to_first_receipt numeric,
  avg_days_to_last_receipt numeric,
  avg_days_to_complete numeric,
  completed_returns_count integer,
  affected_receipts_count integer,
  returned_quantity numeric,
  returned_quantity_percentage numeric,
  sample_size integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not public.has_organization_permission(requested_organization_id, 'PURCHASES_VIEW')
    or not public.has_organization_permission(requested_organization_id, 'SUPPLIERS_VIEW') then
    raise exception using errcode = '42501', message = 'E4B_PRODUCT_SUPPLIER_COMPARISON_FORBIDDEN';
  end if;

  if requested_product_id is null then
    raise exception using errcode = '22023', message = 'E4B_PRODUCT_REQUIRED';
  end if;

  if requested_from is not null
    and requested_to is not null
    and requested_from > requested_to then
    raise exception using errcode = '22023', message = 'E4B_PRODUCT_SUPPLIER_COMPARISON_PERIOD_INVALID';
  end if;

  return query
  with price_rows as (
    -- E2 sigue siendo la fuente de verdad de los costos y sus dimensiones.
    select price.*
    from public.get_supplier_purchase_price_summary(
      requested_organization_id,
      requested_product_id,
      null,
      requested_from,
      requested_to
    ) price
  ), price_rows_with_key as (
    select
      price.*,
      coalesce(nullif(btrim(price.unit_of_measure), ''), '__unknown__') as price_unit_key
    from price_rows price
  ), price_dimensions as (
    select count(*)::integer as dimension_count
    from (
      select distinct
        price.currency,
        price.price_unit_key,
        price.prices_include_tax,
        price.tax_affectation
      from price_rows_with_key price
    ) dimensions
  ), operation_lines as (
    select
      facts.organization_id,
      facts.supplier_id,
      facts.purchase_order_id,
      facts.product_id,
      facts.product_code,
      facts.product_description,
      facts.purchase_order_item_id,
      facts.order_status,
      facts.issued_at,
      facts.expected_delivery_date,
      facts.order_received_at,
      facts.ordered_quantity,
      facts.received_quantity,
      facts.complete_line,
      facts.over_received_line,
      facts.first_receipt_at,
      facts.last_receipt_at,
      nullif(btrim(facts.unit_of_measure), '') as unit_display,
      coalesce(nullif(btrim(facts.unit_of_measure), ''), '__unknown__') as unit_key,
      purchase.supplier_name
    from public.supplier_operational_performance_facts facts
    join public.purchase_orders purchase
      on purchase.organization_id = facts.organization_id
     and purchase.id = facts.purchase_order_id
    where facts.organization_id = requested_organization_id
      and facts.product_id = requested_product_id
      and (requested_from is null or facts.issued_at >= requested_from)
      and (requested_to is null or facts.issued_at < requested_to)
  ), operation_metrics as (
    select
      lines.organization_id,
      lines.supplier_id,
      lines.product_id,
      lines.unit_key,
      max(lines.unit_display) as unit_display,
      max(lines.supplier_name) as supplier_name,
      max(lines.product_code) as product_code,
      max(lines.product_description) as product_description,
      count(distinct lines.purchase_order_id)::integer as total_orders,
      count(*)::integer as total_order_lines,
      case when lines.unit_key <> '__unknown__'
        then sum(lines.ordered_quantity)::numeric end as ordered_quantity,
      case when lines.unit_key <> '__unknown__'
        then sum(lines.received_quantity)::numeric end as received_quantity,
      case when lines.unit_key <> '__unknown__'
        and sum(lines.ordered_quantity) > 0
        then round(100 * sum(lines.received_quantity) / sum(lines.ordered_quantity), 2)
      end as fulfillment_percentage,
      count(*) filter (where lines.complete_line)::integer as complete_lines,
      count(*) filter (where not lines.complete_line)::integer as incomplete_lines,
      count(*) filter (where lines.over_received_line)::integer as over_received_lines,
      count(distinct lines.purchase_order_id) filter (
        where lines.order_status = 'received'
      )::integer as received_orders,
      count(distinct lines.purchase_order_id) filter (
        where lines.order_status = 'partially_received'
      )::integer as partially_received_orders,
      count(distinct lines.purchase_order_id) filter (
        where lines.order_status = 'closed_partial'
      )::integer as closed_partial_orders,
      count(*) filter (
        where lines.first_receipt_at is not null
          and lines.issued_at is not null
      )::integer as first_receipt_sample_size,
      count(*) filter (
        where lines.last_receipt_at is not null
          and lines.issued_at is not null
      )::integer as last_receipt_sample_size,
      count(*) filter (
        where lines.order_status = 'received'
          and lines.order_received_at is not null
          and lines.issued_at is not null
      )::integer as complete_delivery_sample_size,
      count(*) filter (
        where lines.order_status = 'received'
          and lines.expected_delivery_date is not null
          and lines.order_received_at is not null
          and lines.issued_at is not null
      )::integer as orders_with_expected_delivery,
      count(*) filter (
        where lines.order_status = 'received'
          and lines.expected_delivery_date is not null
          and lines.order_received_at is not null
          and lines.issued_at is not null
          and lines.order_received_at::date <= lines.expected_delivery_date
      )::integer as on_time_orders,
      count(*) filter (
        where lines.order_status = 'received'
          and lines.expected_delivery_date is not null
          and lines.order_received_at is not null
          and lines.issued_at is not null
          and lines.order_received_at::date > lines.expected_delivery_date
      )::integer as late_orders,
      round((avg(
        extract(epoch from (lines.first_receipt_at - lines.issued_at)) / 86400.0
      ) filter (
        where lines.first_receipt_at is not null
          and lines.issued_at is not null
      ))::numeric, 2) as avg_days_to_first_receipt,
      round((avg(
        extract(epoch from (lines.last_receipt_at - lines.issued_at)) / 86400.0
      ) filter (
        where lines.last_receipt_at is not null
          and lines.issued_at is not null
      ))::numeric, 2) as avg_days_to_last_receipt,
      round((avg(
        extract(epoch from (lines.order_received_at - lines.issued_at)) / 86400.0
      ) filter (
        where lines.order_status = 'received'
          and lines.order_received_at is not null
          and lines.issued_at is not null
      ))::numeric, 2) as avg_days_to_complete
    from operation_lines lines
    group by lines.organization_id, lines.supplier_id, lines.product_id, lines.unit_key
  ), receipt_metrics as (
    select
      purchase.organization_id,
      purchase.supplier_id,
      order_item.product_id,
      coalesce(nullif(btrim(order_item.unit_of_measure), ''), '__unknown__') as unit_key,
      count(distinct receipt_item.receipt_id)::integer as operational_receipt_count,
      sum(public.purchase_receipt_accepted_quantity(receipt_item.organization_id, receipt_item.id, receipt_item.quantity))::numeric as receipt_received_quantity
    from public.purchase_receipt_items receipt_item
    join public.purchase_receipts receipt
      on receipt.organization_id = receipt_item.organization_id
     and receipt.id = receipt_item.receipt_id
    join public.purchase_orders purchase
      on purchase.organization_id = receipt_item.organization_id
     and purchase.id = receipt.purchase_order_id
    join public.purchase_order_items order_item
      on order_item.organization_id = receipt_item.organization_id
     and order_item.id = receipt_item.purchase_order_item_id
    where purchase.organization_id = requested_organization_id
      and purchase.supplier_id is not null
      and order_item.product_id = requested_product_id
      and order_item.product_type = 'good'
      and receipt_item.fulfillment_mode = 'physical'
      and purchase.status in ('issued', 'partially_received', 'received', 'closed_partial')
      and (requested_from is null or purchase.issued_at >= requested_from)
      and (requested_to is null or purchase.issued_at < requested_to)
    group by purchase.organization_id, purchase.supplier_id, order_item.product_id,
      coalesce(nullif(btrim(order_item.unit_of_measure), ''), '__unknown__')
  ), return_metrics as (
    select
      supplier_return.organization_id,
      supplier_return.supplier_id,
      supplier_return.product_id,
      coalesce(nullif(btrim(order_item.unit_of_measure), ''), '__unknown__') as unit_key,
      count(*)::integer as completed_returns_count,
      count(distinct supplier_return.purchase_receipt_item_id)::integer as affected_receipts_count,
      sum(supplier_return.quantity)::numeric as returned_quantity
    from public.supplier_returns supplier_return
    join public.purchase_receipt_items receipt_item
      on receipt_item.organization_id = supplier_return.organization_id
     and receipt_item.id = supplier_return.purchase_receipt_item_id
    join public.purchase_order_items order_item
      on order_item.organization_id = supplier_return.organization_id
     and order_item.id = supplier_return.purchase_order_item_id
    join public.purchase_orders purchase
      on purchase.organization_id = supplier_return.organization_id
     and purchase.id = supplier_return.purchase_order_id
    where supplier_return.organization_id = requested_organization_id
      and supplier_return.status = 'completed'
      and supplier_return.product_id = requested_product_id
      and supplier_return.product_id = order_item.product_id
      and receipt_item.fulfillment_mode = 'physical'
      and order_item.product_type = 'good'
      and purchase.status in ('partially_received', 'received', 'closed_partial')
      and (requested_from is null or supplier_return.requested_at >= requested_from::date)
      and (requested_to is null or supplier_return.requested_at < requested_to::date)
    group by supplier_return.organization_id, supplier_return.supplier_id,
      supplier_return.product_id,
      coalesce(nullif(btrim(order_item.unit_of_measure), ''), '__unknown__')
  )
  select
    requested_organization_id,
    price.supplier_id,
    coalesce(price.supplier_name, operations.supplier_name, 'Proveedor sin nombre'),
    requested_product_id,
    coalesce(price.product_code, operations.product_code),
    coalesce(price.product_description, operations.product_description),
    case
      when price.currency is not null
        and nullif(btrim(price.unit_of_measure), '') is not null
        and price.prices_include_tax is not null
        and price.tax_affectation is not null
        then 'comparable'
      else 'no_comparable'
    end,
    dimensions.dimension_count,
    case
      when price.currency is null
        or nullif(btrim(price.unit_of_measure), '') is null
        or price.prices_include_tax is null
        or price.tax_affectation is null
        then null
      else concat(
        price.currency, '|', price.price_unit_key, '|',
        price.prices_include_tax::text, '|', price.tax_affectation
      )
    end,
    price.currency,
    coalesce(price.unit_of_measure, operations.unit_display),
    price.prices_include_tax,
    price.tax_affectation,
    price.tax_basis,
    price.cost_basis,
    price.latest_unit_cost,
    price.previous_unit_cost,
    price.absolute_variation,
    price.percentage_variation,
    price.minimum_unit_cost,
    price.weighted_average_unit_cost,
    price.maximum_unit_cost,
    price.received_quantity,
    price.receipt_count,
    price.purchase_count,
    price.last_received_at,
    price.latest_purchase_order_id,
    price.latest_purchase_receipt_id,
    price.latest_order_status,
    operations.total_orders,
    operations.total_order_lines,
    operations.ordered_quantity,
    operations.received_quantity,
    operations.fulfillment_percentage,
    operations.complete_lines,
    operations.incomplete_lines,
    operations.over_received_lines,
    operations.received_orders,
    operations.partially_received_orders,
    operations.closed_partial_orders,
    coalesce(receipts.operational_receipt_count, 0),
    operations.first_receipt_sample_size,
    operations.last_receipt_sample_size,
    operations.complete_delivery_sample_size,
    operations.orders_with_expected_delivery,
    operations.on_time_orders,
    operations.late_orders,
    case when operations.orders_with_expected_delivery > 0
      then round(100 * operations.on_time_orders::numeric / operations.orders_with_expected_delivery, 2)
    end,
    operations.avg_days_to_first_receipt,
    operations.avg_days_to_last_receipt,
    operations.avg_days_to_complete,
    coalesce(returns.completed_returns_count, 0),
    coalesce(returns.affected_receipts_count, 0),
    case when operations.unit_key <> '__unknown__'
      then coalesce(returns.returned_quantity, 0::numeric)
    end,
    case when operations.unit_key <> '__unknown__'
      and receipts.receipt_received_quantity > 0
      then round(100 * coalesce(returns.returned_quantity, 0::numeric)
        / receipts.receipt_received_quantity, 2)
    end,
    operations.total_orders
  from price_rows_with_key price
  cross join price_dimensions dimensions
  left join operation_metrics operations
    on operations.organization_id = requested_organization_id
   and operations.supplier_id = price.supplier_id
   and operations.product_id = requested_product_id
   and operations.unit_key = price.price_unit_key
  left join receipt_metrics receipts
    on receipts.organization_id = operations.organization_id
   and receipts.supplier_id = operations.supplier_id
   and receipts.product_id = operations.product_id
   and receipts.unit_key = operations.unit_key
  left join return_metrics returns
    on returns.organization_id = operations.organization_id
   and returns.supplier_id = operations.supplier_id
   and returns.product_id = operations.product_id
   and returns.unit_key = operations.unit_key

  union all

  select
    requested_organization_id,
    operations.supplier_id,
    coalesce(operations.supplier_name, 'Proveedor sin nombre'),
    requested_product_id,
    operations.product_code,
    operations.product_description,
    'no_comparable',
    (select dimension_count from price_dimensions),
    null,
    null,
    operations.unit_display,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    operations.total_orders,
    operations.total_order_lines,
    operations.ordered_quantity,
    operations.received_quantity,
    operations.fulfillment_percentage,
    operations.complete_lines,
    operations.incomplete_lines,
    operations.over_received_lines,
    operations.received_orders,
    operations.partially_received_orders,
    operations.closed_partial_orders,
    coalesce(receipts.operational_receipt_count, 0),
    operations.first_receipt_sample_size,
    operations.last_receipt_sample_size,
    operations.complete_delivery_sample_size,
    operations.orders_with_expected_delivery,
    operations.on_time_orders,
    operations.late_orders,
    case when operations.orders_with_expected_delivery > 0
      then round(100 * operations.on_time_orders::numeric / operations.orders_with_expected_delivery, 2)
    end,
    operations.avg_days_to_first_receipt,
    operations.avg_days_to_last_receipt,
    operations.avg_days_to_complete,
    coalesce(returns.completed_returns_count, 0),
    coalesce(returns.affected_receipts_count, 0),
    case when operations.unit_key <> '__unknown__'
      then coalesce(returns.returned_quantity, 0::numeric)
    end,
    case when operations.unit_key <> '__unknown__'
      and receipts.receipt_received_quantity > 0
      then round(100 * coalesce(returns.returned_quantity, 0::numeric)
        / receipts.receipt_received_quantity, 2)
    end,
    operations.total_orders
  from operation_metrics operations
  left join price_rows_with_key price
    on price.supplier_id = operations.supplier_id
   and price.price_unit_key = operations.unit_key
  left join receipt_metrics receipts
    on receipts.organization_id = operations.organization_id
   and receipts.supplier_id = operations.supplier_id
   and receipts.product_id = operations.product_id
   and receipts.unit_key = operations.unit_key
  left join return_metrics returns
    on returns.organization_id = operations.organization_id
   and returns.supplier_id = operations.supplier_id
   and returns.product_id = operations.product_id
   and returns.unit_key = operations.unit_key
  where price.supplier_id is null
  order by 3, 10 nulls last, 11 nulls last;
end;
$$;

do $$
declare
  legacy_order public.purchase_orders%rowtype;
  reopened_order public.purchase_orders%rowtype;
begin
  for legacy_order in
    select purchase.*
    from public.purchase_orders purchase
    where purchase.status = 'received'
      and exists (
        select 1
        from public.purchase_order_items item
        left join lateral (
          select coalesce(sum(public.purchase_receipt_accepted_quantity(
            receipt_item.organization_id, receipt_item.id, receipt_item.quantity
          )), 0) as accepted_quantity
          from public.purchase_receipt_items receipt_item
          where receipt_item.organization_id = item.organization_id
            and receipt_item.purchase_order_item_id = item.id
        ) accepted on true
        where item.organization_id = purchase.organization_id
          and item.purchase_order_id = purchase.id
          and accepted.accepted_quantity < item.quantity
      )
      and exists (
        select 1
        from public.purchase_receipt_items receipt_item
        join public.purchase_receipt_inspections inspection
          on inspection.organization_id = receipt_item.organization_id
         and inspection.purchase_receipt_item_id = receipt_item.id
         and inspection.status = 'completed'
         and inspection.rejected_quantity > 0
        join public.purchase_receipts receipt
          on receipt.organization_id = receipt_item.organization_id
         and receipt.id = receipt_item.receipt_id
        where receipt.organization_id = purchase.organization_id
          and receipt.purchase_order_id = purchase.id
      )
    for update of purchase
  loop
    update public.purchase_orders purchase
    set status = 'partially_received',
        received_at = null,
        received_by = null,
        updated_at = now()
    where purchase.organization_id = legacy_order.organization_id
      and purchase.id = legacy_order.id
    returning purchase.* into reopened_order;

    insert into public.audit_events (
      organization_id, actor_user_id, action, entity_type, entity_id,
      old_values, new_values, metadata
    ) values (
      legacy_order.organization_id,
      null,
      'PURCHASE_ORDER_REOPENED_REJECTED_BALANCE',
      'purchase_order',
      legacy_order.id::text,
      to_jsonb(legacy_order),
      to_jsonb(reopened_order),
      jsonb_build_object(
        'migration', '20261107150000_purchase_rejected_quantity_reporting_and_reopen',
        'reason', 'La cantidad aceptada de una inspeccion es menor que la cantidad ordenada'
      )
    );
  end loop;
end;
$$;

commit;
