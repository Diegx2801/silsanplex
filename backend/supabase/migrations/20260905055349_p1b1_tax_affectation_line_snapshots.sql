-- P1B-1: snapshot tributario por linea comercial.
--
-- Las columnas se mantienen nullable para conservar sin inventar los datos de
-- lineas creadas antes de esta fase. Las nuevas escrituras pasan por triggers
-- que capturan el valor persistido del producto o de la linea de origen.

begin;

alter table public.purchase_order_items
  add column tax_affectation text;

alter table public.purchase_receipt_items
  add column tax_affectation text;

alter table public.order_items
  add column tax_affectation text;

alter table public.sale_items
  add column tax_affectation text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.purchase_order_items'::regclass
      and conname = 'purchase_order_items_tax_affectation_valid'
  ) then
    alter table public.purchase_order_items
      add constraint purchase_order_items_tax_affectation_valid
      check (tax_affectation is null or tax_affectation in ('por-definir', 'gravado', 'exonerado', 'inafecto'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.purchase_receipt_items'::regclass
      and conname = 'purchase_receipt_items_tax_affectation_valid'
  ) then
    alter table public.purchase_receipt_items
      add constraint purchase_receipt_items_tax_affectation_valid
      check (tax_affectation is null or tax_affectation in ('por-definir', 'gravado', 'exonerado', 'inafecto'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_tax_affectation_valid'
  ) then
    alter table public.order_items
      add constraint order_items_tax_affectation_valid
      check (tax_affectation is null or tax_affectation in ('por-definir', 'gravado', 'exonerado', 'inafecto'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sale_items'::regclass
      and conname = 'sale_items_tax_affectation_valid'
  ) then
    alter table public.sale_items
      add constraint sale_items_tax_affectation_valid
      check (tax_affectation is null or tax_affectation in ('por-definir', 'gravado', 'exonerado', 'inafecto'));
  end if;
end;
$$;

create or replace function public.snapshot_purchase_order_item_tax_affectation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select product.tax_affectation
      into new.tax_affectation
    from public.products product
    where product.organization_id = new.organization_id
      and product.id = new.product_id;
    if not found then
      raise exception using errcode = '23503', message = 'PURCHASE_ORDER_PRODUCT_INVALID';
    end if;
  elsif new.tax_affectation is distinct from old.tax_affectation then
    raise exception using errcode = '55000', message = 'PURCHASE_ORDER_TAX_AFFECTATION_IMMUTABLE';
  end if;
  return new;
end;
$$;

create or replace function public.snapshot_purchase_receipt_item_tax_affectation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select item.tax_affectation
      into new.tax_affectation
    from public.purchase_order_items item
    where item.organization_id = new.organization_id
      and item.id = new.purchase_order_item_id;
    if not found then
      raise exception using errcode = '23503', message = 'PURCHASE_RECEIPT_ORDER_ITEM_INVALID';
    end if;
  elsif new.tax_affectation is distinct from old.tax_affectation then
    raise exception using errcode = '55000', message = 'PURCHASE_RECEIPT_TAX_AFFECTATION_IMMUTABLE';
  end if;
  return new;
end;
$$;

create or replace function public.snapshot_order_item_tax_affectation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select product.tax_affectation
      into new.tax_affectation
    from public.products product
    where product.organization_id = new.organization_id
      and product.id = new.product_id;
    if not found then
      raise exception using errcode = '23503', message = 'ORDER_PRODUCT_INVALID';
    end if;
  elsif new.tax_affectation is distinct from old.tax_affectation then
    raise exception using errcode = '55000', message = 'ORDER_TAX_AFFECTATION_IMMUTABLE';
  end if;
  return new;
end;
$$;

create or replace function public.snapshot_sale_item_tax_affectation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select item.tax_affectation
      into new.tax_affectation
    from public.order_items item
    where item.organization_id = new.organization_id
      and item.order_id = new.order_id
      and item.id = new.order_item_id;
    if not found then
      raise exception using errcode = '23503', message = 'SALE_ITEM_ORDER_ITEM_INVALID';
    end if;
  elsif new.tax_affectation is distinct from old.tax_affectation then
    raise exception using errcode = '55000', message = 'SALE_TAX_AFFECTATION_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_order_items_snapshot_tax_affectation
  on public.purchase_order_items;
create trigger purchase_order_items_snapshot_tax_affectation
before insert or update on public.purchase_order_items
for each row execute function public.snapshot_purchase_order_item_tax_affectation();

drop trigger if exists purchase_receipt_items_snapshot_tax_affectation
  on public.purchase_receipt_items;
create trigger purchase_receipt_items_snapshot_tax_affectation
before insert or update on public.purchase_receipt_items
for each row execute function public.snapshot_purchase_receipt_item_tax_affectation();

drop trigger if exists order_items_snapshot_tax_affectation
  on public.order_items;
create trigger order_items_snapshot_tax_affectation
before insert or update on public.order_items
for each row execute function public.snapshot_order_item_tax_affectation();

drop trigger if exists sale_items_snapshot_tax_affectation
  on public.sale_items;
create trigger sale_items_snapshot_tax_affectation
before insert or update on public.sale_items
for each row execute function public.snapshot_sale_item_tax_affectation();

revoke all on function public.snapshot_purchase_order_item_tax_affectation() from public, anon, authenticated;
revoke all on function public.snapshot_purchase_receipt_item_tax_affectation() from public, anon, authenticated;
revoke all on function public.snapshot_order_item_tax_affectation() from public, anon, authenticated;
revoke all on function public.snapshot_sale_item_tax_affectation() from public, anon, authenticated;

comment on column public.purchase_order_items.tax_affectation is
  'Snapshot de products.tax_affectation al guardar la orden. NULL solo para lineas historicas previas a P1B-1.';
comment on column public.purchase_receipt_items.tax_affectation is
  'Snapshot heredado de la linea de orden recibida. NULL solo si la linea de orden es historica y no tenia dato.';
comment on column public.order_items.tax_affectation is
  'Snapshot de products.tax_affectation al crear el pedido. NULL solo para lineas historicas previas a P1B-1.';
comment on column public.sale_items.tax_affectation is
  'Snapshot heredado de order_items al convertir el pedido. NULL solo si la linea de pedido es historica y no tenia dato.';

commit;
