-- Extiende el contrato agregado que consume React. Los conteos se calculan en
-- PostgreSQL por bucket; la UI no necesita descargar el ledger para conocerlos.
create or replace view public.inventory_stock_summary
with (security_invoker = true)
as
select
  bucket.organization_id,
  bucket.product_id,
  bucket.product_code,
  bucket.product_description,
  bucket.unit_of_measure,
  bucket.warehouse_id,
  bucket.warehouse_code,
  bucket.warehouse_name,
  sum(bucket.physical_quantity) as physical_quantity,
  sum(bucket.sanitary_available_quantity) as sanitary_available_quantity,
  sum(bucket.reserved_quantity) as reserved_quantity,
  sum(bucket.assignable_quantity) as assignable_quantity,
  sum(bucket.quarantine_quantity) as quarantine_quantity,
  sum(bucket.damaged_quantity) as damaged_quantity,
  sum(bucket.expired_quantity) as expired_quantity,
  sum(bucket.inventory_value) as inventory_value,
  count(*) filter (where bucket.physical_quantity > 0) as bucket_count,
  count(distinct (lower(bucket.lot), bucket.expiration_date)) filter (
    where bucket.physical_quantity > 0 and bucket.lot is not null
  ) as lot_count
from public.inventory_bucket_availability bucket
group by
  bucket.organization_id, bucket.product_id, bucket.product_code,
  bucket.product_description, bucket.unit_of_measure, bucket.warehouse_id,
  bucket.warehouse_code, bucket.warehouse_name;

revoke all on public.inventory_stock_summary from public, anon;
grant select on public.inventory_stock_summary to authenticated, service_role;
