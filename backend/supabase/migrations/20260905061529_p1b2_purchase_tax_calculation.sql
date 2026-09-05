-- P1B-2: cálculo tributario de compras por snapshot de línea.
--
-- Los totales existentes de órdenes históricas se conservan. Los nuevos
-- desgloses permanecen NULL cuando no pueden reconstruirse sin inventar
-- información fiscal.

begin;

alter table public.purchase_orders
  add column taxable_base numeric(16,2),
  add column exempt_amount numeric(16,2),
  add column unaffected_amount numeric(16,2),
  add column tax_calculation_status text not null default 'legacy_unknown';

alter table public.purchase_orders
  alter column subtotal drop not null,
  alter column tax drop not null,
  alter column total drop not null;

alter table public.purchase_orders
  drop constraint purchase_orders_totals_nonnegative,
  add constraint purchase_orders_totals_nonnegative
    check (
      (subtotal is null or subtotal >= 0)
      and (tax is null or tax >= 0)
      and (total is null or total >= 0)
      and (taxable_base is null or taxable_base >= 0)
      and (exempt_amount is null or exempt_amount >= 0)
      and (unaffected_amount is null or unaffected_amount >= 0)
    ),
  add constraint purchase_orders_tax_calculation_status_valid
    check (tax_calculation_status in ('calculated', 'pending', 'legacy_unknown'));

-- La clasificación es metadata de transición; no recalcula ni modifica
-- subtotal, tax o total existentes.
update public.purchase_orders
set tax_calculation_status = 'legacy_unknown';

create or replace function public.recalculate_purchase_order_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
  includes_tax boolean;
  unknown_line_count integer;
  pending_line_count integer;
begin
  select purchase_order.prices_include_tax
    into includes_tax
  from public.purchase_orders purchase_order
  where purchase_order.id = target_order_id;

  if not found then
    return coalesce(new, old);
  end if;

  select
    count(*) filter (where item.tax_affectation is null),
    count(*) filter (where item.tax_affectation = 'por-definir')
  into unknown_line_count, pending_line_count
  from public.purchase_order_items item
  where item.purchase_order_id = target_order_id;

  if unknown_line_count > 0 then
    update public.purchase_orders
    set tax_calculation_status = 'legacy_unknown'
    where id = target_order_id;
    return coalesce(new, old);
  end if;

  if pending_line_count > 0 then
    update public.purchase_orders
    set taxable_base = null,
        exempt_amount = null,
        unaffected_amount = null,
        subtotal = null,
        tax = null,
        total = null,
        tax_calculation_status = 'pending'
    where id = target_order_id;
    return coalesce(new, old);
  end if;

  with line_amounts as (
    select
      round(item.quantity * item.unit_cost, 2) as line_amount,
      item.tax_affectation
    from public.purchase_order_items item
    where item.purchase_order_id = target_order_id
  ),
  line_tax as (
    select
      line_amount,
      tax_affectation,
      case
        when tax_affectation <> 'gravado' then 0::numeric
        when includes_tax then round(line_amount / 1.18, 2)
        else line_amount
      end as taxable_line,
      case
        when tax_affectation = 'exonerado' then line_amount
        else 0::numeric
      end as exempt_line,
      case
        when tax_affectation = 'inafecto' then line_amount
        else 0::numeric
      end as unaffected_line,
      case
        when tax_affectation <> 'gravado' then 0::numeric
        when includes_tax then round(line_amount - round(line_amount / 1.18, 2), 2)
        else round(line_amount * 0.18, 2)
      end as tax_line
    from line_amounts
  ),
  totals as (
    select
      round(coalesce(sum(taxable_line), 0), 2) as taxable_base_value,
      round(coalesce(sum(exempt_line), 0), 2) as exempt_amount_value,
      round(coalesce(sum(unaffected_line), 0), 2) as unaffected_amount_value,
      round(coalesce(sum(tax_line), 0), 2) as tax_value
    from line_tax
  )
  update public.purchase_orders purchase_order
  set taxable_base = totals.taxable_base_value,
      exempt_amount = totals.exempt_amount_value,
      unaffected_amount = totals.unaffected_amount_value,
      subtotal = round(
        totals.taxable_base_value
        + totals.exempt_amount_value
        + totals.unaffected_amount_value,
        2
      ),
      tax = totals.tax_value,
      total = round(
        totals.taxable_base_value
        + totals.exempt_amount_value
        + totals.unaffected_amount_value
        + totals.tax_value,
        2
      ),
      tax_calculation_status = 'calculated'
  from totals
  where purchase_order.id = target_order_id;

  return coalesce(new, old);
end;
$$;

create or replace function public.issue_purchase_order(
  requested_organization_id uuid,
  requested_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  order_row public.purchase_orders%rowtype;
  issued_order public.purchase_orders%rowtype;
begin
  if actor_id is null
    or not public.has_organization_permission(requested_organization_id, 'PURCHASES_MANAGE') then
    raise exception using errcode = '42501', message = 'PURCHASE_ORDER_FORBIDDEN';
  end if;
  select * into order_row
  from public.purchase_orders purchase
  where purchase.id = requested_order_id
    and purchase.organization_id = requested_organization_id
  for update;
  if not found or order_row.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_ISSUABLE';
  end if;
  if not exists (
    select 1 from public.suppliers supplier
    where supplier.id = order_row.supplier_id
      and supplier.organization_id = requested_organization_id
      and supplier.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_SUPPLIER_UNAVAILABLE';
  end if;
  if not exists (
    select 1 from public.warehouses warehouse
    where warehouse.id = order_row.warehouse_id
      and warehouse.organization_id = requested_organization_id
      and warehouse.is_active
  ) or not exists (
    select 1 from public.warehouse_locations location
    where location.organization_id = requested_organization_id
      and location.warehouse_id = order_row.warehouse_id
      and location.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE';
  end if;
  if not exists (
    select 1 from public.purchase_order_items item
    where item.purchase_order_id = requested_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_ITEMS_REQUIRED';
  end if;
  if exists (
    select 1
    from public.purchase_order_items item
    where item.purchase_order_id = requested_order_id
      and item.tax_affectation is null
  ) then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_TAX_AFFECTATION_LEGACY_UNKNOWN';
  end if;
  if exists (
    select 1
    from public.purchase_order_items item
    where item.purchase_order_id = requested_order_id
      and item.tax_affectation = 'por-definir'
  ) then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_TAX_AFFECTATION_UNDEFINED';
  end if;
  if exists (
    select 1
    from public.purchase_order_items item
    left join public.products product
      on product.id = item.product_id
     and product.organization_id = item.organization_id
    where item.purchase_order_id = requested_order_id
      and (
        product.id is null or not product.is_active
        or (product.batch_control and nullif(btrim(item.lot), '') is null)
        or (product.expiration_control and item.expiration_date is null)
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE';
  end if;

  update public.purchase_orders
  set status = 'issued', issued_at = now(), updated_by = actor_id
  where id = requested_order_id
  returning * into issued_order;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values
  ) values (
    requested_organization_id, actor_id, 'PURCHASE_ORDER_ISSUED',
    'purchase_order', requested_order_id::text,
    to_jsonb(order_row), to_jsonb(issued_order)
  );
end;
$$;

comment on column public.purchase_orders.taxable_base is
  'Base gravada persistida; NULL para calculos pendientes o historicos no reconstruibles.';
comment on column public.purchase_orders.exempt_amount is
  'Importe de operaciones exoneradas; NULL para calculos pendientes o historicos no reconstruibles.';
comment on column public.purchase_orders.unaffected_amount is
  'Importe de operaciones inafectas; NULL para calculos pendientes o historicos no reconstruibles.';
comment on column public.purchase_orders.tax_calculation_status is
  'Estado del calculo tributario: calculated, pending o legacy_unknown.';

commit;
