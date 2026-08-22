-- ============================================================
-- SILSANPLEX: completar datos del catálogo persistente
-- Commit 2: costo y sublínea
-- ============================================================

alter table public.products
  add column subline text,
  add column cost numeric(14, 2);

alter table public.products
  add constraint products_subline_length
    check (subline is null or char_length(btrim(subline)) <= 80),
  add constraint products_cost_nonnegative
    check (cost is null or cost >= 0);

create index products_organization_subline_idx
  on public.products (organization_id, subline)
  where subline is not null;

comment on column public.products.subline is
  'Sublínea textual del catálogo; la normalización con maestros queda para una migración posterior.';

comment on column public.products.cost is
  'Costo base opcional del producto, no utilizado todavía para calcular inventario o márgenes.';
