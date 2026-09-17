begin;

select plan(24);

select has_table('public', 'sales_quotes', 'existe el encabezado persistente de cotizaciones');
select has_table('public', 'sales_quote_items', 'existen las lineas persistentes de cotizaciones');
select has_function('public', 'save_sales_quote', array['jsonb'], 'existe la RPC de guardado de cotizacion');
select has_function('public', 'issue_sales_quote', array['uuid', 'uuid'], 'existe la RPC de emision de cotizacion');
select has_function('public', 'reject_sales_quote', array['uuid', 'uuid', 'text'], 'existe la RPC de rechazo de cotizacion');

insert into public.organizations (id, name, slug)
values ('a9b00000-0000-4000-8000-000000000001', 'Cotizaciones uno', 'cotizaciones-uno');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'a9c00000-0000-4000-8000-000000000001',
  'cotizaciones@test.local',
  '{"full_name":"Cotizaciones"}', now(), now()
);
insert into public.organization_memberships (organization_id, user_id)
values ('a9b00000-0000-4000-8000-000000000001', 'a9c00000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('a9b00000-0000-4000-8000-000000000001', 'a9c00000-0000-4000-8000-000000000001', 'ADMIN');
insert into public.customers (
  id, organization_id, document_type, document_number, legal_name,
  created_by, updated_by
)
values (
  'a9d00000-0000-4000-8000-000000000001',
  'a9b00000-0000-4000-8000-000000000001', 'RUC', '20999999001',
  'Cliente cotizacion', 'a9c00000-0000-4000-8000-000000000001',
  'a9c00000-0000-4000-8000-000000000001'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure,
  tax_affectation, batch_control, expiration_control, created_by, updated_by
)
values (
  'a9e00000-0000-4000-8000-000000000001',
  'a9b00000-0000-4000-8000-000000000001', 'COT-001', 'Producto cotizable',
  'UND', 'gravado', false, false,
  'a9c00000-0000-4000-8000-000000000001',
  'a9c00000-0000-4000-8000-000000000001'
);
insert into public.warehouses (
  id, organization_id, code, name, is_active, created_by, updated_by
)
values (
  'a9f00000-0000-4000-8000-000000000001',
  'a9b00000-0000-4000-8000-000000000001', 'COT', 'Almacen cotizaciones', true,
  'a9c00000-0000-4000-8000-000000000001',
  'a9c00000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values (
  'a9a00000-0000-4000-8000-000000000001',
  'a9b00000-0000-4000-8000-000000000001',
  'a9f00000-0000-4000-8000-000000000001', 'GENERAL', 'Ubicacion general',
  'a9c00000-0000-4000-8000-000000000001',
  'a9c00000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a9c00000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.record_inventory_movement(jsonb_build_object(
  'organization_id', 'a9b00000-0000-4000-8000-000000000001',
  'product_id', 'a9e00000-0000-4000-8000-000000000001',
  'warehouse_id', 'a9f00000-0000-4000-8000-000000000001',
  'location_id', 'a9a00000-0000-4000-8000-000000000001',
  'movement_type', 'entrada', 'quantity', 20, 'unit_cost', 10,
  'stock_status', 'available', 'operation_date', '2026-09-16',
  'reason', 'Stock para cotizacion'
));

select public.save_sales_quote(jsonb_build_object(
  'organization_id', 'a9b00000-0000-4000-8000-000000000001',
  'quote_id', 'a9100000-0000-4000-8000-000000000001',
  'customer_id', 'a9d00000-0000-4000-8000-000000000001',
  'issue_date', '2026-09-16', 'valid_until', '2026-09-30',
  'prices_include_tax', true, 'notes', 'Cotizacion de prueba',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'a9e00000-0000-4000-8000-000000000001',
    'quantity', 2, 'unit_price', 118
  ))
)) as quote_id \gset

select is((select quote_number from public.sales_quotes where id = :'quote_id'), 'COT-000001', 'genera numero secuencial por organizacion');
select is((select status from public.sales_quotes where id = :'quote_id'), 'borrador', 'el guardado inicia en borrador');
select is((select total from public.sales_quotes where id = :'quote_id'), 236.00::numeric, 'calcula total con IGV incluido');
select is((select count(*) from public.sales_quote_items where quote_id = :'quote_id'), 1::bigint, 'guarda una linea con snapshot');
select is((select tax_affectation from public.sales_quote_items where quote_id = :'quote_id'), 'gravado', 'conserva la afectacion tributaria');

select public.issue_sales_quote(
  'a9b00000-0000-4000-8000-000000000001', :'quote_id'
);
select is((select status from public.sales_quotes where id = :'quote_id'), 'emitida', 'emite el borrador');
select ok((select issued_at is not null from public.sales_quotes where id = :'quote_id'), 'registra fecha de emision');

select public.create_order(jsonb_build_object(
  'organization_id', 'a9b00000-0000-4000-8000-000000000001',
  'operation_key', 'a9200000-0000-4000-8000-000000000001',
  'source_quote_id', :'quote_id',
  'warehouse_id', 'a9f00000-0000-4000-8000-000000000001',
  -- Estos valores se ignoran de forma intencional: la cotizacion persistida
  -- es la fuente de verdad para cliente, precios y lineas.
  'customer_id', 'a9d00000-0000-4000-8000-000000000001',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'a9e00000-0000-4000-8000-000000000001',
    'quantity', 2, 'unit_price', 118
  ))
)) as order_id \gset

select is((select status from public.sales_quotes where id = :'quote_id'), 'aceptada', 'crear pedido acepta la cotizacion atomica');
select is((select accepted_order_id from public.sales_quotes where id = :'quote_id'), (:'order_id')::uuid, 'la cotizacion conserva el pedido de origen');
select is((select source_quote_id from public.orders where id = :'order_id'), (:'quote_id')::uuid, 'pedido conserva referencia a la cotizacion');
select is((select customer_id from public.orders where id = :'order_id'), 'a9d00000-0000-4000-8000-000000000001'::uuid, 'pedido toma cliente de la cotizacion');
select is((select count(*) from public.order_items where order_id = :'order_id'), 1::bigint, 'pedido copia las lineas de la cotizacion');
select is((select count(*) from public.audit_events where entity_type = 'sales_quote' and entity_id = :'quote_id' and action = 'QUOTE_ACCEPTED'), 1::bigint, 'audita la aceptacion de la cotizacion');

select public.create_order(jsonb_build_object(
  'organization_id', 'a9b00000-0000-4000-8000-000000000001',
  'operation_key', 'a9200000-0000-4000-8000-000000000001',
  'source_quote_id', :'quote_id',
  'warehouse_id', 'a9f00000-0000-4000-8000-000000000001'
)) as retry_order_id \gset
select is(:'retry_order_id'::uuid, :'order_id'::uuid, 'reintento idempotente devuelve el mismo pedido');
select is((select count(*) from public.orders where source_quote_id = :'quote_id'), 1::bigint, 'la conversion no duplica el pedido');

select public.save_sales_quote(jsonb_build_object(
  'organization_id', 'a9b00000-0000-4000-8000-000000000001',
  'quote_id', 'a9100000-0000-4000-8000-000000000002',
  'customer_id', 'a9d00000-0000-4000-8000-000000000001',
  'issue_date', '2026-09-16', 'valid_until', '2026-09-30',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'a9e00000-0000-4000-8000-000000000001', 'quantity', 1, 'unit_price', 10
  ))
)) as draft_quote_id \gset
select throws_ok($$select public.create_order(jsonb_build_object(
  'organization_id','a9b00000-0000-4000-8000-000000000001',
  'source_quote_id','a9100000-0000-4000-8000-000000000002',
  'warehouse_id','a9f00000-0000-4000-8000-000000000001'
))$$, 'P0001', 'SALES_QUOTE_NOT_AVAILABLE', 'un borrador no puede crear pedido');

select public.issue_sales_quote(
  'a9b00000-0000-4000-8000-000000000001', :'draft_quote_id'
);
select public.reject_sales_quote(
  'a9b00000-0000-4000-8000-000000000001', :'draft_quote_id', 'Cliente solicito cambio'
);
select is((select status from public.sales_quotes where id = :'draft_quote_id'), 'rechazada', 'rechaza una cotizacion emitida');
select is((select rejection_reason from public.sales_quotes where id = :'draft_quote_id'), 'Cliente solicito cambio', 'conserva la razon del rechazo');

select throws_ok($$select public.save_sales_quote(jsonb_build_object(
  'organization_id','a9b00000-0000-4000-8000-000000000001',
  'quote_id','a9100000-0000-4000-8000-000000000002',
  'customer_id','a9d00000-0000-4000-8000-000000000001',
  'issue_date','2026-09-16','valid_until','2026-09-30',
  'items',jsonb_build_array(jsonb_build_object(
    'product_id','a9e00000-0000-4000-8000-000000000001','quantity',1,'unit_price',10
  ))
))$$, 'P0001', 'SALES_QUOTE_NOT_DRAFT', 'una cotizacion rechazada es inmutable');

select * from finish();
rollback;
