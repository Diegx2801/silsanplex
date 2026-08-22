-- ============================================================
-- SILSANPLEX: opciones seguras para filtros del catálogo
-- ============================================================

create view public.product_catalog_options
with (security_invoker = true)
as
select distinct
  organization_id,
  category,
  laboratory
from public.products
where category is not null or laboratory is not null;

revoke all on table public.product_catalog_options from public, anon, authenticated;
grant select on table public.product_catalog_options to authenticated;
