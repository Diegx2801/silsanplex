begin;

-- E4A: indicadores operativos objetivos de proveedores.
--
-- La unidad de cantidad es una linea de bien fisico. Las lineas de servicio
-- o recepciones administrativas no participan en las cantidades operativas.
-- Los agregados de cantidad se exponen solo cuando todas las lineas del
-- proveedor comparten una unidad compatible; los conteos por linea y orden
-- permanecen disponibles aun cuando las unidades sean distintas.

create view public.supplier_operational_performance_facts
with (security_invoker = true)
as
with received_by_line as (
  select
    receipt_item.organization_id,
    receipt_item.purchase_order_item_id,
    coalesce(sum(receipt_item.quantity) filter (
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

create view public.supplier_operational_performance_summary
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
    sum(receipt_item.quantity)::numeric as received_quantity_candidate
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

comment on view public.supplier_operational_performance_facts is
  'Hechos E4A por linea de bien fisico: ordenado, recibido, completitud y primeras/ultimas recepciones.';
comment on view public.supplier_operational_performance_summary is
  'Resumen E4A neutral por proveedor. Las cantidades agregadas son nulas cuando las unidades no son comparables.';

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
      sum(receipt_item.quantity)::numeric as received_quantity_candidate
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

revoke all on table public.supplier_operational_performance_facts,
  public.supplier_operational_performance_summary from anon, authenticated;
grant select on table public.supplier_operational_performance_facts,
  public.supplier_operational_performance_summary to authenticated, service_role;

revoke all on function public.get_supplier_operational_performance_summary(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_supplier_operational_performance_summary(uuid, uuid, timestamptz, timestamptz)
  to authenticated, service_role;

commit;
