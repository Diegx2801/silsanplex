-- Una fila por organizacion y producto para consultas paginadas de Existencias.
-- Los buckets se agregan antes del LEFT JOIN con products para evitar que
-- almacenes, ubicaciones, lotes o reservas multipliquen las cantidades.
create view public.inventory_product_stock_summary
with (security_invoker = true)
as
with stock_by_product as (
  select
    bucket.organization_id,
    bucket.product_id,
    sum(bucket.physical_quantity) as physical_quantity,
    sum(bucket.sanitary_available_quantity) as sanitary_available_quantity,
    sum(bucket.reserved_quantity) as reserved_quantity,
    sum(bucket.assignable_quantity) as assignable_quantity,
    sum(bucket.quarantine_quantity) as quarantine_quantity,
    sum(bucket.damaged_quantity) as damaged_quantity,
    sum(bucket.expired_quantity) as expired_quantity,
    sum(bucket.inventory_value) as inventory_value,
    count(distinct bucket.warehouse_id) filter (
      where bucket.physical_quantity > 0
    ) as warehouse_count,
    count(*) filter (
      where bucket.physical_quantity > 0
    ) as bucket_count,
    count(distinct (
      bucket.warehouse_id,
      lower(bucket.lot),
      bucket.expiration_date
    )) filter (
      where bucket.physical_quantity > 0
        and bucket.lot is not null
    ) as lot_count
  from public.inventory_bucket_availability bucket
  group by bucket.organization_id, bucket.product_id
)
select
  product.organization_id,
  product.id as product_id,
  product.code as product_code,
  product.description as product_description,
  product.laboratory,
  product.unit_of_measure,
  coalesce(stock.physical_quantity, 0::numeric) as physical_quantity,
  coalesce(stock.sanitary_available_quantity, 0::numeric)
    as sanitary_available_quantity,
  coalesce(stock.reserved_quantity, 0::numeric) as reserved_quantity,
  coalesce(stock.assignable_quantity, 0::numeric) as assignable_quantity,
  coalesce(stock.quarantine_quantity, 0::numeric) as quarantine_quantity,
  coalesce(stock.damaged_quantity, 0::numeric) as damaged_quantity,
  coalesce(stock.expired_quantity, 0::numeric) as expired_quantity,
  coalesce(stock.inventory_value, 0::numeric) as inventory_value,
  coalesce(stock.warehouse_count, 0::bigint) as warehouse_count,
  coalesce(stock.bucket_count, 0::bigint) as bucket_count,
  coalesce(stock.lot_count, 0::bigint) as lot_count
from public.products product
left join stock_by_product stock
  on stock.organization_id = product.organization_id
 and stock.product_id = product.id;

revoke all on public.inventory_product_stock_summary from public, anon;
grant select on public.inventory_product_stock_summary
  to authenticated, service_role;

comment on view public.inventory_product_stock_summary is
  'Resumen paginable con una fila por organizacion y producto; incluye productos sin stock.';
