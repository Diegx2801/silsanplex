-- SILSANPLEX: idempotencia estricta para pedidos y ventas.
--
-- El hash solo contiene datos funcionales de la operacion. Se excluyen
-- operation_key y los metadatos de auditoria para que un retry equivalente
-- pueda devolver el mismo registro. Las lineas se ordenan por product_id y
-- los numericos se convierten a texto desde numeric para evitar diferencias
-- accidentales entre 1, 1.0 y 1.00.

alter table public.orders
  add column if not exists operation_payload_hash text;

alter table public.sales
  add column if not exists operation_payload_hash text;

create or replace function public.normalize_commercial_idempotency_numeric(requested_value numeric)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when pg_catalog.strpos(requested_value::text, '.') > 0
      then pg_catalog.rtrim(pg_catalog.rtrim(requested_value::text, '0'), '.')
    else requested_value::text
  end;
$$;

revoke all on function public.normalize_commercial_idempotency_numeric(numeric)
  from public, anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_operation_payload_hash_format'
  ) then
    alter table public.orders
      add constraint orders_operation_payload_hash_format
      check (operation_payload_hash is null or operation_payload_hash ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sales'::regclass
      and conname = 'sales_operation_payload_hash_format'
  ) then
    alter table public.sales
      add constraint sales_operation_payload_hash_format
      check (operation_payload_hash is null or operation_payload_hash ~ '^[0-9a-f]{64}$');
  end if;
end;
$$;

-- Backfill seguro para historicos: se reconstruye el contrato desde las
-- columnas persistidas y sus lineas, nunca desde valores inventados. El campo
-- permanece nullable para instalaciones donde una fila historica se agregue
-- fuera de estas RPC; las funciones tambien tienen fallback compatible.
update public.orders order_row
set operation_payload_hash = encode(
  extensions.digest(
    jsonb_build_object(
      'organization_id', order_row.organization_id,
      'customer_id', order_row.customer_id,
      'warehouse_id', order_row.warehouse_id,
      'source_quote_id', order_row.source_quote_id,
      'source_quote_number', nullif(btrim(order_row.source_quote_number), ''),
      'order_date', order_row.order_date,
      'prices_include_tax', order_row.prices_include_tax,
      'notes', coalesce(order_row.notes, ''),
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'product_id', item.product_id,
            'quantity', public.normalize_commercial_idempotency_numeric(item.quantity),
            'unit_price', public.normalize_commercial_idempotency_numeric(item.unit_price)
          ) order by item.product_id
        )
        from public.order_items item
        where item.organization_id = order_row.organization_id
          and item.order_id = order_row.id
      ), '[]'::jsonb)
    )::text,
    'sha256'
  ),
  'hex'
)
where order_row.operation_payload_hash is null;

update public.sales sale_row
set operation_payload_hash = encode(
  extensions.digest(
    jsonb_build_object(
      'organization_id', sale_row.organization_id,
      'order_id', sale_row.order_id,
      'customer_id', sale_row.customer_id,
      'document_type', sale_row.document_type,
      'series', upper(btrim(sale_row.series)),
      'document_number', btrim(sale_row.document_number),
      'sale_date', sale_row.sale_date,
      'warehouse', btrim(sale_row.warehouse),
      'prices_include_tax', sale_row.prices_include_tax,
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'product_id', item.product_id,
            'quantity', public.normalize_commercial_idempotency_numeric(item.quantity),
            'unit_price', public.normalize_commercial_idempotency_numeric(item.unit_price)
          ) order by item.product_id
        )
        from public.sale_items item
        where item.organization_id = sale_row.organization_id
          and item.sale_id = sale_row.id
      ), '[]'::jsonb)
    )::text,
    'sha256'
  ),
  'hex'
)
where sale_row.operation_payload_hash is null;

comment on column public.orders.operation_payload_hash is
  'SHA-256 hexadecimal del payload funcional canonico de create_order; nullable solo para compatibilidad historica.';
comment on column public.sales.operation_payload_hash is
  'SHA-256 hexadecimal del payload funcional canonico de create_sale_from_order; nullable solo para compatibilidad historica.';

-- ---------------------------------------------------------------------------
-- create_order: compara el payload antes de devolver un retry.
-- ---------------------------------------------------------------------------

create or replace function public.create_order_unchecked(payload jsonb)
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
  canonical_payload jsonb;
  request_payload_hash text;
  existing_payload_hash text;
  stored_payload_hash text;
  order_item_row public.order_items%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
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

  -- Validacion estructural previa: permite calcular el mismo hash para un
  -- retry aunque el producto haya cambiado de estado desde la primera llamada.
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
  end loop;

  canonical_payload := jsonb_build_object(
    'organization_id', target_organization_id,
    'customer_id', target_customer_id,
    'warehouse_id', target_warehouse_id,
    'source_quote_id', target_source_quote_id,
    'source_quote_number', nullif(btrim(payload ->> 'source_quote_number'), ''),
    'order_date', target_date,
    'prices_include_tax', coalesce((payload ->> 'prices_include_tax')::boolean, true),
    'notes', coalesce(payload ->> 'notes', ''),
    'items', (
      select jsonb_agg(
        jsonb_build_object(
          'product_id', (item ->> 'product_id')::uuid,
          'quantity', public.normalize_commercial_idempotency_numeric((item ->> 'quantity')::numeric),
          'unit_price', public.normalize_commercial_idempotency_numeric((item ->> 'unit_price')::numeric)
        ) order by (item ->> 'product_id')::uuid
      )
      from jsonb_array_elements(payload -> 'items') item
    )
  );
  request_payload_hash := encode(
    extensions.digest(canonical_payload::text, 'sha256'),
    'hex'
  );

  -- La clave de operacion y la cotizacion comparten una seccion critica para
  -- que dos operation_key distintos no puedan competir por source_quote_id.
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_organization_id::text || ':order-operation:' || target_operation_key::text, 0));
  if target_source_quote_id is not null then
    perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
      target_organization_id::text || ':order-source-quote:' || target_source_quote_id::text, 0));
  end if;

  select order_row.id, order_row.operation_payload_hash
    into target_order_id, existing_payload_hash
  from public.orders order_row
  where order_row.organization_id = target_organization_id
    and order_row.operation_key = target_operation_key;
  if target_order_id is not null then
    if existing_payload_hash is null then
      select encode(
        extensions.digest(
          jsonb_build_object(
            'organization_id', order_row.organization_id,
            'customer_id', order_row.customer_id,
            'warehouse_id', order_row.warehouse_id,
            'source_quote_id', order_row.source_quote_id,
            'source_quote_number', nullif(btrim(order_row.source_quote_number), ''),
            'order_date', order_row.order_date,
            'prices_include_tax', order_row.prices_include_tax,
            'notes', coalesce(order_row.notes, ''),
            'items', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'product_id', item.product_id,
                  'quantity', public.normalize_commercial_idempotency_numeric(item.quantity),
                  'unit_price', public.normalize_commercial_idempotency_numeric(item.unit_price)
                ) order by item.product_id
              )
              from public.order_items item
              where item.organization_id = order_row.organization_id
                and item.order_id = order_row.id
            ), '[]'::jsonb)
          )::text,
          'sha256'
        ),
        'hex'
      ) into stored_payload_hash
      from public.orders order_row
      where order_row.id = target_order_id;
      existing_payload_hash := stored_payload_hash;
    end if;
    if existing_payload_hash is distinct from request_payload_hash then
      raise exception using errcode = 'P0001', message = 'ORDER_IDEMPOTENCY_CONFLICT';
    end if;
    update public.orders
    set operation_payload_hash = coalesce(operation_payload_hash, request_payload_hash)
    where id = target_order_id;
    return target_order_id;
  end if;

  if target_source_quote_id is not null then
    select order_row.id, order_row.operation_payload_hash
      into target_order_id, existing_payload_hash
    from public.orders order_row
    where order_row.organization_id = target_organization_id
      and order_row.source_quote_id = target_source_quote_id;
    if target_order_id is not null then
      if existing_payload_hash is null then
        select encode(
          extensions.digest(
            jsonb_build_object(
              'organization_id', order_row.organization_id,
              'customer_id', order_row.customer_id,
              'warehouse_id', order_row.warehouse_id,
              'source_quote_id', order_row.source_quote_id,
              'source_quote_number', nullif(btrim(order_row.source_quote_number), ''),
              'order_date', order_row.order_date,
              'prices_include_tax', order_row.prices_include_tax,
              'notes', coalesce(order_row.notes, ''),
              'items', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'product_id', item.product_id,
                    'quantity', public.normalize_commercial_idempotency_numeric(item.quantity),
                    'unit_price', public.normalize_commercial_idempotency_numeric(item.unit_price)
                  ) order by item.product_id
                )
                from public.order_items item
                where item.organization_id = order_row.organization_id
                  and item.order_id = order_row.id
              ), '[]'::jsonb)
            )::text,
            'sha256'
          ),
          'hex'
        ) into stored_payload_hash
        from public.orders order_row
        where order_row.id = target_order_id;
        existing_payload_hash := stored_payload_hash;
      end if;
      if existing_payload_hash is distinct from request_payload_hash then
        raise exception using errcode = 'P0001', message = 'ORDER_IDEMPOTENCY_CONFLICT';
      end if;
      update public.orders
      set operation_payload_hash = coalesce(operation_payload_hash, request_payload_hash)
      where id = target_order_id;
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
    operation_key, operation_payload_hash, created_by, updated_by
  ) values (
    target_organization_id, target_order_number, target_source_quote_id,
    nullif(btrim(payload ->> 'source_quote_number'), ''), target_customer_id,
    target_warehouse_id, target_date, 'confirmado', coalesce((payload ->> 'prices_include_tax')::boolean, true),
    coalesce(payload ->> 'notes', ''), target_operation_key, request_payload_hash, actor_id, actor_id
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

  -- Ordenar por producto conserva la adquisicion de scopes FEFO y evita
  -- deadlocks cuando dos pedidos contienen productos en distinto orden.
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
      select order_row.id, order_row.operation_payload_hash
        into target_order_id, existing_payload_hash
      from public.orders order_row
      where order_row.organization_id = target_organization_id
        and order_row.operation_key = target_operation_key;
      if target_order_id is not null then
        if existing_payload_hash is distinct from request_payload_hash then
          raise exception using errcode = 'P0001', message = 'ORDER_IDEMPOTENCY_CONFLICT';
        end if;
        return target_order_id;
      end if;
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_sale_from_order: incluye comprobante y snapshot de conversion.
-- ---------------------------------------------------------------------------

create or replace function public.create_sale_from_order_unchecked(
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
  target_document_type text;
  target_series text;
  target_document_number text;
  target_sale_date date;
  target_warehouse text;
  canonical_payload jsonb;
  request_payload_hash text;
  existing_payload_hash text;
  stored_payload_hash text;
begin
  if actor_id is null or not public.is_organization_member(requested_organization_id) then
    raise exception using errcode = '42501', message = 'SALE_FORBIDDEN';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'SALE_PAYLOAD_INVALID';
  end if;
  target_operation_key := nullif(payload ->> 'operation_key', '')::uuid;
  if target_operation_key is null then
    raise exception using errcode = '22023', message = 'SALE_OPERATION_KEY_REQUIRED';
  end if;
  target_document_type := payload ->> 'document_type';
  target_series := upper(btrim(payload ->> 'series'));
  target_document_number := btrim(payload ->> 'document_number');
  target_sale_date := coalesce(nullif(payload ->> 'sale_date', '')::date, current_date);
  target_warehouse := btrim(payload ->> 'warehouse');

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    requested_organization_id::text || ':sale-operation:' || target_operation_key::text, 0));

  -- El pedido se bloquea antes de calcular el hash para que la conversion y
  -- sus lineas sean un snapshot coherente incluso bajo concurrencia.
  select * into order_row
  from public.orders order_data
  where order_data.organization_id = requested_organization_id
    and order_data.id = requested_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SALE_ORDER_NOT_FOUND';
  end if;

  canonical_payload := jsonb_build_object(
    'organization_id', requested_organization_id,
    'order_id', requested_order_id,
    'customer_id', order_row.customer_id,
    'document_type', target_document_type,
    'series', target_series,
    'document_number', target_document_number,
    'sale_date', target_sale_date,
    'warehouse', target_warehouse,
    'prices_include_tax', order_row.prices_include_tax,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product_id', item.product_id,
          'quantity', public.normalize_commercial_idempotency_numeric(item.quantity),
          'unit_price', public.normalize_commercial_idempotency_numeric(item.unit_price)
        ) order by item.product_id
      )
      from public.order_items item
      where item.organization_id = requested_organization_id
        and item.order_id = requested_order_id
    ), '[]'::jsonb)
  );
  request_payload_hash := encode(
    extensions.digest(canonical_payload::text, 'sha256'),
    'hex'
  );

  select sale.id, sale.operation_payload_hash
    into target_sale_id, existing_payload_hash
  from public.sales sale
  where sale.organization_id = requested_organization_id
    and sale.operation_key = target_operation_key;
  if target_sale_id is not null then
    if existing_payload_hash is null then
      select encode(
        extensions.digest(
          jsonb_build_object(
            'organization_id', sale_row.organization_id,
            'order_id', sale_row.order_id,
            'customer_id', sale_row.customer_id,
            'document_type', sale_row.document_type,
            'series', upper(btrim(sale_row.series)),
            'document_number', btrim(sale_row.document_number),
            'sale_date', sale_row.sale_date,
            'warehouse', btrim(sale_row.warehouse),
            'prices_include_tax', sale_row.prices_include_tax,
            'items', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'product_id', item.product_id,
                  'quantity', public.normalize_commercial_idempotency_numeric(item.quantity),
                  'unit_price', public.normalize_commercial_idempotency_numeric(item.unit_price)
                ) order by item.product_id
              )
              from public.sale_items item
              where item.organization_id = sale_row.organization_id
                and item.sale_id = sale_row.id
            ), '[]'::jsonb)
          )::text,
          'sha256'
        ),
        'hex'
      ) into stored_payload_hash
      from public.sales sale_row
      where sale_row.id = target_sale_id;
      existing_payload_hash := stored_payload_hash;
    end if;
    if existing_payload_hash is distinct from request_payload_hash then
      raise exception using errcode = 'P0001', message = 'SALE_IDEMPOTENCY_CONFLICT';
    end if;
    update public.sales
    set operation_payload_hash = coalesce(operation_payload_hash, request_payload_hash)
    where id = target_sale_id;
    return target_sale_id;
  end if;

  if order_row.status <> 'confirmado' then
    raise exception using errcode = 'P0001', message = 'SALE_ORDER_NOT_AVAILABLE';
  end if;
  if not exists (
    select 1 from public.order_items item
    where item.organization_id = requested_organization_id
      and item.order_id = requested_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'SALE_ORDER_ITEMS_REQUIRED';
  end if;
  if exists (
    select 1 from public.sales sale
    where sale.organization_id = requested_organization_id
      and sale.order_id = requested_order_id
  ) then
    raise exception using errcode = '23505', message = 'SALE_ORDER_ALREADY_CONVERTED';
  end if;
  if coalesce(target_document_type, '') not in ('factura', 'boleta', 'nota-venta')
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
    status, operation_key, operation_payload_hash, created_by, updated_by
  ) values (
    requested_organization_id, requested_order_id, order_row.customer_id,
    target_internal_number, target_document_type, target_series,
    target_document_number, target_sale_date, target_warehouse,
    order_row.prices_include_tax, 'registrada', target_operation_key,
    request_payload_hash, actor_id, actor_id
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
      select sale.id, sale.operation_payload_hash
        into target_sale_id, existing_payload_hash
      from public.sales sale
      where sale.organization_id = requested_organization_id
        and sale.operation_key = target_operation_key;
      if target_sale_id is not null then
        if existing_payload_hash is distinct from request_payload_hash then
          raise exception using errcode = 'P0001', message = 'SALE_IDEMPOTENCY_CONFLICT';
        end if;
        return target_sale_id;
      end if;
    end if;
    raise;
end;
$$;

comment on function public.create_order_unchecked(jsonb) is
  'Primitiva interna de create_order con hash SHA-256 canonico y conflicto explicito por payload incompatible.';
comment on function public.create_sale_from_order_unchecked(uuid, uuid, jsonb) is
  'Primitiva interna de conversion a venta con hash SHA-256 canonico y conflicto explicito por payload incompatible.';
