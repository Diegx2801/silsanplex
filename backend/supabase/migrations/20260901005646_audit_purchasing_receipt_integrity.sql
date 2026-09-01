-- Auditoria de Compras/Recepcion: vincula las ordenes al maestro real de
-- almacenes, elimina la creacion implicita durante la recepcion y revalida
-- dependencias antes de confirmar cambios de estado.

alter table public.suppliers
  add constraint suppliers_organization_id_id_key unique (organization_id, id);

alter table public.purchase_orders
  add column warehouse_id uuid,
  add constraint purchase_orders_organization_id_id_key unique (organization_id, id);

-- Las ordenes historicas solo conservaban el nombre. Se materializa una vez
-- durante la migracion; las operaciones futuras deberan seleccionar un
-- almacen activo existente.
insert into public.warehouses (
  organization_id, code, name, created_by, updated_by
)
select distinct
  purchase.organization_id,
  'PUR-' || upper(substr(md5(purchase.organization_id::text || ':' || lower(btrim(purchase.warehouse))), 1, 12)),
  btrim(purchase.warehouse),
  purchase.created_by,
  purchase.updated_by
from public.purchase_orders purchase
where not exists (
  select 1
  from public.warehouses warehouse
  where warehouse.organization_id = purchase.organization_id
    and lower(btrim(warehouse.name)) = lower(btrim(purchase.warehouse))
)
on conflict (organization_id, code) do nothing;

update public.purchase_orders purchase
set warehouse_id = (
  select warehouse.id
  from public.warehouses warehouse
  where warehouse.organization_id = purchase.organization_id
    and lower(btrim(warehouse.name)) = lower(btrim(purchase.warehouse))
  order by warehouse.is_active desc, warehouse.created_at, warehouse.id
  limit 1
);

update public.purchase_orders purchase
set warehouse = warehouse.name
from public.warehouses warehouse
where warehouse.organization_id = purchase.organization_id
  and warehouse.id = purchase.warehouse_id;

alter table public.purchase_orders
  alter column warehouse_id set not null,
  add constraint purchase_orders_warehouse_tenant_fk
    foreign key (organization_id, warehouse_id)
    references public.warehouses (organization_id, id) on delete restrict;

alter table public.purchase_orders
  drop constraint purchase_orders_supplier_id_fkey,
  add constraint purchase_orders_supplier_tenant_fk
    foreign key (organization_id, supplier_id)
    references public.suppliers (organization_id, id) on delete restrict;

alter table public.purchase_order_items
  drop constraint purchase_order_items_purchase_order_id_fkey,
  drop constraint purchase_order_items_product_id_fkey,
  add constraint purchase_order_items_order_tenant_fk
    foreign key (organization_id, purchase_order_id)
    references public.purchase_orders (organization_id, id) on delete cascade,
  add constraint purchase_order_items_product_tenant_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict;

create index purchase_orders_organization_warehouse_created_idx
  on public.purchase_orders (organization_id, warehouse_id, created_at desc, id);

comment on column public.purchase_orders.warehouse_id is
  'Almacen maestro donde se recibira la orden; no se crean almacenes implicitamente al recibir.';

create or replace function public.save_purchase_order(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid := (payload ->> 'organization_id')::uuid;
  target_order_id uuid := nullif(payload ->> 'id', '')::uuid;
  target_supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  target_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  supplier_row public.suppliers%rowtype;
  warehouse_row public.warehouses%rowtype;
  existing_order public.purchase_orders%rowtype;
  saved_order public.purchase_orders%rowtype;
  item jsonb;
begin
  if actor_id is null
    or not public.has_organization_permission(target_organization_id, 'PURCHASES_MANAGE') then
    raise exception using errcode = '42501', message = 'PURCHASE_ORDER_FORBIDDEN';
  end if;
  if jsonb_typeof(payload -> 'items') <> 'array'
    or jsonb_array_length(payload -> 'items') = 0 then
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

  select * into warehouse_row
  from public.warehouses warehouse
  where warehouse.id = target_warehouse_id
    and warehouse.organization_id = target_organization_id
    and warehouse.is_active;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE';
  end if;
  if not exists (
    select 1 from public.warehouse_locations location
    where location.organization_id = target_organization_id
      and location.warehouse_id = target_warehouse_id
      and location.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_LOCATION_REQUIRED';
  end if;

  for item in select value from jsonb_array_elements(payload -> 'items')
  loop
    if coalesce((item ->> 'quantity')::numeric, 0) <= 0
      or coalesce((item ->> 'unit_cost')::numeric, 0) <= 0 then
      raise exception using errcode = '22023', message = 'PURCHASE_ORDER_ITEM_VALUES_INVALID';
    end if;
    if not exists (
      select 1 from public.products product
      where product.id = (item ->> 'product_id')::uuid
        and product.organization_id = target_organization_id
        and product.is_active
        and (not product.batch_control or nullif(btrim(item ->> 'lot'), '') is not null)
        and (not product.expiration_control or nullif(item ->> 'expiration_date', '') is not null)
    ) then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE';
    end if;
  end loop;

  if target_order_id is null then
    insert into public.purchase_orders (
      organization_id, supplier_id, supplier_document, supplier_name,
      document_type, series, document_number, issue_date, payment_due_date,
      expected_delivery_date, warehouse, warehouse_id, currency,
      prices_include_tax, notes, created_by, updated_by
    ) values (
      target_organization_id, target_supplier_id, supplier_row.document_number,
      supplier_row.business_name, payload ->> 'document_type',
      upper(btrim(payload ->> 'series')), btrim(payload ->> 'document_number'),
      (payload ->> 'issue_date')::date,
      nullif(payload ->> 'payment_due_date', '')::date,
      nullif(payload ->> 'expected_delivery_date', '')::date,
      warehouse_row.name, warehouse_row.id,
      coalesce(nullif(payload ->> 'currency', ''), 'PEN'),
      coalesce((payload ->> 'prices_include_tax')::boolean, true),
      nullif(btrim(payload ->> 'notes'), ''), actor_id, actor_id
    ) returning * into saved_order;
    target_order_id := saved_order.id;
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
        expected_delivery_date = nullif(payload ->> 'expected_delivery_date', '')::date,
        warehouse = warehouse_row.name,
        warehouse_id = warehouse_row.id,
        currency = coalesce(nullif(payload ->> 'currency', ''), 'PEN'),
        prices_include_tax = coalesce((payload ->> 'prices_include_tax')::boolean, true),
        notes = nullif(btrim(payload ->> 'notes'), ''),
        updated_by = actor_id
    where id = target_order_id
    returning * into saved_order;

    delete from public.purchase_order_items
    where purchase_order_id = target_order_id;
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
    nullif(btrim(line ->> 'lot'), ''),
    nullif(line ->> 'expiration_date', '')::date
  from jsonb_array_elements(payload -> 'items') line
  join public.products product
    on product.id = (line ->> 'product_id')::uuid
   and product.organization_id = target_organization_id;

  select * into saved_order from public.purchase_orders where id = target_order_id;
  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    target_organization_id, actor_id,
    case when existing_order.id is null then 'PURCHASE_ORDER_CREATED' else 'PURCHASE_ORDER_UPDATED' end,
    'purchase_order', target_order_id::text,
    case when existing_order.id is null then null else to_jsonb(existing_order) end,
    to_jsonb(saved_order),
    jsonb_build_object('source', 'database_function')
  );
  return target_order_id;
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

create or replace function public.receive_purchase_order(
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
  received_order public.purchase_orders%rowtype;
  warehouse_row public.warehouses%rowtype;
  general_location_id uuid;
  movement_count integer;
begin
  if actor_id is null
    or not public.has_organization_permission(requested_organization_id, 'PURCHASES_RECEIVE') then
    raise exception using errcode = '42501', message = 'PURCHASE_RECEIPT_FORBIDDEN';
  end if;
  select * into order_row
  from public.purchase_orders purchase
  where purchase.id = requested_order_id
    and purchase.organization_id = requested_organization_id
  for update;
  if not found or order_row.status <> 'issued' then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_RECEIVABLE';
  end if;

  select * into warehouse_row
  from public.warehouses warehouse
  where warehouse.id = order_row.warehouse_id
    and warehouse.organization_id = requested_organization_id
    and warehouse.is_active;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE';
  end if;
  select location.id into general_location_id
  from public.warehouse_locations location
  where location.organization_id = requested_organization_id
    and location.warehouse_id = warehouse_row.id
    and location.is_active
  order by (location.code = 'GENERAL') desc, location.created_at, location.id
  limit 1;
  if general_location_id is null then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_LOCATION_REQUIRED';
  end if;

  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description,
    unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
    location_id, stock_status, unit_cost, lot, expiration_date,
    operation_date, reason, source_type, source_id, created_by
  )
  select
    item.organization_id, item.product_id, item.product_code,
    item.product_description, item.unit_of_measure, 'entrada', item.quantity,
    warehouse_row.name, warehouse_row.id,
    coalesce(product_location.id, general_location_id),
    'available', item.unit_cost, item.lot, item.expiration_date, current_date,
    'Recepcion de ' || order_row.document_type || ' ' || order_row.series || '-' || order_row.document_number,
    'purchase-receipt', item.id, actor_id
  from public.purchase_order_items item
  left join public.product_warehouse_settings setting
    on setting.organization_id = item.organization_id
   and setting.product_id = item.product_id
   and setting.warehouse_id = warehouse_row.id
  left join public.warehouse_locations product_location
    on product_location.id = setting.default_location_id
   and product_location.organization_id = item.organization_id
   and product_location.warehouse_id = warehouse_row.id
   and product_location.is_active
  where item.purchase_order_id = requested_order_id
  order by item.id;
  get diagnostics movement_count = row_count;
  if movement_count = 0 then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_ITEMS_REQUIRED';
  end if;

  update public.purchase_orders
  set status = 'received', received_at = now(), received_by = actor_id,
      updated_by = actor_id, warehouse = warehouse_row.name
  where id = requested_order_id
  returning * into received_order;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    requested_organization_id, actor_id, 'PURCHASE_ORDER_RECEIVED',
    'purchase_order', requested_order_id::text,
    to_jsonb(order_row), to_jsonb(received_order),
    jsonb_build_object(
      'inventory_movements_created', movement_count,
      'warehouse_id', warehouse_row.id
    )
  );
end;
$$;

create or replace function public.cancel_purchase_order(
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
  cancelled_order public.purchase_orders%rowtype;
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
  if not found or order_row.status not in ('draft', 'issued') then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_CANCELLABLE';
  end if;

  update public.purchase_orders
  set status = 'cancelled', cancelled_at = now(), updated_by = actor_id
  where id = requested_order_id
  returning * into cancelled_order;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values
  ) values (
    requested_organization_id, actor_id, 'PURCHASE_ORDER_CANCELLED',
    'purchase_order', requested_order_id::text,
    to_jsonb(order_row), to_jsonb(cancelled_order)
  );
end;
$$;

revoke all on function public.save_purchase_order(jsonb)
  from public, anon;
revoke all on function public.issue_purchase_order(uuid, uuid)
  from public, anon;
revoke all on function public.receive_purchase_order(uuid, uuid)
  from public, anon;
revoke all on function public.cancel_purchase_order(uuid, uuid)
  from public, anon;

grant execute on function public.save_purchase_order(jsonb) to authenticated;
grant execute on function public.issue_purchase_order(uuid, uuid) to authenticated;
grant execute on function public.receive_purchase_order(uuid, uuid) to authenticated;
grant execute on function public.cancel_purchase_order(uuid, uuid) to authenticated;
