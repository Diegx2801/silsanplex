-- SILSANPLEX: reserva comercial atomica al confirmar un pedido.
-- La operacion reutiliza las primitivas FEFO existentes y no genera
-- movimientos de inventario: el stock fisico permanece en el ledger.

-- ---------------------------------------------------------------------------
-- 1. Asignar una linea de pedido a buckets FEFO
-- ---------------------------------------------------------------------------

create or replace function public.reserve_order_item_fefo(
  requested_organization_id uuid,
  requested_order_item_id uuid,
  requested_warehouse_id uuid,
  requested_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_item_row public.order_items%rowtype;
  allocation_row record;
begin
  if requested_actor_id is null
     or requested_actor_id is distinct from (select auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'AUTHENTICATION_REQUIRED';
  end if;
  if requested_organization_id is null
     or not public.is_organization_member(requested_organization_id) then
    raise exception using
      errcode = '42501',
      message = 'ORDER_FORBIDDEN';
  end if;

  -- La linea y su pedido son la unica fuente de producto, cantidad y almacen.
  -- Esto evita que una llamada interna pueda reservar un bucket para otro
  -- pedido o para un almacen diferente al del documento comercial.
  select item.*
    into order_item_row
  from public.order_items item
  join public.orders order_row
    on order_row.organization_id = item.organization_id
   and order_row.id = item.order_id
  where item.organization_id = requested_organization_id
    and item.id = requested_order_item_id
    and order_row.warehouse_id = requested_warehouse_id
    and order_row.status = 'confirmado'
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEM_RESERVATION_SOURCE_INVALID';
  end if;

  -- El scope lock serializa reservas, salidas FEFO y cualquier otra
  -- operacion que utilice lock_inventory_bucket para el mismo producto/almacen.
  perform public.lock_inventory_fefo_scope(
    requested_organization_id,
    order_item_row.product_id,
    requested_warehouse_id
  );

  -- El planificador canonico excluye vencidos, cuarentena, dañados y saldo ya
  -- reservado. La funcion falla completa si no puede cubrir la cantidad.
  for allocation_row in
    select allocation.*
    from public.inventory_fefo_allocation_plan(
      requested_organization_id,
      order_item_row.product_id,
      requested_warehouse_id,
      order_item_row.quantity,
      null
    ) allocation
    order by allocation.allocation_order
  loop
    insert into public.inventory_reservations (
      organization_id,
      product_id,
      warehouse_id,
      location_id,
      stock_status,
      lot,
      expiration_date,
      quantity,
      quantity_consumed,
      status,
      source_type,
      source_id,
      created_by,
      updated_by
    ) values (
      requested_organization_id,
      order_item_row.product_id,
      requested_warehouse_id,
      allocation_row.location_id,
      'available',
      nullif(btrim(allocation_row.lot), ''),
      allocation_row.expiration_date,
      allocation_row.allocation_quantity,
      0,
      'active',
      'order-item',
      order_item_row.id,
      requested_actor_id,
      requested_actor_id
    );
  end loop;
end;
$$;

-- Solo create_order (SECURITY DEFINER) debe poder invocar esta primitiva.
-- No se expone como endpoint RPC independiente.
revoke all on function public.reserve_order_item_fefo(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function public.reserve_order_item_fefo(uuid, uuid, uuid, uuid) is
  'Asigna una linea de pedido a buckets FEFO dentro de la transaccion de create_order.';

-- ---------------------------------------------------------------------------
-- 2. create_order: pedido, lineas y reservas en una sola transaccion
-- ---------------------------------------------------------------------------

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
  target_warehouse_id uuid;
  target_order_id uuid;
  target_operation_key uuid;
  target_source_quote_id uuid;
  target_order_number text;
  next_number bigint;
  line jsonb;
  target_quantity numeric;
  target_unit_price numeric;
  target_date date;
  order_item_row public.order_items%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_customer_id := nullif(payload ->> 'customer_id', '')::uuid;
  target_warehouse_id := nullif(payload ->> 'warehouse_id', '')::uuid;
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

  -- La clave de operacion serializa retries antes de tocar el pedido, sus
  -- lineas o sus reservas.
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

  if target_warehouse_id is null then
    raise exception using errcode = '22023', message = 'ORDER_WAREHOUSE_REQUIRED';
  end if;
  perform 1
  from public.warehouses warehouse
  where warehouse.id = target_warehouse_id
    and warehouse.organization_id = target_organization_id
    and warehouse.is_active
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_WAREHOUSE_UNAVAILABLE';
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
    customer_id, warehouse_id, order_date, status, prices_include_tax, notes,
    operation_key, created_by, updated_by
  ) values (
    target_organization_id, target_order_number, target_source_quote_id,
    nullif(btrim(payload ->> 'source_quote_number'), ''), target_customer_id,
    target_warehouse_id, target_date, 'confirmado', coalesce((payload ->> 'prices_include_tax')::boolean, true),
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

  -- Ordenar por producto hace determinista la adquisicion de scopes FEFO y
  -- evita deadlocks cuando dos pedidos contienen productos en distinto orden.
  for order_item_row in
    select item.*
    from public.order_items item
    where item.organization_id = target_organization_id
      and item.order_id = target_order_id
    order by item.product_id, item.id
  loop
    perform public.reserve_order_item_fefo(
      target_organization_id,
      order_item_row.id,
      target_warehouse_id,
      actor_id
    );
  end loop;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values, metadata
  ) values (
    target_organization_id, actor_id, 'ORDER_CREATED', 'order', target_order_id::text,
    jsonb_build_object(
      'order_number', target_order_number,
      'customer_id', target_customer_id,
      'warehouse_id', target_warehouse_id,
      'inventory_reserved', true
    ),
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

comment on table public.orders is
  'Pedidos comerciales persistentes; create_order reserva stock FEFO de forma atomica sin generar movimientos.';
