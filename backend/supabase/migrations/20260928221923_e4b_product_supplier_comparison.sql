begin;

-- E4B: comparacion objetiva de proveedores para un producto concreto.
--
-- Los costos se obtienen desde E2 para conservar exactamente sus dimensiones
-- y su promedio ponderado. Las cantidades y los tiempos se calculan sobre los
-- hechos E4A, reducidos al producto y a la unidad de medida de la linea.

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
      sum(receipt_item.quantity)::numeric as receipt_received_quantity
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

comment on function public.get_product_supplier_comparison(uuid, uuid, timestamptz, timestamptz) is
  'Comparacion objetiva por producto y proveedor. Compone costos E2 con cantidades, entregas y devoluciones operativas del producto.';

revoke all on function public.get_product_supplier_comparison(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_product_supplier_comparison(uuid, uuid, timestamptz, timestamptz)
  to authenticated, service_role;

commit;
