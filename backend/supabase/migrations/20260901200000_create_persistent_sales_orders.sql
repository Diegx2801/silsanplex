-- SILSANPLEX: persistencia comercial minima para pedidos y ventas.
-- Esta migracion no reserva stock ni genera movimientos de inventario.

-- products usa id global, pero la FK compuesta evita que una entidad
-- comercial pueda asociar accidentalmente un producto de otra organizacion.
alter table public.products
  add constraint products_organization_id_id_key unique (organization_id, id);

-- Distribucion ya es operada por LOGISTICA y necesita leer el cliente de un
-- pedido persistente. Se reutiliza CUSTOMERS_VIEW; no se crea una capacidad
-- comercial nueva ni se modifica el modelo de permisos.
insert into public.role_permissions (role_code, permission_code)
values ('LOGISTICA', 'CUSTOMERS_VIEW')
on conflict do nothing;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_number text not null,
  source_quote_id uuid,
  source_quote_number text,
  customer_id uuid not null,
  order_date date not null default current_date,
  status text not null default 'confirmado',
  prices_include_tax boolean not null default true,
  notes text not null default '',
  subtotal numeric(16,2) not null default 0,
  tax numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  operation_key uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_organization_id_id_key unique (organization_id, id),
  constraint orders_customer_same_organization
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint orders_order_number_format check (order_number ~ '^PED-[0-9]{6}$'),
  constraint orders_source_quote_number_length
    check (source_quote_number is null or char_length(btrim(source_quote_number)) between 1 and 30),
  constraint orders_notes_length check (char_length(notes) <= 300),
  constraint orders_status_valid check (status in ('confirmado', 'atendido', 'cancelado')),
  constraint orders_totals_nonnegative check (subtotal >= 0 and tax >= 0 and total >= 0),
  constraint orders_operation_key_not_null check (operation_key is not null)
);

create unique index orders_organization_number_unique
  on public.orders (organization_id, order_number);
create unique index orders_organization_operation_unique
  on public.orders (organization_id, operation_key);
create unique index orders_organization_source_quote_unique
  on public.orders (organization_id, source_quote_id)
  where source_quote_id is not null;
create index orders_organization_status_created_idx
  on public.orders (organization_id, status, created_at desc, id);
create index orders_organization_customer_created_idx
  on public.orders (organization_id, customer_id, created_at desc, id);

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id uuid not null,
  product_id uuid not null,
  product_code text not null,
  product_description text not null,
  unit_of_measure text,
  quantity numeric(14,3) not null,
  unit_price numeric(16,4) not null,
  line_subtotal numeric(18,4)
    generated always as (round(quantity * unit_price, 4)) stored,
  created_at timestamptz not null default now(),

  constraint order_items_organization_order_id_key unique (organization_id, order_id, id),
  constraint order_items_order_same_organization
    foreign key (organization_id, order_id)
    references public.orders (organization_id, id) on delete cascade,
  constraint order_items_product_same_organization
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_price_nonnegative check (unit_price >= 0),
  constraint order_items_product_snapshot_length
    check (char_length(btrim(product_code)) between 1 and 30 and char_length(btrim(product_description)) between 2 and 160),
  constraint order_items_unit_length
    check (unit_of_measure is null or char_length(btrim(unit_of_measure)) <= 40)
);

create unique index order_items_order_product_unique
  on public.order_items (organization_id, order_id, product_id);
create index order_items_organization_order_idx
  on public.order_items (organization_id, order_id, id);
create index order_items_product_idx
  on public.order_items (organization_id, product_id, id);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id uuid not null,
  customer_id uuid not null,
  internal_number text not null,
  document_type text not null,
  series text not null,
  document_number text not null,
  sale_date date not null,
  warehouse text not null,
  prices_include_tax boolean not null default true,
  status text not null default 'registrada',
  subtotal numeric(16,2) not null default 0,
  tax numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  operation_key uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sales_organization_id_id_key unique (organization_id, id),
  constraint sales_order_same_organization
    foreign key (organization_id, order_id)
    references public.orders (organization_id, id) on delete restrict,
  constraint sales_customer_same_organization
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint sales_internal_number_format check (internal_number ~ '^VEN-[0-9]{6}$'),
  constraint sales_document_type_valid check (document_type in ('factura', 'boleta', 'nota-venta')),
  constraint sales_series_length check (char_length(btrim(series)) between 1 and 10),
  constraint sales_document_number_length check (char_length(btrim(document_number)) between 1 and 20),
  constraint sales_warehouse_length check (char_length(btrim(warehouse)) between 2 and 80),
  constraint sales_status_valid check (status in ('registrada', 'despachada')),
  constraint sales_totals_nonnegative check (subtotal >= 0 and tax >= 0 and total >= 0),
  constraint sales_operation_key_not_null check (operation_key is not null)
);

create unique index sales_organization_order_unique
  on public.sales (organization_id, order_id);
create unique index sales_organization_internal_number_unique
  on public.sales (organization_id, internal_number);
create unique index sales_organization_document_unique
  on public.sales (organization_id, document_type, series, document_number);
create unique index sales_organization_operation_unique
  on public.sales (organization_id, operation_key);
create index sales_organization_status_created_idx
  on public.sales (organization_id, status, created_at desc, id);
create index sales_organization_customer_created_idx
  on public.sales (organization_id, customer_id, created_at desc, id);

create trigger sales_set_updated_at
before update on public.sales
for each row execute function public.set_updated_at();

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  order_id uuid not null,
  order_item_id uuid not null,
  product_id uuid not null,
  product_code text not null,
  product_description text not null,
  unit_of_measure text,
  quantity numeric(14,3) not null,
  unit_price numeric(16,4) not null,
  line_subtotal numeric(18,4)
    generated always as (round(quantity * unit_price, 4)) stored,
  created_at timestamptz not null default now(),

  constraint sale_items_sale_identity_key unique (organization_id, sale_id, id),
  constraint sale_items_sale_same_organization
    foreign key (organization_id, sale_id)
    references public.sales (organization_id, id) on delete cascade,
  constraint sale_items_order_same_organization
    foreign key (organization_id, order_id)
    references public.orders (organization_id, id) on delete restrict,
  constraint sale_items_order_item_same_organization
    foreign key (organization_id, order_id, order_item_id)
    references public.order_items (organization_id, order_id, id) on delete restrict,
  constraint sale_items_product_same_organization
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint sale_items_quantity_positive check (quantity > 0),
  constraint sale_items_price_nonnegative check (unit_price >= 0),
  constraint sale_items_product_snapshot_length
    check (char_length(btrim(product_code)) between 1 and 30 and char_length(btrim(product_description)) between 2 and 160),
  constraint sale_items_unit_length
    check (unit_of_measure is null or char_length(btrim(unit_of_measure)) <= 40)
);

create unique index sale_items_sale_order_item_unique
  on public.sale_items (organization_id, sale_id, order_item_id);
create index sale_items_organization_sale_idx
  on public.sale_items (organization_id, sale_id, id);

create or replace function public.validate_sale_item_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  sale_order_id uuid;
begin
  select sale.order_id
    into sale_order_id
  from public.sales sale
  where sale.organization_id = new.organization_id
    and sale.id = new.sale_id;

  if sale_order_id is null or sale_order_id <> new.order_id then
    raise exception using errcode = '23514', message = 'SALE_ITEM_ORDER_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger sale_items_validate_identity
before insert or update on public.sale_items
for each row execute function public.validate_sale_item_identity();

create or replace function public.recalculate_order_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid := coalesce(new.order_id, old.order_id);
  line_total numeric(18,4);
  includes_tax boolean;
begin
  select coalesce(sum(item.line_subtotal), 0)
    into line_total
  from public.order_items item
  where item.organization_id = coalesce(new.organization_id, old.organization_id)
    and item.order_id = target_order_id;

  select order_row.prices_include_tax
    into includes_tax
  from public.orders order_row
  where order_row.id = target_order_id;

  update public.orders
  set subtotal = case when includes_tax then round(line_total / 1.18, 2) else round(line_total, 2) end,
      tax = case when includes_tax then round(line_total - (line_total / 1.18), 2) else round(line_total * 0.18, 2) end,
      total = case when includes_tax then round(line_total, 2) else round(line_total * 1.18, 2) end
  where id = target_order_id;
  return coalesce(new, old);
end;
$$;

create trigger order_items_recalculate_totals
after insert or update or delete on public.order_items
for each row execute function public.recalculate_order_totals();

create or replace function public.recalculate_sale_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_sale_id uuid := coalesce(new.sale_id, old.sale_id);
  line_total numeric(18,4);
  includes_tax boolean;
begin
  select coalesce(sum(item.line_subtotal), 0)
    into line_total
  from public.sale_items item
  where item.organization_id = coalesce(new.organization_id, old.organization_id)
    and item.sale_id = target_sale_id;

  select sale.prices_include_tax
    into includes_tax
  from public.sales sale
  where sale.id = target_sale_id;

  update public.sales
  set subtotal = case when includes_tax then round(line_total / 1.18, 2) else round(line_total, 2) end,
      tax = case when includes_tax then round(line_total - (line_total / 1.18), 2) else round(line_total * 0.18, 2) end,
      total = case when includes_tax then round(line_total, 2) else round(line_total * 1.18, 2) end
  where id = target_sale_id;
  return coalesce(new, old);
end;
$$;

create trigger sale_items_recalculate_totals
after insert or update or delete on public.sale_items
for each row execute function public.recalculate_sale_totals();

create or replace function public.create_order(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_organization_id uuid;
  target_customer_id uuid;
  target_order_id uuid;
  target_operation_key uuid;
  target_source_quote_id uuid;
  target_order_number text;
  next_number bigint;
  line jsonb;
  target_quantity numeric;
  target_unit_price numeric;
  target_date date;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_customer_id := nullif(payload ->> 'customer_id', '')::uuid;
  target_operation_key := nullif(payload ->> 'operation_key', '')::uuid;
  target_source_quote_id := nullif(payload ->> 'source_quote_id', '')::uuid;
  target_date := coalesce(nullif(payload ->> 'order_date', '')::date, current_date);

  if target_organization_id is null or not public.is_organization_member(target_organization_id) then
    raise exception using errcode = '42501', message = 'ORDER_FORBIDDEN';
  end if;
  if target_operation_key is null then
    raise exception using errcode = '22023', message = 'ORDER_OPERATION_KEY_REQUIRED';
  end if;
  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'ORDER_ITEMS_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_organization_id::text || ':order-operation:' || target_operation_key::text, 0));

  select order_row.id into target_order_id
  from public.orders order_row
  where order_row.organization_id = target_organization_id
    and order_row.operation_key = target_operation_key;
  if target_order_id is not null then
    return target_order_id;
  end if;

  if target_source_quote_id is not null then
    select order_row.id into target_order_id
    from public.orders order_row
    where order_row.organization_id = target_organization_id
      and order_row.source_quote_id = target_source_quote_id;
    if target_order_id is not null then
      return target_order_id;
    end if;
  end if;

  perform 1
  from public.customers customer
  where customer.id = target_customer_id
    and customer.organization_id = target_organization_id
    and customer.is_active
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_CUSTOMER_UNAVAILABLE';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(payload -> 'items') item
    group by item ->> 'product_id'
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'ORDER_DUPLICATE_PRODUCT';
  end if;

  for line in select value from jsonb_array_elements(payload -> 'items')
  loop
    if nullif(line ->> 'product_id', '') is null then
      raise exception using errcode = '22023', message = 'ORDER_PRODUCT_REQUIRED';
    end if;
    target_quantity := (line ->> 'quantity')::numeric;
    target_unit_price := (line ->> 'unit_price')::numeric;
    if target_quantity is null or target_quantity <= 0
       or target_unit_price is null or target_unit_price < 0 then
      raise exception using errcode = '22023', message = 'ORDER_ITEM_VALUES_INVALID';
    end if;
    if not exists (
      select 1 from public.products product
      where product.id = (line ->> 'product_id')::uuid
        and product.organization_id = target_organization_id
        and product.is_active
    ) then
      raise exception using errcode = 'P0001', message = 'ORDER_PRODUCT_UNAVAILABLE';
    end if;
  end loop;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_organization_id::text || ':order-number', 0));
  select coalesce(max(nullif(substring(order_row.order_number from 5), '')::bigint), 0) + 1
    into next_number
  from public.orders order_row
  where order_row.organization_id = target_organization_id;
  if next_number > 999999 then
    raise exception using errcode = '22023', message = 'ORDER_NUMBER_EXHAUSTED';
  end if;
  target_order_number := 'PED-' || lpad(next_number::text, 6, '0');

  insert into public.orders (
    organization_id, order_number, source_quote_id, source_quote_number,
    customer_id, order_date, status, prices_include_tax, notes,
    operation_key, created_by, updated_by
  ) values (
    target_organization_id, target_order_number, target_source_quote_id,
    nullif(btrim(payload ->> 'source_quote_number'), ''), target_customer_id,
    target_date, 'confirmado', coalesce((payload ->> 'prices_include_tax')::boolean, true),
    coalesce(payload ->> 'notes', ''), target_operation_key, actor_id, actor_id
  ) returning id into target_order_id;

  insert into public.order_items (
    organization_id, order_id, product_id, product_code,
    product_description, unit_of_measure, quantity, unit_price
  )
  select target_organization_id, target_order_id, product.id, product.code,
    product.description, product.unit_of_measure,
    (line_data ->> 'quantity')::numeric, (line_data ->> 'unit_price')::numeric
  from jsonb_array_elements(payload -> 'items') as item_rows(line_data)
  join public.products product
    on product.id = (line_data ->> 'product_id')::uuid
   and product.organization_id = target_organization_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values, metadata
  ) values (
    target_organization_id, actor_id, 'ORDER_CREATED', 'order', target_order_id::text,
    jsonb_build_object('order_number', target_order_number, 'customer_id', target_customer_id),
    jsonb_build_object('source', 'database_function', 'operation_key', target_operation_key)
  );
  return target_order_id;
exception
  when unique_violation then
    if target_operation_key is not null then
      select order_row.id into target_order_id
      from public.orders order_row
      where order_row.organization_id = target_organization_id
        and order_row.operation_key = target_operation_key;
      if target_order_id is not null then return target_order_id; end if;
    end if;
    raise;
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
  actor_id uuid := auth.uid();
  target_sale_id uuid;
  target_operation_key uuid;
  target_internal_number text;
  next_number bigint;
  order_row public.orders%rowtype;
begin
  if actor_id is null or not public.is_organization_member(requested_organization_id) then
    raise exception using errcode = '42501', message = 'SALE_FORBIDDEN';
  end if;
  if jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'SALE_PAYLOAD_INVALID';
  end if;
  target_operation_key := nullif(payload ->> 'operation_key', '')::uuid;
  if target_operation_key is null then
    raise exception using errcode = '22023', message = 'SALE_OPERATION_KEY_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    requested_organization_id::text || ':sale-operation:' || target_operation_key::text, 0));
  select sale.id into target_sale_id
  from public.sales sale
  where sale.organization_id = requested_organization_id
    and sale.operation_key = target_operation_key;
  if target_sale_id is not null then return target_sale_id; end if;

  select * into order_row
  from public.orders order_data
  where order_data.organization_id = requested_organization_id
    and order_data.id = requested_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SALE_ORDER_NOT_FOUND';
  end if;
  if order_row.status <> 'confirmado' then
    raise exception using errcode = 'P0001', message = 'SALE_ORDER_NOT_AVAILABLE';
  end if;
  if not exists (select 1 from public.order_items item where item.organization_id = requested_organization_id and item.order_id = requested_order_id) then
    raise exception using errcode = 'P0001', message = 'SALE_ORDER_ITEMS_REQUIRED';
  end if;
  if exists (select 1 from public.sales sale where sale.organization_id = requested_organization_id and sale.order_id = requested_order_id) then
    raise exception using errcode = '23505', message = 'SALE_ORDER_ALREADY_CONVERTED';
  end if;
  if coalesce(payload ->> 'document_type', '') not in ('factura', 'boleta', 'nota-venta')
     or char_length(btrim(coalesce(payload ->> 'series', ''))) not between 1 and 10
     or char_length(btrim(coalesce(payload ->> 'document_number', ''))) not between 1 and 20
     or char_length(btrim(coalesce(payload ->> 'warehouse', ''))) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'SALE_DOCUMENT_INVALID';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    requested_organization_id::text || ':sale-number', 0));
  select coalesce(max(nullif(substring(sale.internal_number from 5), '')::bigint), 0) + 1
    into next_number
  from public.sales sale
  where sale.organization_id = requested_organization_id;
  if next_number > 999999 then
    raise exception using errcode = '22023', message = 'SALE_NUMBER_EXHAUSTED';
  end if;
  target_internal_number := 'VEN-' || lpad(next_number::text, 6, '0');

  insert into public.sales (
    organization_id, order_id, customer_id, internal_number, document_type,
    series, document_number, sale_date, warehouse, prices_include_tax,
    status, operation_key, created_by, updated_by
  ) values (
    requested_organization_id, requested_order_id, order_row.customer_id,
    target_internal_number, payload ->> 'document_type', upper(btrim(payload ->> 'series')),
    btrim(payload ->> 'document_number'),
    coalesce(nullif(payload ->> 'sale_date', '')::date, current_date),
    btrim(payload ->> 'warehouse'), order_row.prices_include_tax, 'registrada',
    target_operation_key, actor_id, actor_id
  ) returning id into target_sale_id;

  insert into public.sale_items (
    organization_id, sale_id, order_id, order_item_id, product_id,
    product_code, product_description, unit_of_measure, quantity, unit_price
  )
  select requested_organization_id, target_sale_id, item.order_id, item.id,
    item.product_id, item.product_code, item.product_description,
    item.unit_of_measure, item.quantity, item.unit_price
  from public.order_items item
  where item.organization_id = requested_organization_id
    and item.order_id = requested_order_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values, metadata
  ) values (
    requested_organization_id, actor_id, 'SALE_CREATED', 'sale', target_sale_id::text,
    jsonb_build_object('order_id', requested_order_id, 'internal_number', target_internal_number),
    jsonb_build_object('source', 'database_function', 'operation_key', target_operation_key)
  );
  return target_sale_id;
exception
  when unique_violation then
    if target_operation_key is not null then
      select sale.id into target_sale_id
      from public.sales sale
      where sale.organization_id = requested_organization_id
        and sale.operation_key = target_operation_key;
      if target_sale_id is not null then return target_sale_id; end if;
    end if;
    raise;
end;
$$;

-- El encabezado y las lineas solo se escriben mediante las RPC transaccionales.
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

create policy orders_select_member on public.orders
  for select to authenticated
  using ((select public.is_organization_member(organization_id)));
create policy order_items_select_member on public.order_items
  for select to authenticated
  using ((select public.is_organization_member(organization_id)));
create policy sales_select_member on public.sales
  for select to authenticated
  using ((select public.is_organization_member(organization_id)));
create policy sale_items_select_member on public.sale_items
  for select to authenticated
  using ((select public.is_organization_member(organization_id)));

revoke all on table public.orders, public.order_items, public.sales, public.sale_items from anon, authenticated;
grant select on table public.orders, public.order_items, public.sales, public.sale_items to authenticated;
grant select, insert, update, delete on table public.orders, public.order_items, public.sales, public.sale_items to service_role;

revoke all on function public.validate_sale_item_identity() from public, anon, authenticated;
revoke all on function public.recalculate_order_totals() from public, anon, authenticated;
revoke all on function public.recalculate_sale_totals() from public, anon, authenticated;
revoke all on function public.create_order(jsonb) from public, anon, authenticated;
revoke all on function public.create_sale_from_order(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb) to authenticated;
grant execute on function public.create_sale_from_order(uuid, uuid, jsonb) to authenticated;

comment on table public.orders is 'Pedidos comerciales persistentes. No reserva inventario en esta fase.';
comment on table public.sales is 'Ventas persistentes vinculadas a un pedido. No consume inventario en esta fase.';
