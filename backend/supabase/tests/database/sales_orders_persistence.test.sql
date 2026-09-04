begin;

select plan(63);

select has_table('public', 'orders', 'existe el encabezado persistente de pedidos');
select has_table('public', 'order_items', 'existe el detalle persistente de pedidos');
select has_table('public', 'sales', 'existe el encabezado persistente de ventas');
select has_table('public', 'sale_items', 'existe el detalle persistente de ventas');
select has_function('public', 'create_order', array['jsonb'], 'existe la RPC transaccional de pedidos');
select has_function('public', 'create_sale_from_order', array['uuid', 'uuid', 'jsonb'], 'existe la RPC de conversion pedido-venta');
select has_column('public', 'orders', 'operation_payload_hash', 'orders persiste el hash del payload');
select has_column('public', 'sales', 'operation_payload_hash', 'sales persiste el hash del payload');
select ok((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), 'orders tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.order_items'::regclass), 'order_items tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.sales'::regclass), 'sales tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.sale_items'::regclass), 'sale_items tiene RLS');
select is(has_table_privilege('authenticated', 'public.orders', 'INSERT'), false, 'orders no acepta inserts directos');
select is(has_table_privilege('authenticated', 'public.order_items', 'INSERT'), false, 'order_items no acepta inserts directos');
select is(has_table_privilege('authenticated', 'public.sales', 'INSERT'), false, 'sales no acepta inserts directos');
select is(has_table_privilege('authenticated', 'public.sale_items', 'INSERT'), false, 'sale_items no acepta inserts directos');
select ok((select count(*) from pg_constraint where conname = 'orders_customer_same_organization') = 1, 'pedido y cliente comparten organizacion');
select ok((select count(*) from pg_constraint where conname = 'order_items_product_same_organization') = 1, 'linea de pedido y producto comparten organizacion');
select ok((select count(*) from pg_constraint where conname = 'sale_items_order_item_same_organization') = 1, 'linea de venta conserva linea de pedido');

insert into public.organizations (id, name, slug) values
  ('a2a00000-0000-4000-8000-000000000001', 'Ventas persistentes uno', 'ventas-persistentes-uno'),
  ('a2a00000-0000-4000-8000-000000000002', 'Ventas persistentes dos', 'ventas-persistentes-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('b2a00000-0000-4000-8000-000000000001', 'ventas.persistente@test.local', '{"full_name":"Ventas persistente"}', now(), now()),
  ('b2a00000-0000-4000-8000-000000000002', 'ventas.otra@test.local', '{"full_name":"Ventas otra"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('a2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000001'),
  ('a2a00000-0000-4000-8000-000000000002', 'b2a00000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('a2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000001', 'VENTAS'),
  ('a2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000001', 'ALMACEN'),
  ('a2a00000-0000-4000-8000-000000000002', 'b2a00000-0000-4000-8000-000000000002', 'VENTAS');

insert into public.customers (id, organization_id, document_type, document_number, legal_name, created_by, updated_by) values
  ('c2a00000-0000-4000-8000-000000000001', 'a2a00000-0000-4000-8000-000000000001', 'RUC', '20999999991', 'Cliente Ventas Uno', 'b2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000001'),
  ('c2a00000-0000-4000-8000-000000000002', 'a2a00000-0000-4000-8000-000000000002', 'RUC', '20999999992', 'Cliente Ventas Dos', 'b2a00000-0000-4000-8000-000000000002', 'b2a00000-0000-4000-8000-000000000002');
insert into public.products (id, organization_id, code, description, unit_of_measure, batch_control, created_by, updated_by) values
  ('d2a00000-0000-4000-8000-000000000001', 'a2a00000-0000-4000-8000-000000000001', 'VEN-001', 'Producto Venta Uno', 'UND', false, 'b2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000001'),
  ('d2a00000-0000-4000-8000-000000000002', 'a2a00000-0000-4000-8000-000000000001', 'VEN-002', 'Producto Venta Dos', 'CAJA', false, 'b2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000001'),
  ('d2a00000-0000-4000-8000-000000000003', 'a2a00000-0000-4000-8000-000000000002', 'VEN-003', 'Producto Venta Otra', 'UND', false, 'b2a00000-0000-4000-8000-000000000002', 'b2a00000-0000-4000-8000-000000000002');
insert into public.warehouses (id, organization_id, code, name, created_by, updated_by) values
  ('e2a00000-0000-4000-8000-000000000001', 'a2a00000-0000-4000-8000-000000000001', 'VENTAS', 'Almacen Ventas', 'b2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000001');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name, created_by, updated_by) values
  ('e2a00000-0000-4000-8000-000000000001', 'a2a00000-0000-4000-8000-000000000001', 'e2a00000-0000-4000-8000-000000000001', 'GENERAL', 'Ubicacion general', 'b2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2a00000-0000-4000-8000-000000000001', true);

select public.record_inventory_movement(jsonb_build_object(
  'organization_id','a2a00000-0000-4000-8000-000000000001',
  'product_id','d2a00000-0000-4000-8000-000000000001',
  'warehouse_id','e2a00000-0000-4000-8000-000000000001',
  'location_id','e2a00000-0000-4000-8000-000000000001',
  'movement_type','entrada','quantity',10,'unit_cost',10,
  'stock_status','available','operation_date','2026-09-01','reason','Stock de pedidos persistentes'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id','a2a00000-0000-4000-8000-000000000001',
  'product_id','d2a00000-0000-4000-8000-000000000002',
  'warehouse_id','e2a00000-0000-4000-8000-000000000001',
  'location_id','e2a00000-0000-4000-8000-000000000001',
  'movement_type','entrada','quantity',10,'unit_cost',5,
  'stock_status','available','operation_date','2026-09-01','reason','Stock de pedidos persistentes'
));

select lives_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','a2a00000-0000-4000-8000-000000000001',
    'operation_key','e2a00000-0000-4000-8000-000000000001',
    'source_quote_id','f2a00000-0000-4000-8000-000000000001',
    'source_quote_number','COT-000001',
    'customer_id','c2a00000-0000-4000-8000-000000000001',
    'warehouse_id','e2a00000-0000-4000-8000-000000000001',
    'order_date','2026-09-01','prices_include_tax',true,'notes','Pedido de prueba',
    'items',jsonb_build_array(jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000001','quantity',2,'unit_price',23.60))
  ))
$$, 'crea un pedido con una linea');
select is((select order_number from public.orders limit 1), 'PED-000001', 'la numeracion de pedido es correlativa');
select is((select count(*) from public.order_items), 1::bigint, 'se crea la linea en la misma transaccion');
select results_eq($$select subtotal, tax, total from public.orders limit 1$$, $$values (40.00::numeric, 7.20::numeric, 47.20::numeric)$$, 'los totales se calculan en PostgreSQL');
select is((select status from public.orders limit 1), 'confirmado', 'el pedido inicia confirmado');
set local role postgres;
select is((select count(*) from public.audit_events where action = 'ORDER_CREATED'), 1::bigint, 'se registra auditoria del pedido');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2a00000-0000-4000-8000-000000000001', true);

select is(
  public.create_order(jsonb_build_object(
    'organization_id','a2a00000-0000-4000-8000-000000000001',
    'operation_key','e2a00000-0000-4000-8000-000000000001',
    'source_quote_id','f2a00000-0000-4000-8000-000000000001',
    'source_quote_number','COT-000001',
    'customer_id','c2a00000-0000-4000-8000-000000000001',
    'warehouse_id','e2a00000-0000-4000-8000-000000000001',
    'order_date','2026-09-01','prices_include_tax',true,'notes','Pedido de prueba',
    'items',jsonb_build_array(jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000001','quantity',2,'unit_price',23.60))
  )),
  (select id from public.orders limit 1),
  'reintentar la misma operacion devuelve el mismo pedido'
);
select ok((select operation_payload_hash ~ '^[0-9a-f]{64}$' from public.orders limit 1), 'el pedido persiste un SHA-256 canonico');

select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','a2a00000-0000-4000-8000-000000000001','operation_key','e2a00000-0000-4000-8000-000000000001',
  'source_quote_id','f2a00000-0000-4000-8000-000000000001','source_quote_number','COT-000001',
  'customer_id','c2a00000-0000-4000-8000-000000000001','warehouse_id','e2a00000-0000-4000-8000-000000000001',
  'order_date','2026-09-01','prices_include_tax',true,'notes','Pedido de prueba',
  'items',jsonb_build_array(jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000001','quantity',3,'unit_price',23.60))
))$$, 'P0001', 'ORDER_IDEMPOTENCY_CONFLICT', 'la misma clave y distinta cantidad entra en conflicto');
select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','a2a00000-0000-4000-8000-000000000001','operation_key','e2a00000-0000-4000-8000-000000000001',
  'source_quote_id','f2a00000-0000-4000-8000-000000000001','source_quote_number','COT-000001',
  'customer_id','c2a00000-0000-4000-8000-000000000002','warehouse_id','e2a00000-0000-4000-8000-000000000001',
  'order_date','2026-09-01','prices_include_tax',true,'notes','Pedido de prueba',
  'items',jsonb_build_array(jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000001','quantity',2,'unit_price',23.60))
))$$, 'P0001', 'ORDER_IDEMPOTENCY_CONFLICT', 'la misma clave y distinto cliente entra en conflicto');
select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','a2a00000-0000-4000-8000-000000000001','operation_key','e2a00000-0000-4000-8000-000000000001',
  'source_quote_id','f2a00000-0000-4000-8000-000000000001','source_quote_number','COT-000001',
  'customer_id','c2a00000-0000-4000-8000-000000000001','warehouse_id','e2a00000-0000-4000-8000-000000000099',
  'order_date','2026-09-01','prices_include_tax',true,'notes','Pedido de prueba',
  'items',jsonb_build_array(jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000001','quantity',2,'unit_price',23.60))
))$$, 'P0001', 'ORDER_IDEMPOTENCY_CONFLICT', 'la misma clave y distinto almacen entra en conflicto');
select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','a2a00000-0000-4000-8000-000000000001','operation_key','e2a00000-0000-4000-8000-000000000007',
  'source_quote_id','f2a00000-0000-4000-8000-000000000001','source_quote_number','COT-000001',
  'customer_id','c2a00000-0000-4000-8000-000000000001','warehouse_id','e2a00000-0000-4000-8000-000000000001',
  'order_date','2026-09-01','prices_include_tax',true,'notes','Pedido de prueba',
  'items',jsonb_build_array(jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000001','quantity',3,'unit_price',23.60))
))$$, 'P0001', 'ORDER_IDEMPOTENCY_CONFLICT', 'source_quote_id no acepta un pedido incompatible');
select is((select count(*) from public.orders), 1::bigint, 'los conflictos de idempotencia no crean pedidos');
select is((select count(*) from public.inventory_reservations where source_type = 'order-item'), 1::bigint, 'los conflictos no duplican reservas');
select is((select count(*) from public.inventory_movements where organization_id = 'a2a00000-0000-4000-8000-000000000001'), 2::bigint, 'los conflictos no generan movimientos de inventario');

select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','a2a00000-0000-4000-8000-000000000001','operation_key','e2a00000-0000-4000-8000-000000000002',
  'customer_id','c2a00000-0000-4000-8000-000000000001','warehouse_id','e2a00000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000003','quantity',1,'unit_price',1))
))$$, 'P0001', 'ORDER_PRODUCT_UNAVAILABLE', 'rechaza producto de otra organizacion');
select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','a2a00000-0000-4000-8000-000000000001','operation_key','e2a00000-0000-4000-8000-000000000003',
  'customer_id','c2a00000-0000-4000-8000-000000000002','warehouse_id','e2a00000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000001','quantity',1,'unit_price',1))
))$$, 'P0001', 'ORDER_CUSTOMER_UNAVAILABLE', 'rechaza cliente de otra organizacion');
select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','a2a00000-0000-4000-8000-000000000001','operation_key','e2a00000-0000-4000-8000-000000000004',
  'customer_id','c2a00000-0000-4000-8000-000000000001','warehouse_id','e2a00000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000001','quantity',0,'unit_price',1))
))$$, '22023', 'ORDER_ITEM_VALUES_INVALID', 'rechaza cantidad cero');
select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','a2a00000-0000-4000-8000-000000000002','operation_key','e2a00000-0000-4000-8000-000000000005',
  'customer_id','c2a00000-0000-4000-8000-000000000002','items',jsonb_build_array(jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000001','quantity',1,'unit_price',1))
))$$, '42501', 'ORDER_FORBIDDEN', 'impide crear en otra organizacion');

select lives_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id','a2a00000-0000-4000-8000-000000000001','operation_key','e2a00000-0000-4000-8000-000000000006',
    'customer_id','c2a00000-0000-4000-8000-000000000001','warehouse_id','e2a00000-0000-4000-8000-000000000001','items',jsonb_build_array(
      jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000001','quantity',1,'unit_price',10),
      jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000002','quantity',3,'unit_price',5)
    )
  ))
$$, 'crea un segundo pedido con varias lineas');
select is((select count(*) from public.orders), 2::bigint, 'dos operaciones generan dos pedidos sin colisionar');
select is((select count(distinct order_number) from public.orders), 2::bigint, 'los numeros de pedido son unicos');
select is((select count(*) from public.orders where organization_id = 'a2a00000-0000-4000-8000-000000000001'), 2::bigint, 'el listado incluye los pedidos de la organizacion');

select is(
  public.create_order(jsonb_build_object(
    'organization_id','a2a00000-0000-4000-8000-000000000001','operation_key','e2a00000-0000-4000-8000-000000000006',
    'customer_id','c2a00000-0000-4000-8000-000000000001','warehouse_id','e2a00000-0000-4000-8000-000000000001',
    'items',jsonb_build_array(
      jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000002','quantity',3,'unit_price',5),
      jsonb_build_object('product_id','d2a00000-0000-4000-8000-000000000001','quantity',1,'unit_price',10)
    )
  )),
  (select id from public.orders where operation_key = 'e2a00000-0000-4000-8000-000000000006'),
  'las lineas en orden distinto conservan la idempotencia semantica'
);

select lives_ok($$
  select public.create_sale_from_order(
    'a2a00000-0000-4000-8000-000000000001',
    (select id from public.orders order by order_number limit 1),
    jsonb_build_object('operation_key','e2a00000-0000-4000-8000-000000000011','document_type','factura','series','f001','document_number','000001','sale_date','2026-09-01','warehouse','Almacen principal')
  )
$$, 'convierte un pedido en venta de forma atomica');
select is((select count(*) from public.sales), 1::bigint, 'se crea una venta');
select is((select count(*) from public.sale_items), 1::bigint, 'la venta conserva sus lineas');
select is((select order_id from public.sales limit 1), (select id from public.orders order by order_number limit 1), 'la venta conserva el vinculo al pedido');
set local role postgres;
select is((select count(*) from public.audit_events where action = 'SALE_CREATED'), 1::bigint, 'se registra auditoria de venta');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2a00000-0000-4000-8000-000000000001', true);
select is((select internal_number from public.sales limit 1), 'VEN-000001', 'la numeracion interna de venta es correlativa');
select ok((select operation_payload_hash ~ '^[0-9a-f]{64}$' from public.sales limit 1), 'la venta persiste un SHA-256 canonico');
select is(
  public.create_sale_from_order(
    'a2a00000-0000-4000-8000-000000000001',
    (select order_id from public.sales limit 1),
    jsonb_build_object('operation_key','e2a00000-0000-4000-8000-000000000011','document_type','factura','series','f001','document_number','000001','sale_date','2026-09-01','warehouse','Almacen principal')
  ),
  (select id from public.sales limit 1),
  'reintentar la conversion devuelve la misma venta'
);
select throws_ok($$select public.create_sale_from_order(
  'a2a00000-0000-4000-8000-000000000001', (select order_id from public.sales limit 1),
  jsonb_build_object('operation_key','e2a00000-0000-4000-8000-000000000011','document_type','factura','series','f001','document_number','000099','sale_date','2026-09-01','warehouse','Almacen principal')
)$$, 'P0001', 'SALE_IDEMPOTENCY_CONFLICT', 'la misma clave de venta y comprobante distinto entra en conflicto');
select is((select count(*) from public.sales), 1::bigint, 'el conflicto de venta no crea otra venta');
select is((select count(*) from public.sale_items), 1::bigint, 'el conflicto de venta no duplica lineas ni movimientos');
select throws_ok($$select public.create_sale_from_order('a2a00000-0000-4000-8000-000000000001', (select order_id from public.sales limit 1), jsonb_build_object('operation_key','e2a00000-0000-4000-8000-000000000012','document_type','factura','series','f001','document_number','000002','warehouse','Almacen principal'))$$, '23505', 'SALE_ORDER_ALREADY_CONVERTED', 'una venta por pedido');
select throws_ok($$select public.create_sale_from_order('a2a00000-0000-4000-8000-000000000001', (select id from public.orders order by order_number desc limit 1), jsonb_build_object('operation_key','e2a00000-0000-4000-8000-000000000014','document_type','factura','series','f001','document_number','000002','warehouse',null))$$, '22023', 'SALE_DOCUMENT_INVALID', 'rechaza datos obligatorios de venta ausentes');
select is((select total from public.sales limit 1), (select total from public.orders order by order_number limit 1), 'la venta conserva el total calculado');
select throws_ok($$select public.create_sale_from_order('a2a00000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-ffffffffffff', jsonb_build_object('operation_key','e2a00000-0000-4000-8000-000000000015','document_type','factura','series','f001','document_number','000004','warehouse','Almacen principal'))$$, 'P0002', 'SALE_ORDER_NOT_FOUND', 'rechaza convertir un pedido inexistente');

select set_config('request.jwt.claim.sub', 'b2a00000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.orders), 0::bigint, 'un usuario de otra organizacion no observa pedidos ajenos');
select is((select count(*) from public.sales), 0::bigint, 'un usuario de otra organizacion no observa ventas ajenas');
select throws_ok($$select public.create_sale_from_order('a2a00000-0000-4000-8000-000000000001', (select order_id from public.sales limit 1), jsonb_build_object('operation_key','e2a00000-0000-4000-8000-000000000013','document_type','factura','series','f001','document_number','000003','warehouse','Almacen principal'))$$, '42501', 'SALE_FORBIDDEN', 'no permite operar en otra organizacion');
select is(has_table_privilege('authenticated', 'public.order_items', 'UPDATE'), false, 'un usuario no puede modificar lineas directamente');
select is((select count(*) from public.orders where organization_id = 'a2a00000-0000-4000-8000-000000000001'), 0::bigint, 'RLS filtra tambien la consulta con organizacion explicita');

select * from finish();
rollback;
