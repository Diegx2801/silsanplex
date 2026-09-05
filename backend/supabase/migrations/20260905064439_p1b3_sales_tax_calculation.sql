-- P1B-3: cálculo tributario de ventas por snapshot de línea.
--
-- Los importes históricos se conservan. Solo se rellenan los nuevos campos
-- cuando el snapshot existente permite reconstruirlos sin consultar el
-- producto actual ni cambiar subtotal, tax o total previamente persistidos.

begin;

alter table public.orders
  add column taxable_base numeric(16,2),
  add column exempt_amount numeric(16,2),
  add column unaffected_amount numeric(16,2),
  add column tax_calculation_status text not null default 'legacy_unknown';

alter table public.orders
  add constraint orders_tax_breakdown_nonnegative
    check (
      taxable_base is null or taxable_base >= 0
    ) ,
  add constraint orders_exempt_amount_nonnegative
    check (exempt_amount is null or exempt_amount >= 0),
  add constraint orders_unaffected_amount_nonnegative
    check (unaffected_amount is null or unaffected_amount >= 0),
  add constraint orders_tax_calculation_status_valid
    check (tax_calculation_status in ('calculated', 'pending', 'legacy_unknown'));

alter table public.sales
  add column taxable_base numeric(16,2),
  add column exempt_amount numeric(16,2),
  add column unaffected_amount numeric(16,2),
  add column tax_calculation_status text not null default 'legacy_unknown';

alter table public.sales
  add constraint sales_tax_breakdown_nonnegative
    check (
      taxable_base is null or taxable_base >= 0
    ),
  add constraint sales_exempt_amount_nonnegative
    check (exempt_amount is null or exempt_amount >= 0),
  add constraint sales_unaffected_amount_nonnegative
    check (unaffected_amount is null or unaffected_amount >= 0),
  add constraint sales_tax_calculation_status_valid
    check (tax_calculation_status in ('calculated', 'pending', 'legacy_unknown'));

comment on column public.orders.taxable_base is
  'Base gravada calculada por línea; NULL cuando el cálculo está pendiente o no es reconstruible.';
comment on column public.orders.exempt_amount is
  'Importe exonerado calculado por línea; NULL cuando el cálculo está pendiente o no es reconstruible.';
comment on column public.orders.unaffected_amount is
  'Importe inafecto calculado por línea; NULL cuando el cálculo está pendiente o no es reconstruible.';
comment on column public.orders.tax_calculation_status is
  'Estado tributario: calculated, pending o legacy_unknown.';
comment on column public.sales.taxable_base is
  'Base gravada calculada por línea; NULL cuando el cálculo está pendiente o no es reconstruible.';
comment on column public.sales.exempt_amount is
  'Importe exonerado calculado por línea; NULL cuando el cálculo está pendiente o no es reconstruible.';
comment on column public.sales.unaffected_amount is
  'Importe inafecto calculado por línea; NULL cuando el cálculo está pendiente o no es reconstruible.';
comment on column public.sales.tax_calculation_status is
  'Estado tributario: calculated, pending o legacy_unknown.';

-- Clasificación de históricos sin consultar products.tax_affectation. Los
-- totales existentes se comparan con el candidato determinista, pero nunca se
-- reemplazan durante la migración.
do $$
declare
  order_row record;
  item_count bigint;
  unknown_count bigint;
  pending_count bigint;
  candidate_taxable_base numeric(16,2);
  candidate_exempt_amount numeric(16,2);
  candidate_unaffected_amount numeric(16,2);
  candidate_subtotal numeric(16,2);
  candidate_tax numeric(16,2);
  candidate_total numeric(16,2);
begin
  for order_row in
    select order_data.*
    from public.orders order_data
  loop
    select count(*),
           count(*) filter (where item.tax_affectation is null),
           count(*) filter (where item.tax_affectation = 'por-definir')
      into item_count, unknown_count, pending_count
    from public.order_items item
    where item.organization_id = order_row.organization_id
      and item.order_id = order_row.id;

    if unknown_count > 0 or item_count = 0 then
      update public.orders
      set taxable_base = null,
          exempt_amount = null,
          unaffected_amount = null,
          tax_calculation_status = 'legacy_unknown'
      where id = order_row.id;
      continue;
    end if;

    if pending_count > 0 then
      update public.orders
      set taxable_base = null,
          exempt_amount = null,
          unaffected_amount = null,
          tax_calculation_status = 'pending'
      where id = order_row.id;
      continue;
    end if;

    with line_amounts as (
      select round(item.quantity * item.unit_price, 2) as line_amount,
             item.tax_affectation
      from public.order_items item
      where item.organization_id = order_row.organization_id
        and item.order_id = order_row.id
    ),
    line_tax as (
      select line_amount,
             tax_affectation,
             case
               when tax_affectation = 'gravado' and order_row.prices_include_tax
                 then round(line_amount / 1.18, 2)
               when tax_affectation = 'gravado' then line_amount
               else 0::numeric
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
               when order_row.prices_include_tax
                 then round(line_amount - round(line_amount / 1.18, 2), 2)
               else round(line_amount * 0.18, 2)
             end as tax_line
      from line_amounts
    )
    select round(coalesce(sum(taxable_line), 0), 2),
           round(coalesce(sum(exempt_line), 0), 2),
           round(coalesce(sum(unaffected_line), 0), 2),
           round(coalesce(sum(taxable_line + exempt_line + unaffected_line), 0), 2),
           round(coalesce(sum(tax_line), 0), 2),
           round(coalesce(sum(taxable_line + exempt_line + unaffected_line + tax_line), 0), 2)
      into candidate_taxable_base,
           candidate_exempt_amount,
           candidate_unaffected_amount,
           candidate_subtotal,
           candidate_tax,
           candidate_total
    from line_tax;

    if order_row.subtotal = candidate_subtotal
       and order_row.tax = candidate_tax
       and order_row.total = candidate_total then
      update public.orders
      set taxable_base = candidate_taxable_base,
          exempt_amount = candidate_exempt_amount,
          unaffected_amount = candidate_unaffected_amount,
          tax_calculation_status = 'calculated'
      where id = order_row.id;
    else
      update public.orders
      set taxable_base = null,
          exempt_amount = null,
          unaffected_amount = null,
          tax_calculation_status = 'legacy_unknown'
      where id = order_row.id;
    end if;
  end loop;
end;
$$;

do $$
declare
  sale_row record;
  item_count bigint;
  unknown_count bigint;
  pending_count bigint;
  candidate_taxable_base numeric(16,2);
  candidate_exempt_amount numeric(16,2);
  candidate_unaffected_amount numeric(16,2);
  candidate_subtotal numeric(16,2);
  candidate_tax numeric(16,2);
  candidate_total numeric(16,2);
begin
  for sale_row in
    select sale_data.*
    from public.sales sale_data
  loop
    select count(*),
           count(*) filter (where item.tax_affectation is null),
           count(*) filter (where item.tax_affectation = 'por-definir')
      into item_count, unknown_count, pending_count
    from public.sale_items item
    where item.organization_id = sale_row.organization_id
      and item.sale_id = sale_row.id;

    if unknown_count > 0 or item_count = 0 then
      update public.sales
      set taxable_base = null,
          exempt_amount = null,
          unaffected_amount = null,
          tax_calculation_status = 'legacy_unknown'
      where id = sale_row.id;
      continue;
    end if;

    if pending_count > 0 then
      update public.sales
      set taxable_base = null,
          exempt_amount = null,
          unaffected_amount = null,
          tax_calculation_status = 'pending'
      where id = sale_row.id;
      continue;
    end if;

    with line_amounts as (
      select round(item.quantity * item.unit_price, 2) as line_amount,
             item.tax_affectation
      from public.sale_items item
      where item.organization_id = sale_row.organization_id
        and item.sale_id = sale_row.id
    ),
    line_tax as (
      select line_amount,
             tax_affectation,
             case
               when tax_affectation = 'gravado' and sale_row.prices_include_tax
                 then round(line_amount / 1.18, 2)
               when tax_affectation = 'gravado' then line_amount
               else 0::numeric
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
               when sale_row.prices_include_tax
                 then round(line_amount - round(line_amount / 1.18, 2), 2)
               else round(line_amount * 0.18, 2)
             end as tax_line
      from line_amounts
    )
    select round(coalesce(sum(taxable_line), 0), 2),
           round(coalesce(sum(exempt_line), 0), 2),
           round(coalesce(sum(unaffected_line), 0), 2),
           round(coalesce(sum(taxable_line + exempt_line + unaffected_line), 0), 2),
           round(coalesce(sum(tax_line), 0), 2),
           round(coalesce(sum(taxable_line + exempt_line + unaffected_line + tax_line), 0), 2)
      into candidate_taxable_base,
           candidate_exempt_amount,
           candidate_unaffected_amount,
           candidate_subtotal,
           candidate_tax,
           candidate_total
    from line_tax;

    if sale_row.subtotal = candidate_subtotal
       and sale_row.tax = candidate_tax
       and sale_row.total = candidate_total then
      update public.sales
      set taxable_base = candidate_taxable_base,
          exempt_amount = candidate_exempt_amount,
          unaffected_amount = candidate_unaffected_amount,
          tax_calculation_status = 'calculated'
      where id = sale_row.id;
    else
      update public.sales
      set taxable_base = null,
          exempt_amount = null,
          unaffected_amount = null,
          tax_calculation_status = 'legacy_unknown'
      where id = sale_row.id;
    end if;
  end loop;
end;
$$;

create or replace function public.recalculate_order_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid := coalesce(new.organization_id, old.organization_id);
  target_order_id uuid := coalesce(new.order_id, old.order_id);
  includes_tax boolean;
  unknown_line_count bigint;
  pending_line_count bigint;
begin
  select order_row.prices_include_tax
    into includes_tax
  from public.orders order_row
  where order_row.organization_id = target_organization_id
    and order_row.id = target_order_id;
  if not found then
    return coalesce(new, old);
  end if;

  select count(*) filter (where item.tax_affectation is null),
         count(*) filter (where item.tax_affectation = 'por-definir')
    into unknown_line_count, pending_line_count
  from public.order_items item
  where item.organization_id = target_organization_id
    and item.order_id = target_order_id;

  if unknown_line_count > 0 then
    update public.orders
    set taxable_base = null,
        exempt_amount = null,
        unaffected_amount = null,
        tax_calculation_status = 'legacy_unknown'
    where organization_id = target_organization_id
      and id = target_order_id;
    return coalesce(new, old);
  end if;

  if pending_line_count > 0 then
    update public.orders
    set taxable_base = null,
        exempt_amount = null,
        unaffected_amount = null,
        tax_calculation_status = 'pending'
    where organization_id = target_organization_id
      and id = target_order_id;
    return coalesce(new, old);
  end if;

  with line_amounts as (
    select round(item.quantity * item.unit_price, 2) as line_amount,
           item.tax_affectation
    from public.order_items item
    where item.organization_id = target_organization_id
      and item.order_id = target_order_id
  ),
  line_tax as (
    select line_amount,
           case
             when tax_affectation = 'gravado' and includes_tax
               then round(line_amount / 1.18, 2)
             when tax_affectation = 'gravado' then line_amount
             else 0::numeric
           end as taxable_line,
           case when tax_affectation = 'exonerado' then line_amount else 0::numeric end as exempt_line,
           case when tax_affectation = 'inafecto' then line_amount else 0::numeric end as unaffected_line,
           case
             when tax_affectation <> 'gravado' then 0::numeric
             when includes_tax then round(line_amount - round(line_amount / 1.18, 2), 2)
             else round(line_amount * 0.18, 2)
           end as tax_line
    from line_amounts
  ),
  totals as (
    select round(coalesce(sum(taxable_line), 0), 2) as taxable_base_value,
           round(coalesce(sum(exempt_line), 0), 2) as exempt_amount_value,
           round(coalesce(sum(unaffected_line), 0), 2) as unaffected_amount_value,
           round(coalesce(sum(tax_line), 0), 2) as tax_value
    from line_tax
  )
  update public.orders order_row
  set taxable_base = totals.taxable_base_value,
      exempt_amount = totals.exempt_amount_value,
      unaffected_amount = totals.unaffected_amount_value,
      subtotal = round(
        totals.taxable_base_value + totals.exempt_amount_value + totals.unaffected_amount_value,
        2
      ),
      tax = totals.tax_value,
      total = round(
        totals.taxable_base_value + totals.exempt_amount_value + totals.unaffected_amount_value + totals.tax_value,
        2
      ),
      tax_calculation_status = 'calculated'
  from totals
  where order_row.organization_id = target_organization_id
    and order_row.id = target_order_id;

  return coalesce(new, old);
end;
$$;

create or replace function public.recalculate_sale_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid := coalesce(new.organization_id, old.organization_id);
  target_sale_id uuid := coalesce(new.sale_id, old.sale_id);
  includes_tax boolean;
  unknown_line_count bigint;
  pending_line_count bigint;
begin
  select sale_row.prices_include_tax
    into includes_tax
  from public.sales sale_row
  where sale_row.organization_id = target_organization_id
    and sale_row.id = target_sale_id;
  if not found then
    return coalesce(new, old);
  end if;

  select count(*) filter (where item.tax_affectation is null),
         count(*) filter (where item.tax_affectation = 'por-definir')
    into unknown_line_count, pending_line_count
  from public.sale_items item
  where item.organization_id = target_organization_id
    and item.sale_id = target_sale_id;

  if unknown_line_count > 0 then
    update public.sales
    set taxable_base = null,
        exempt_amount = null,
        unaffected_amount = null,
        tax_calculation_status = 'legacy_unknown'
    where organization_id = target_organization_id
      and id = target_sale_id;
    return coalesce(new, old);
  end if;

  if pending_line_count > 0 then
    update public.sales
    set taxable_base = null,
        exempt_amount = null,
        unaffected_amount = null,
        tax_calculation_status = 'pending'
    where organization_id = target_organization_id
      and id = target_sale_id;
    return coalesce(new, old);
  end if;

  with line_amounts as (
    select round(item.quantity * item.unit_price, 2) as line_amount,
           item.tax_affectation
    from public.sale_items item
    where item.organization_id = target_organization_id
      and item.sale_id = target_sale_id
  ),
  line_tax as (
    select line_amount,
           case
             when tax_affectation = 'gravado' and includes_tax
               then round(line_amount / 1.18, 2)
             when tax_affectation = 'gravado' then line_amount
             else 0::numeric
           end as taxable_line,
           case when tax_affectation = 'exonerado' then line_amount else 0::numeric end as exempt_line,
           case when tax_affectation = 'inafecto' then line_amount else 0::numeric end as unaffected_line,
           case
             when tax_affectation <> 'gravado' then 0::numeric
             when includes_tax then round(line_amount - round(line_amount / 1.18, 2), 2)
             else round(line_amount * 0.18, 2)
           end as tax_line
    from line_amounts
  ),
  totals as (
    select round(coalesce(sum(taxable_line), 0), 2) as taxable_base_value,
           round(coalesce(sum(exempt_line), 0), 2) as exempt_amount_value,
           round(coalesce(sum(unaffected_line), 0), 2) as unaffected_amount_value,
           round(coalesce(sum(tax_line), 0), 2) as tax_value
    from line_tax
  )
  update public.sales sale_row
  set taxable_base = totals.taxable_base_value,
      exempt_amount = totals.exempt_amount_value,
      unaffected_amount = totals.unaffected_amount_value,
      subtotal = round(
        totals.taxable_base_value + totals.exempt_amount_value + totals.unaffected_amount_value,
        2
      ),
      tax = totals.tax_value,
      total = round(
        totals.taxable_base_value + totals.exempt_amount_value + totals.unaffected_amount_value + totals.tax_value,
        2
      ),
      tax_calculation_status = 'calculated'
  from totals
  where sale_row.organization_id = target_organization_id
    and sale_row.id = target_sale_id;

  return coalesce(new, old);
end;
$$;

create or replace function public.require_defined_order_tax_affectation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('p1b3.enforce_tax_affectation', true), 'off') <> 'on' then
    return new;
  end if;
  if new.tax_affectation is null then
    raise exception using errcode = 'P0001', message = 'ORDER_TAX_AFFECTATION_LEGACY_UNKNOWN';
  end if;
  if new.tax_affectation = 'por-definir' then
    raise exception using errcode = 'P0001', message = 'ORDER_TAX_AFFECTATION_UNDEFINED';
  end if;
  return new;
end;
$$;

create or replace function public.require_defined_sale_tax_affectation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('p1b3.enforce_tax_affectation', true), 'off') <> 'on' then
    return new;
  end if;
  if new.tax_affectation is null then
    raise exception using errcode = 'P0001', message = 'SALE_TAX_AFFECTATION_LEGACY_UNKNOWN';
  end if;
  if new.tax_affectation = 'por-definir' then
    raise exception using errcode = 'P0001', message = 'SALE_TAX_AFFECTATION_UNDEFINED';
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_require_defined_tax_affectation on public.order_items;
create trigger order_items_require_defined_tax_affectation
after insert or update on public.order_items
for each row execute function public.require_defined_order_tax_affectation();

drop trigger if exists sale_items_require_defined_tax_affectation on public.sale_items;
create trigger sale_items_require_defined_tax_affectation
after insert or update on public.sale_items
for each row execute function public.require_defined_sale_tax_affectation();

-- Solo los endpoints de creación/conversión activan el rechazo de nuevas
-- líneas sin afectación. Esto deja a las operaciones administrativas internas
-- la posibilidad de conservar históricos como pending/legacy_unknown.
create or replace function public.create_order(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_order_id uuid;
  previous_tax_enforcement text := current_setting('p1b3.enforce_tax_affectation', true);
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  if target_organization_id is null
     or not public.has_organization_permission(target_organization_id, 'SALES_MANAGE') then
    raise exception using errcode = '42501', message = 'ORDER_FORBIDDEN';
  end if;

  perform set_config('p1b3.enforce_tax_affectation', 'on', true);
  begin
    target_order_id := public.create_order_unchecked(payload);
    perform set_config('p1b3.enforce_tax_affectation', coalesce(previous_tax_enforcement, 'off'), true);
    return target_order_id;
  exception
    when others then
      perform set_config('p1b3.enforce_tax_affectation', coalesce(previous_tax_enforcement, 'off'), true);
      raise;
  end;
end;
$$;

create or replace function public.create_sale_from_order(
  requested_organization_id uuid,
  requested_order_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_sale_id uuid;
  previous_tax_enforcement text := current_setting('p1b3.enforce_tax_affectation', true);
begin
  if actor_id is null
     or requested_organization_id is null
     or not public.has_organization_permission(requested_organization_id, 'SALES_MANAGE') then
    raise exception using errcode = '42501', message = 'SALE_FORBIDDEN';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'SALE_PAYLOAD_INVALID';
  end if;

  perform set_config('p1b3.enforce_tax_affectation', 'on', true);
  begin
    target_sale_id := public.create_sale_from_order_unchecked(
      requested_organization_id,
      requested_order_id,
      payload
    );
    perform set_config('p1b3.enforce_tax_affectation', coalesce(previous_tax_enforcement, 'off'), true);
    return target_sale_id;
  exception
    when others then
      perform set_config('p1b3.enforce_tax_affectation', coalesce(previous_tax_enforcement, 'off'), true);
      raise;
  end;
end;
$$;

-- El despacho es una transición operativa posterior al cálculo. Las órdenes
-- históricas ya atendidas pueden seguir siendo consultadas/reintentadas; solo
-- se exige cálculo cuando el flujo aún está abierto para despacho.
create or replace function public.dispatch_order_from_reservations(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_order_id uuid;
  target_sale_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_DISPATCH_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_order_id := nullif(payload ->> 'order_id', '')::uuid;
  target_sale_id := nullif(payload ->> 'sale_id', '')::uuid;
  if target_organization_id is null
     or not public.has_organization_permission(target_organization_id, 'DISTRIBUTION_MANAGE')
     or not public.has_organization_permission(target_organization_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'ORDER_DISPATCH_FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.orders order_row
    join public.sales sale_row
      on sale_row.organization_id = order_row.organization_id
     and sale_row.order_id = order_row.id
     and (target_sale_id is null or sale_row.id = target_sale_id)
    where order_row.organization_id = target_organization_id
      and order_row.id = target_order_id
      and order_row.status = 'confirmado'
      and sale_row.status = 'registrada'
      and (
        order_row.tax_calculation_status is distinct from 'calculated'
        or sale_row.tax_calculation_status is distinct from 'calculated'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'ORDER_TAX_CALCULATION_REQUIRED';
  end if;

  return public.dispatch_order_from_reservations_unchecked(payload);
end;
$$;

alter function public.recalculate_order_totals() owner to postgres;
alter function public.recalculate_sale_totals() owner to postgres;
revoke all on function public.recalculate_order_totals() from public, anon, authenticated, service_role;
revoke all on function public.recalculate_sale_totals() from public, anon, authenticated, service_role;
revoke all on function public.require_defined_order_tax_affectation() from public, anon, authenticated, service_role;
revoke all on function public.require_defined_sale_tax_affectation() from public, anon, authenticated, service_role;
revoke all on function public.dispatch_order_from_reservations(jsonb)
  from public, anon, authenticated;
grant execute on function public.dispatch_order_from_reservations(jsonb) to authenticated;

commit;
