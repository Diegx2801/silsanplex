-- ============================================================
-- SILSANPLEX: catálogo, compras e inventario persistentes
-- ============================================================

-- ------------------------------------------------------------
-- 1. Capacidades
-- ------------------------------------------------------------

insert into public.permissions (code, name, description)
values
  ('PRODUCTS_VIEW', 'Consultar productos', 'Consultar el catálogo de productos.'),
  ('PRODUCTS_MANAGE', 'Administrar productos', 'Registrar, editar y cambiar el estado de productos.'),
  ('PURCHASES_VIEW', 'Consultar compras', 'Consultar órdenes y documentos de compra.'),
  ('PURCHASES_MANAGE', 'Administrar compras', 'Crear, editar, emitir y anular órdenes de compra.'),
  ('PURCHASES_RECEIVE', 'Recibir compras', 'Confirmar la recepción de compras e ingresar existencias.'),
  ('INVENTORY_VIEW', 'Consultar inventario', 'Consultar existencias y movimientos de inventario.'),
  ('INVENTORY_MANAGE', 'Administrar inventario', 'Registrar entradas, salidas y ajustes de inventario.');

insert into public.role_permissions (role_code, permission_code)
values
  ('ADMIN', 'PRODUCTS_VIEW'),
  ('ADMIN', 'PRODUCTS_MANAGE'),
  ('ADMIN', 'PURCHASES_VIEW'),
  ('ADMIN', 'PURCHASES_MANAGE'),
  ('ADMIN', 'PURCHASES_RECEIVE'),
  ('ADMIN', 'INVENTORY_VIEW'),
  ('ADMIN', 'INVENTORY_MANAGE'),
  ('GERENCIA', 'PRODUCTS_VIEW'),
  ('GERENCIA', 'PURCHASES_VIEW'),
  ('GERENCIA', 'INVENTORY_VIEW'),
  ('LOGISTICA', 'PRODUCTS_VIEW'),
  ('LOGISTICA', 'PRODUCTS_MANAGE'),
  ('LOGISTICA', 'PURCHASES_VIEW'),
  ('LOGISTICA', 'PURCHASES_RECEIVE'),
  ('LOGISTICA', 'INVENTORY_VIEW'),
  ('LOGISTICA', 'INVENTORY_MANAGE'),
  ('ALMACEN', 'PRODUCTS_VIEW'),
  ('ALMACEN', 'PURCHASES_VIEW'),
  ('ALMACEN', 'PURCHASES_RECEIVE'),
  ('ALMACEN', 'INVENTORY_VIEW'),
  ('ALMACEN', 'INVENTORY_MANAGE'),
  ('COMPRAS', 'PRODUCTS_VIEW'),
  ('COMPRAS', 'PURCHASES_VIEW'),
  ('COMPRAS', 'PURCHASES_MANAGE'),
  ('COMPRAS', 'PURCHASES_RECEIVE'),
  ('COMPRAS', 'INVENTORY_VIEW'),
  ('VENTAS', 'PRODUCTS_VIEW'),
  ('VENTAS', 'INVENTORY_VIEW');

-- ------------------------------------------------------------
-- 2. Catálogo persistente
-- ------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  description text not null,
  barcode text,
  category text,
  laboratory text,
  presentation text,
  unit_of_measure text,
  tax_affectation text not null default 'por-definir',
  sale_price numeric(14,2),
  health_registry text,
  batch_control boolean not null default true,
  prescription_sale boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint products_code_format
    check (code ~ '^[A-Z0-9][A-Z0-9._-]{0,29}$'),
  constraint products_description_length
    check (char_length(btrim(description)) between 2 and 160),
  constraint products_barcode_length
    check (barcode is null or char_length(btrim(barcode)) between 3 and 50),
  constraint products_category_length
    check (category is null or char_length(btrim(category)) <= 80),
  constraint products_laboratory_length
    check (laboratory is null or char_length(btrim(laboratory)) <= 100),
  constraint products_presentation_length
    check (presentation is null or char_length(btrim(presentation)) <= 100),
  constraint products_unit_length
    check (unit_of_measure is null or char_length(btrim(unit_of_measure)) <= 40),
  constraint products_tax_affectation_valid
    check (tax_affectation in ('por-definir', 'gravado', 'exonerado', 'inafecto')),
  constraint products_sale_price_positive
    check (sale_price is null or sale_price >= 0),
  constraint products_health_registry_length
    check (health_registry is null or char_length(btrim(health_registry)) <= 80)
);

create unique index products_organization_code_unique
  on public.products (organization_id, code);
create unique index products_organization_barcode_unique
  on public.products (organization_id, barcode)
  where barcode is not null;
create index products_organization_active_description_idx
  on public.products (organization_id, is_active, description, id);
create index products_created_by_idx on public.products (created_by) where created_by is not null;
create index products_updated_by_idx on public.products (updated_by) where updated_by is not null;

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create or replace function public.protect_product_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = 'P0001', message = 'PRODUCT_IMMUTABLE_FIELDS';
  end if;
  return new;
end;
$$;

create trigger products_protect_immutable_fields
before update on public.products
for each row execute function public.protect_product_immutable_fields();

create or replace function public.audit_product_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  )
  values (
    new.organization_id,
    coalesce((select auth.uid()), new.updated_by, new.created_by),
    case when tg_op = 'INSERT' then 'PRODUCT_CREATED' else 'PRODUCT_UPDATED' end,
    'product', new.id::text,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new), jsonb_build_object('source', 'database_trigger')
  );
  return new;
end;
$$;

create trigger products_audit_change
after insert or update on public.products
for each row execute function public.audit_product_change();

-- ------------------------------------------------------------
-- 3. Órdenes de compra y detalle
-- ------------------------------------------------------------

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_document text not null,
  supplier_name text not null,
  document_type text not null,
  series text not null,
  document_number text not null,
  issue_date date not null,
  payment_due_date date,
  warehouse text not null,
  currency text not null default 'PEN',
  prices_include_tax boolean not null default true,
  notes text,
  status text not null default 'draft',
  subtotal numeric(16,2) not null default 0,
  tax numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  issued_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint purchase_orders_document_type_valid
    check (document_type in ('factura', 'boleta', 'guia', 'otro')),
  constraint purchase_orders_series_length
    check (char_length(btrim(series)) between 1 and 10),
  constraint purchase_orders_number_length
    check (char_length(btrim(document_number)) between 1 and 20),
  constraint purchase_orders_supplier_snapshot_length
    check (char_length(btrim(supplier_document)) between 4 and 30 and char_length(btrim(supplier_name)) between 2 and 160),
  constraint purchase_orders_warehouse_length
    check (char_length(btrim(warehouse)) between 2 and 80),
  constraint purchase_orders_currency_valid
    check (currency in ('PEN', 'USD')),
  constraint purchase_orders_notes_length
    check (notes is null or char_length(btrim(notes)) <= 240),
  constraint purchase_orders_status_valid
    check (status in ('draft', 'issued', 'received', 'cancelled')),
  constraint purchase_orders_totals_nonnegative
    check (subtotal >= 0 and tax >= 0 and total >= 0),
  constraint purchase_orders_dates_consistent
    check (payment_due_date is null or payment_due_date >= issue_date),
  constraint purchase_orders_status_dates_consistent
    check (
      (status = 'draft' and issued_at is null and received_at is null and cancelled_at is null)
      or (status = 'issued' and issued_at is not null and received_at is null and cancelled_at is null)
      or (status = 'received' and issued_at is not null and received_at is not null and cancelled_at is null)
      or (status = 'cancelled' and received_at is null and cancelled_at is not null)
    )
);

create unique index purchase_orders_organization_document_unique
  on public.purchase_orders (organization_id, document_type, series, document_number);
create index purchase_orders_organization_status_created_idx
  on public.purchase_orders (organization_id, status, created_at desc, id);
create index purchase_orders_organization_supplier_created_idx
  on public.purchase_orders (organization_id, supplier_id, created_at desc, id);
create index purchase_orders_supplier_id_idx on public.purchase_orders (supplier_id);
create index purchase_orders_created_by_idx on public.purchase_orders (created_by) where created_by is not null;
create index purchase_orders_updated_by_idx on public.purchase_orders (updated_by) where updated_by is not null;
create index purchase_orders_received_by_idx on public.purchase_orders (received_by) where received_by is not null;

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_code text not null,
  product_description text not null,
  unit_of_measure text,
  batch_control boolean not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(16,4) not null,
  line_subtotal numeric(18,4) generated always as (round(quantity * unit_cost, 4)) stored,
  lot text,
  expiration_date date,
  created_at timestamptz not null default now(),

  constraint purchase_order_items_quantity_positive check (quantity > 0),
  constraint purchase_order_items_cost_positive check (unit_cost > 0),
  constraint purchase_order_items_product_snapshot_length
    check (char_length(btrim(product_code)) between 1 and 30 and char_length(btrim(product_description)) between 2 and 160),
  constraint purchase_order_items_lot_length
    check (lot is null or char_length(btrim(lot)) <= 60),
  constraint purchase_order_items_batch_consistent
    check (batch_control = false or lot is not null)
);

create unique index purchase_order_items_order_product_unique
  on public.purchase_order_items (purchase_order_id, product_id);
create index purchase_order_items_organization_order_idx
  on public.purchase_order_items (organization_id, purchase_order_id, id);
create index purchase_order_items_product_id_idx on public.purchase_order_items (product_id);

create trigger purchase_orders_set_updated_at
before update on public.purchase_orders
for each row execute function public.set_updated_at();

create or replace function public.recalculate_purchase_order_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
  line_total numeric(18,4);
  includes_tax boolean;
begin
  select coalesce(sum(item.line_subtotal), 0)
  into line_total
  from public.purchase_order_items item
  where item.purchase_order_id = target_order_id;

  select purchase_order.prices_include_tax
  into includes_tax
  from public.purchase_orders purchase_order
  where purchase_order.id = target_order_id;

  update public.purchase_orders
  set
    subtotal = case when includes_tax then round(line_total / 1.18, 2) else round(line_total, 2) end,
    tax = case when includes_tax then round(line_total - (line_total / 1.18), 2) else round(line_total * 0.18, 2) end,
    total = case when includes_tax then round(line_total, 2) else round(line_total * 1.18, 2) end
  where id = target_order_id;

  return coalesce(new, old);
end;
$$;

create trigger purchase_order_items_recalculate_totals
after insert or update or delete on public.purchase_order_items
for each row execute function public.recalculate_purchase_order_totals();

-- ------------------------------------------------------------
-- 4. Inventario inmutable
-- ------------------------------------------------------------

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_code text not null,
  product_description text not null,
  unit_of_measure text,
  movement_type text not null,
  quantity numeric(14,3) not null,
  warehouse text not null,
  lot text,
  expiration_date date,
  operation_date date not null,
  reason text not null,
  source_type text not null default 'manual',
  source_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint inventory_movements_type_valid
    check (movement_type in ('entrada', 'salida', 'ajuste-positivo', 'ajuste-negativo')),
  constraint inventory_movements_quantity_positive check (quantity > 0),
  constraint inventory_movements_warehouse_length
    check (char_length(btrim(warehouse)) between 2 and 80),
  constraint inventory_movements_lot_length
    check (lot is null or char_length(btrim(lot)) <= 60),
  constraint inventory_movements_reason_length
    check (char_length(btrim(reason)) between 3 and 180),
  constraint inventory_movements_source_valid
    check (source_type in ('manual', 'purchase-receipt')),
  constraint inventory_movements_source_consistent
    check ((source_type = 'manual' and source_id is null) or (source_type = 'purchase-receipt' and source_id is not null))
);

create unique index inventory_movements_purchase_source_unique
  on public.inventory_movements (source_type, source_id)
  where source_type = 'purchase-receipt';
create index inventory_movements_organization_product_created_idx
  on public.inventory_movements (organization_id, product_id, created_at desc, id);
create index inventory_movements_stock_lookup_idx
  on public.inventory_movements (organization_id, product_id, warehouse, lot);
create index inventory_movements_created_by_idx
  on public.inventory_movements (created_by) where created_by is not null;

-- ------------------------------------------------------------
-- 5. Operaciones transaccionales
-- ------------------------------------------------------------

create or replace function public.save_purchase_order(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid := (payload ->> 'organization_id')::uuid;
  target_order_id uuid := nullif(payload ->> 'id', '')::uuid;
  target_supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  supplier_row public.suppliers%rowtype;
  existing_order public.purchase_orders%rowtype;
  item jsonb;
begin
  if actor_id is null or not public.has_organization_permission(target_organization_id, 'PURCHASES_MANAGE') then
    raise exception using errcode = '42501', message = 'PURCHASE_ORDER_FORBIDDEN';
  end if;

  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'PURCHASE_ORDER_ITEMS_REQUIRED';
  end if;

  if exists (
    select 1 from jsonb_array_elements(payload -> 'items') line
    group by line ->> 'product_id' having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'PURCHASE_ORDER_DUPLICATE_PRODUCT';
  end if;

  select * into supplier_row
  from public.suppliers supplier
  where supplier.id = target_supplier_id
    and supplier.organization_id = target_organization_id
    and supplier.is_active;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_SUPPLIER_UNAVAILABLE';
  end if;

  for item in select value from jsonb_array_elements(payload -> 'items')
  loop
    if not exists (
      select 1 from public.products product
      where product.id = (item ->> 'product_id')::uuid
        and product.organization_id = target_organization_id
        and product.is_active
        and (not product.batch_control or nullif(btrim(item ->> 'lot'), '') is not null)
    ) then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE';
    end if;
  end loop;

  if target_order_id is null then
    insert into public.purchase_orders (
      organization_id, supplier_id, supplier_document, supplier_name,
      document_type, series, document_number, issue_date, payment_due_date,
      warehouse, currency, prices_include_tax, notes, created_by, updated_by
    ) values (
      target_organization_id, target_supplier_id, supplier_row.document_number, supplier_row.business_name,
      payload ->> 'document_type', upper(btrim(payload ->> 'series')), btrim(payload ->> 'document_number'),
      (payload ->> 'issue_date')::date, nullif(payload ->> 'payment_due_date', '')::date,
      btrim(payload ->> 'warehouse'), coalesce(nullif(payload ->> 'currency', ''), 'PEN'),
      coalesce((payload ->> 'prices_include_tax')::boolean, true), nullif(btrim(payload ->> 'notes'), ''),
      actor_id, actor_id
    ) returning id into target_order_id;
  else
    select * into existing_order
    from public.purchase_orders purchase_order
    where purchase_order.id = target_order_id
      and purchase_order.organization_id = target_organization_id
    for update;
    if not found or existing_order.status <> 'draft' then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_EDITABLE';
    end if;

    update public.purchase_orders
    set supplier_id = target_supplier_id,
        supplier_document = supplier_row.document_number,
        supplier_name = supplier_row.business_name,
        document_type = payload ->> 'document_type',
        series = upper(btrim(payload ->> 'series')),
        document_number = btrim(payload ->> 'document_number'),
        issue_date = (payload ->> 'issue_date')::date,
        payment_due_date = nullif(payload ->> 'payment_due_date', '')::date,
        warehouse = btrim(payload ->> 'warehouse'),
        currency = coalesce(nullif(payload ->> 'currency', ''), 'PEN'),
        prices_include_tax = coalesce((payload ->> 'prices_include_tax')::boolean, true),
        notes = nullif(btrim(payload ->> 'notes'), ''),
        updated_by = actor_id
    where id = target_order_id;

    delete from public.purchase_order_items where purchase_order_id = target_order_id;
  end if;

  insert into public.purchase_order_items (
    purchase_order_id, organization_id, product_id, product_code,
    product_description, unit_of_measure, batch_control, quantity,
    unit_cost, lot, expiration_date
  )
  select
    target_order_id, target_organization_id, product.id, product.code,
    product.description, product.unit_of_measure, product.batch_control,
    (line ->> 'quantity')::numeric, (line ->> 'unit_cost')::numeric,
    nullif(btrim(line ->> 'lot'), ''), nullif(line ->> 'expiration_date', '')::date
  from jsonb_array_elements(payload -> 'items') line
  join public.products product on product.id = (line ->> 'product_id')::uuid;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values, metadata
  ) values (
    target_organization_id, actor_id,
    case when payload ? 'id' and nullif(payload ->> 'id', '') is not null then 'PURCHASE_ORDER_UPDATED' else 'PURCHASE_ORDER_CREATED' end,
    'purchase_order', target_order_id::text,
    jsonb_build_object('supplier_id', target_supplier_id, 'document_type', payload ->> 'document_type', 'series', payload ->> 'series', 'document_number', payload ->> 'document_number'),
    jsonb_build_object('source', 'database_function')
  );

  return target_order_id;
end;
$$;

create or replace function public.issue_purchase_order(requested_organization_id uuid, requested_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not public.has_organization_permission(requested_organization_id, 'PURCHASES_MANAGE') then
    raise exception using errcode = '42501', message = 'PURCHASE_ORDER_FORBIDDEN';
  end if;
  perform 1 from public.purchase_orders
  where id = requested_order_id and organization_id = requested_organization_id and status = 'draft'
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_ISSUABLE'; end if;
  if not exists (select 1 from public.purchase_order_items where purchase_order_id = requested_order_id) then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_ITEMS_REQUIRED';
  end if;
  update public.purchase_orders set status = 'issued', issued_at = now(), updated_by = actor_id where id = requested_order_id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id)
  values (requested_organization_id, actor_id, 'PURCHASE_ORDER_ISSUED', 'purchase_order', requested_order_id::text);
end;
$$;

create or replace function public.receive_purchase_order(requested_organization_id uuid, requested_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  order_row public.purchase_orders%rowtype;
begin
  if actor_id is null or not public.has_organization_permission(requested_organization_id, 'PURCHASES_RECEIVE') then
    raise exception using errcode = '42501', message = 'PURCHASE_RECEIPT_FORBIDDEN';
  end if;
  select * into order_row from public.purchase_orders
  where id = requested_order_id and organization_id = requested_organization_id
  for update;
  if not found or order_row.status <> 'issued' then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_RECEIVABLE';
  end if;

  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, lot, expiration_date, operation_date,
    reason, source_type, source_id, created_by
  )
  select
    item.organization_id, item.product_id, item.product_code, item.product_description, item.unit_of_measure,
    'entrada', item.quantity, order_row.warehouse, item.lot, item.expiration_date, current_date,
    'Recepción de ' || order_row.document_type || ' ' || order_row.series || '-' || order_row.document_number,
    'purchase-receipt', item.id, actor_id
  from public.purchase_order_items item
  where item.purchase_order_id = requested_order_id
  order by item.id;

  update public.purchase_orders
  set status = 'received', received_at = now(), received_by = actor_id, updated_by = actor_id
  where id = requested_order_id;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (requested_organization_id, actor_id, 'PURCHASE_ORDER_RECEIVED', 'purchase_order', requested_order_id::text, jsonb_build_object('inventory_movements_created', true));
end;
$$;

create or replace function public.cancel_purchase_order(requested_organization_id uuid, requested_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not public.has_organization_permission(requested_organization_id, 'PURCHASES_MANAGE') then
    raise exception using errcode = '42501', message = 'PURCHASE_ORDER_FORBIDDEN';
  end if;
  perform 1 from public.purchase_orders
  where id = requested_order_id and organization_id = requested_organization_id and status in ('draft', 'issued')
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_CANCELLABLE'; end if;
  update public.purchase_orders
  set status = 'cancelled', cancelled_at = now(), updated_by = actor_id
  where id = requested_order_id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id)
  values (requested_organization_id, actor_id, 'PURCHASE_ORDER_CANCELLED', 'purchase_order', requested_order_id::text);
end;
$$;

create or replace function public.record_inventory_movement(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid := (payload ->> 'organization_id')::uuid;
  target_product_id uuid := (payload ->> 'product_id')::uuid;
  product_row public.products%rowtype;
  target_type text := payload ->> 'movement_type';
  target_quantity numeric := (payload ->> 'quantity')::numeric;
  target_warehouse text := btrim(payload ->> 'warehouse');
  target_lot text := nullif(btrim(payload ->> 'lot'), '');
  available numeric;
  movement_id uuid;
begin
  if actor_id is null or not public.has_organization_permission(target_organization_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'INVENTORY_FORBIDDEN';
  end if;
  select * into product_row from public.products product
  where product.id = target_product_id and product.organization_id = target_organization_id and product.is_active;
  if not found or (product_row.batch_control and target_lot is null) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text || ':' || target_product_id::text || ':' || lower(target_warehouse) || ':' || lower(coalesce(target_lot, '')), 0));

  if target_type in ('salida', 'ajuste-negativo') then
    select coalesce(sum(case when movement_type in ('entrada', 'ajuste-positivo') then quantity else -quantity end), 0)
    into available
    from public.inventory_movements movement
    where movement.organization_id = target_organization_id
      and movement.product_id = target_product_id
      and lower(movement.warehouse) = lower(target_warehouse)
      and lower(coalesce(movement.lot, '')) = lower(coalesce(target_lot, ''));
    if target_quantity > available then
      raise exception using errcode = 'P0001', message = 'INVENTORY_INSUFFICIENT_STOCK';
    end if;
  end if;

  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, lot, expiration_date, operation_date,
    reason, created_by
  ) values (
    target_organization_id, target_product_id, product_row.code, product_row.description, product_row.unit_of_measure,
    target_type, target_quantity, target_warehouse, target_lot,
    nullif(payload ->> 'expiration_date', '')::date, (payload ->> 'operation_date')::date,
    btrim(payload ->> 'reason'), actor_id
  ) returning id into movement_id;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, new_values)
  values (target_organization_id, actor_id, 'INVENTORY_MOVEMENT_CREATED', 'inventory_movement', movement_id::text, jsonb_build_object('product_id', target_product_id, 'movement_type', target_type, 'quantity', target_quantity));
  return movement_id;
end;
$$;

-- ------------------------------------------------------------
-- 6. RLS y exposición explícita al Data API
-- ------------------------------------------------------------

alter table public.products enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.inventory_movements enable row level security;

create policy products_select_authorized on public.products for select to authenticated
using ((select public.has_organization_permission(organization_id, 'PRODUCTS_VIEW')));
create policy products_insert_authorized on public.products for insert to authenticated
with check (created_by = (select auth.uid()) and updated_by = (select auth.uid()) and (select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE')));
create policy products_update_authorized on public.products for update to authenticated
using ((select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE')))
with check (updated_by = (select auth.uid()) and (select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE')));

create policy purchase_orders_select_authorized on public.purchase_orders for select to authenticated
using ((select public.has_organization_permission(organization_id, 'PURCHASES_VIEW')));
create policy purchase_order_items_select_authorized on public.purchase_order_items for select to authenticated
using ((select public.has_organization_permission(organization_id, 'PURCHASES_VIEW')));
create policy inventory_movements_select_authorized on public.inventory_movements for select to authenticated
using ((select public.has_organization_permission(organization_id, 'INVENTORY_VIEW')));

revoke all on table public.products, public.purchase_orders, public.purchase_order_items, public.inventory_movements from anon, authenticated;
grant select, insert, update on table public.products to authenticated;
grant select on table public.purchase_orders, public.purchase_order_items, public.inventory_movements to authenticated;
grant select, insert, update, delete on table public.products, public.purchase_orders, public.purchase_order_items, public.inventory_movements to service_role;

revoke all on function public.protect_product_immutable_fields() from public;
revoke all on function public.audit_product_change() from public;
revoke all on function public.recalculate_purchase_order_totals() from public;
revoke all on function public.save_purchase_order(jsonb) from public, anon, authenticated;
revoke all on function public.issue_purchase_order(uuid, uuid) from public, anon, authenticated;
revoke all on function public.receive_purchase_order(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_purchase_order(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_inventory_movement(jsonb) from public, anon, authenticated;

grant execute on function public.save_purchase_order(jsonb) to authenticated;
grant execute on function public.issue_purchase_order(uuid, uuid) to authenticated;
grant execute on function public.receive_purchase_order(uuid, uuid) to authenticated;
grant execute on function public.cancel_purchase_order(uuid, uuid) to authenticated;
grant execute on function public.record_inventory_movement(jsonb) to authenticated;
