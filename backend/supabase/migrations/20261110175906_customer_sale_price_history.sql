begin;

-- Read the commercial snapshots; no second history ledger or price backfill.
create index sales_customer_price_history_idx
  on public.sales (organization_id, customer_id, sale_date desc, created_at desc, id desc);
create index sale_items_product_history_idx
  on public.sale_items (organization_id, product_id, sale_id, id);

create function public.get_customer_sale_price_history(
  requested_organization_id uuid,
  requested_customer_id uuid,
  requested_product_id uuid default null,
  date_from date default null,
  date_to date default null,
  product_search text default '',
  page_size integer default 21,
  page_offset integer default 0
)
returns table (
  sale_id uuid, sale_item_id uuid, sale_date date, recorded_at timestamptz,
  product_id uuid, product_code text, product_description text,
  customer_id uuid, customer_name text, internal_number text,
  document_type text, document_reference text,
  quantity numeric, unit_of_measure text, unit_price numeric,
  currency text, prices_include_tax boolean, tax_affectation text,
  recorded_by uuid
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
begin
  -- Validate actor permissions before looking up any customer/product identity.
  -- service_role is not an interactive actor and receives no EXECUTE grant.
  if not coalesce(public.has_organization_permission(requested_organization_id, 'SALES_VIEW'), false)
    or not coalesce(public.has_organization_permission(requested_organization_id, 'CUSTOMERS_VIEW'), false) then
    raise exception using errcode = '42501', message = 'CUSTOMER_SALE_HISTORY_FORBIDDEN';
  end if;
  if requested_customer_id is null or requested_organization_id is null
    or page_size is null or page_size not between 1 and 101
    or page_offset is null or page_offset < 0
    or char_length(coalesce(product_search, '')) > 160
    or (date_from is not null and date_to is not null and date_from > date_to) then
    raise exception using errcode = '22023', message = 'CUSTOMER_SALE_HISTORY_FILTER_INVALID';
  end if;

  return query
  select s.id, i.id, s.sale_date, s.created_at,
    i.product_id, i.product_code, i.product_description,
    s.customer_id, c.legal_name, s.internal_number, s.document_type,
    s.series || '-' || s.document_number,
    i.quantity, i.unit_of_measure, i.unit_price,
    -- The commercial sales/quotes model and fiscal adapter support PEN only.
    -- There is no persisted line-discount or separate salesperson field.
    'PEN'::text, s.prices_include_tax, i.tax_affectation, s.created_by
  -- Preserve the indexed sale ordering and per-sale lookups. OFFSET 0 is
  -- an optimizer barrier: flattening these subqueries evaluates expensive
  -- existing RLS predicates across the entire history before LIMIT.
  -- All four relations still execute as the caller under their original RLS.
  from (
    select sale.* from public.sales sale
    where sale.organization_id = requested_organization_id
      and sale.customer_id = requested_customer_id
      and sale.status in ('registrada', 'despachada')
      and (date_from is null or sale.sale_date >= date_from)
      and (date_to is null or sale.sale_date <= date_to)
    order by sale.sale_date desc, sale.created_at desc, sale.id desc offset 0
  ) s
  cross join lateral (
    select item.* from public.sale_items item
    where item.organization_id = requested_organization_id and item.sale_id = s.id
      and (requested_product_id is null or item.product_id = requested_product_id)
      and (nullif(btrim(product_search), '') is null
        or strpos(lower(item.product_code || ' ' || item.product_description), lower(btrim(product_search))) > 0)
    order by item.id desc offset 0
  ) i
  cross join lateral (
    select cust.legal_name from public.customers cust
    where cust.organization_id = requested_organization_id and cust.id = requested_customer_id offset 0
  ) c
  cross join lateral (
    select ord.id from public.orders ord
    where ord.organization_id = requested_organization_id and ord.id = s.order_id
      and ord.status <> 'cancelado' offset 0
  ) o
  order by s.sale_date desc, s.created_at desc, s.id desc, i.id desc
  limit page_size offset page_offset;
end;
$function$;

revoke all on function public.get_customer_sale_price_history(uuid, uuid, uuid, date, date, text, integer, integer)
  from public, anon, service_role;
grant execute on function public.get_customer_sale_price_history(uuid, uuid, uuid, date, date, text, integer, integer)
  to authenticated;

comment on function public.get_customer_sale_price_history(uuid, uuid, uuid, date, date, text, integer, integer) is
  'Commercial sale-line prices, not quotations or payment receipts. PEN is the sole sales currency. Requires active session, SALES_VIEW and CUSTOMERS_VIEW; underlying RLS remains in effect.';
commit;
