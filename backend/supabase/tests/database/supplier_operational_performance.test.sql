begin;

select plan(26);

select has_view(
  'public',
  'supplier_operational_performance_facts',
  'existe el read model de hechos operativos E4A'
);
select has_view(
  'public',
  'supplier_operational_performance_summary',
  'existe el resumen operativo E4A'
);
select has_function(
  'public',
  'get_supplier_operational_performance_summary',
  array['uuid', 'uuid', 'timestamptz', 'timestamptz'],
  'existe la lectura parametrizada del desempeño operativo'
);
select has_column(
  'public',
  'supplier_operational_performance_summary',
  'closed_partial_orders',
  'el resumen separa ordenes cerradas parciales'
);
select has_column(
  'public',
  'supplier_operational_performance_summary',
  'avg_days_to_first_receipt',
  'el resumen expone dias hasta primera recepcion'
);
select has_column(
  'public',
  'supplier_operational_performance_summary',
  'returned_quantity_percentage',
  'el resumen expone porcentaje devuelto compatible'
);
select is(
  has_table_privilege('anon', 'public.supplier_operational_performance_summary', 'SELECT'),
  false,
  'anon no consulta el resumen operativo'
);
select is(
  has_function_privilege(
    'anon',
    'public.get_supplier_operational_performance_summary(uuid, uuid, timestamp with time zone, timestamp with time zone)',
    'EXECUTE'
  ),
  false,
  'anon no ejecuta la lectura operativa'
);
select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_supplier_operational_performance_summary'
      and p.pronargs = 4
  ),
  false,
  'la lectura E4A no usa SECURITY DEFINER'
);

set local role postgres;

insert into public.organizations (id, name, slug) values
  ('e4a00000-0000-4000-8000-000000000001', 'E4A empresa uno', 'e4a-empresa-uno'),
  ('e4a00000-0000-4000-8000-000000000002', 'E4A empresa dos', 'e4a-empresa-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('e4a10000-0000-4000-8000-000000000001', 'e4a.compras@test.local', '{"full_name":"E4A Compras"}', now(), now()),
  ('e4a10000-0000-4000-8000-000000000002', 'e4a.almacen@test.local', '{"full_name":"E4A Almacen"}', now(), now()),
  ('e4a10000-0000-4000-8000-000000000003', 'e4a.ventas@test.local', '{"full_name":"E4A Ventas"}', now(), now()),
  ('e4a10000-0000-4000-8000-000000000004', 'e4a.otra@test.local', '{"full_name":"E4A Otra empresa"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('e4a00000-0000-4000-8000-000000000001', 'e4a10000-0000-4000-8000-000000000001'),
  ('e4a00000-0000-4000-8000-000000000001', 'e4a10000-0000-4000-8000-000000000002'),
  ('e4a00000-0000-4000-8000-000000000001', 'e4a10000-0000-4000-8000-000000000003'),
  ('e4a00000-0000-4000-8000-000000000002', 'e4a10000-0000-4000-8000-000000000004');

insert into public.user_roles (organization_id, user_id, role_code) values
  ('e4a00000-0000-4000-8000-000000000001', 'e4a10000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('e4a00000-0000-4000-8000-000000000001', 'e4a10000-0000-4000-8000-000000000002', 'ALMACEN'),
  ('e4a00000-0000-4000-8000-000000000001', 'e4a10000-0000-4000-8000-000000000003', 'VENTAS'),
  ('e4a00000-0000-4000-8000-000000000002', 'e4a10000-0000-4000-8000-000000000004', 'COMPRAS');

insert into public.suppliers (id, organization_id, document_type, document_number, business_name) values
  ('e4a20000-0000-4000-8000-000000000001', 'e4a00000-0000-4000-8000-000000000001', 'ruc', '20640000001', 'Proveedor E4A Uno'),
  ('e4a20000-0000-4000-8000-000000000002', 'e4a00000-0000-4000-8000-000000000001', 'ruc', '20640000002', 'Proveedor E4A Dos'),
  ('e4a20000-0000-4000-8000-000000000003', 'e4a00000-0000-4000-8000-000000000002', 'ruc', '20640000003', 'Proveedor E4A Otra');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control
) values
  ('e4a30000-0000-4000-8000-000000000001', 'e4a00000-0000-4000-8000-000000000001', 'E4A-P1', 'Producto E4A Unidad', 'UND', 'good', 'gravado', false, false),
  ('e4a30000-0000-4000-8000-000000000002', 'e4a00000-0000-4000-8000-000000000001', 'E4A-P2', 'Producto E4A Peso', 'KILOGRAMO', 'good', 'gravado', false, false),
  ('e4a30000-0000-4000-8000-000000000003', 'e4a00000-0000-4000-8000-000000000001', 'E4A-S1', 'Servicio E4A', 'SERVICIO', 'service', 'inafecto', false, false),
  ('e4a30000-0000-4000-8000-000000000004', 'e4a00000-0000-4000-8000-000000000001', 'E4A-P3', 'Producto E4A Segundo Proveedor', 'UND', 'good', 'gravado', false, false),
  ('e4a30000-0000-4000-8000-000000000005', 'e4a00000-0000-4000-8000-000000000002', 'E4A-OT', 'Producto E4A Otra Empresa', 'UND', 'good', 'gravado', false, false);

insert into public.warehouses (id, organization_id, code, name) values
  ('e4a40000-0000-4000-8000-000000000001', 'e4a00000-0000-4000-8000-000000000001', 'E4A-ALM', 'Almacen E4A'),
  ('e4a40000-0000-4000-8000-000000000002', 'e4a00000-0000-4000-8000-000000000002', 'E4A-OTR', 'Almacen E4A Otra');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name) values
  ('e4a50000-0000-4000-8000-000000000001', 'e4a00000-0000-4000-8000-000000000001', 'e4a40000-0000-4000-8000-000000000001', 'GENERAL', 'General E4A'),
  ('e4a50000-0000-4000-8000-000000000002', 'e4a00000-0000-4000-8000-000000000002', 'e4a40000-0000-4000-8000-000000000002', 'GENERAL', 'General E4A Otra');

-- Proveedor uno: seis ordenes operativas. Hay una orden parcial con dos
-- recepciones, una cerrada parcial y una sobre-recepcion deliberada para que
-- el read model no oculte ese hecho. La orden de servicio queda fuera.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, expected_delivery_date,
  received_at
) values
  ('e4a60000-0000-4000-8000-000000000001', 'e4a00000-0000-4000-8000-000000000001', 'e4a20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4A Uno', 'factura', 'E401', '001', '2026-01-01', 'Almacen E4A', 'e4a40000-0000-4000-8000-000000000001', 'PEN', true, 'received', '2026-01-01 08:00+00', '2026-01-06', '2026-01-05 08:00+00'),
  ('e4a60000-0000-4000-8000-000000000002', 'e4a00000-0000-4000-8000-000000000001', 'e4a20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4A Uno', 'factura', 'E402', '002', '2026-02-01', 'Almacen E4A', 'e4a40000-0000-4000-8000-000000000001', 'PEN', true, 'partially_received', '2026-02-01 08:00+00', null, null),
  ('e4a60000-0000-4000-8000-000000000004', 'e4a00000-0000-4000-8000-000000000001', 'e4a20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4A Uno', 'factura', 'E404', '004', '2026-04-01', 'Almacen E4A', 'e4a40000-0000-4000-8000-000000000001', 'PEN', true, 'received', '2026-04-01 08:00+00', '2026-04-05', '2026-04-10 08:00+00'),
  ('e4a60000-0000-4000-8000-000000000005', 'e4a00000-0000-4000-8000-000000000001', 'e4a20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4A Uno', 'factura', 'E405', '005', '2026-05-01', 'Almacen E4A', 'e4a40000-0000-4000-8000-000000000001', 'PEN', true, 'issued', '2026-05-01 08:00+00', null, null),
  ('e4a60000-0000-4000-8000-000000000006', 'e4a00000-0000-4000-8000-000000000001', 'e4a20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4A Uno', 'factura', 'E406', '006', '2026-06-01', 'Almacen E4A', 'e4a40000-0000-4000-8000-000000000001', 'PEN', true, 'received', '2026-06-01 08:00+00', '2026-06-05', '2026-06-02 08:00+00'),
  ('e4a60000-0000-4000-8000-000000000007', 'e4a00000-0000-4000-8000-000000000001', 'e4a20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4A Uno', 'factura', 'E407', '007', '2026-07-01', 'Almacen E4A', 'e4a40000-0000-4000-8000-000000000001', 'PEN', true, 'draft', null, null, null),
  ('e4a60000-0000-4000-8000-000000000009', 'e4a00000-0000-4000-8000-000000000001', 'e4a20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4A Uno', 'factura', 'E409', '009', '2026-09-01', 'Almacen E4A', 'e4a40000-0000-4000-8000-000000000001', 'PEN', true, 'received', '2026-09-01 08:00+00', null, '2026-09-03 08:00+00');

insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, expected_delivery_date,
  received_at, closed_at, closed_by, close_reason
) values (
  'e4a60000-0000-4000-8000-000000000003', 'e4a00000-0000-4000-8000-000000000001', 'e4a20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4A Uno', 'factura', 'E403', '003', '2026-03-01', 'Almacen E4A', 'e4a40000-0000-4000-8000-000000000001', 'PEN', true, 'closed_partial', '2026-03-01 08:00+00', '2026-03-05', null, '2026-03-20 08:00+00', 'e4a10000-0000-4000-8000-000000000001', 'Saldo no atendido'
);

insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, expected_delivery_date,
  received_at, cancelled_at, closed_at, close_reason
) values (
  'e4a60000-0000-4000-8000-000000000008', 'e4a00000-0000-4000-8000-000000000001', 'e4a20000-0000-4000-8000-000000000001', '20640000001', 'Proveedor E4A Uno', 'factura', 'E408', '008', '2026-08-01', 'Almacen E4A', 'e4a40000-0000-4000-8000-000000000001', 'PEN', true, 'cancelled', null, null, null, '2026-08-02 08:00+00', '2026-08-02 08:00+00', 'Anulada'
);

insert into public.purchase_order_items (
  id, purchase_order_id, organization_id, product_id, product_code,
  product_description, unit_of_measure, batch_control, quantity, unit_cost,
  product_type
) values
  ('e4a70000-0000-4000-8000-000000000001', 'e4a60000-0000-4000-8000-000000000001', 'e4a00000-0000-4000-8000-000000000001', 'e4a30000-0000-4000-8000-000000000001', 'E4A-P1', 'Producto E4A Unidad', 'UND', false, 10, 10, 'good'),
  ('e4a70000-0000-4000-8000-000000000002', 'e4a60000-0000-4000-8000-000000000002', 'e4a00000-0000-4000-8000-000000000001', 'e4a30000-0000-4000-8000-000000000001', 'E4A-P1', 'Producto E4A Unidad', 'UND', false, 10, 11, 'good'),
  ('e4a70000-0000-4000-8000-000000000003', 'e4a60000-0000-4000-8000-000000000003', 'e4a00000-0000-4000-8000-000000000001', 'e4a30000-0000-4000-8000-000000000001', 'E4A-P1', 'Producto E4A Unidad', 'UND', false, 20, 12, 'good'),
  ('e4a70000-0000-4000-8000-000000000004', 'e4a60000-0000-4000-8000-000000000004', 'e4a00000-0000-4000-8000-000000000001', 'e4a30000-0000-4000-8000-000000000002', 'E4A-P2', 'Producto E4A Peso', 'KG', false, 5, 13, 'good'),
  ('e4a70000-0000-4000-8000-000000000005', 'e4a60000-0000-4000-8000-000000000005', 'e4a00000-0000-4000-8000-000000000001', 'e4a30000-0000-4000-8000-000000000001', 'E4A-P1', 'Producto E4A Unidad', 'UND', false, 3, 14, 'good'),
  ('e4a70000-0000-4000-8000-000000000006', 'e4a60000-0000-4000-8000-000000000006', 'e4a00000-0000-4000-8000-000000000001', 'e4a30000-0000-4000-8000-000000000001', 'E4A-P1', 'Producto E4A Unidad', 'UND', false, 5, 15, 'good'),
  ('e4a70000-0000-4000-8000-000000000007', 'e4a60000-0000-4000-8000-000000000007', 'e4a00000-0000-4000-8000-000000000001', 'e4a30000-0000-4000-8000-000000000001', 'E4A-P1', 'Producto E4A Unidad', 'UND', false, 2, 16, 'good'),
  ('e4a70000-0000-4000-8000-000000000008', 'e4a60000-0000-4000-8000-000000000008', 'e4a00000-0000-4000-8000-000000000001', 'e4a30000-0000-4000-8000-000000000001', 'E4A-P1', 'Producto E4A Unidad', 'UND', false, 2, 17, 'good'),
  ('e4a70000-0000-4000-8000-000000000009', 'e4a60000-0000-4000-8000-000000000009', 'e4a00000-0000-4000-8000-000000000001', 'e4a30000-0000-4000-8000-000000000003', 'E4A-S1', 'Servicio E4A', 'SERV', false, 2, 100, 'service');

-- Segundo proveedor dentro de la misma organizacion: unidad compatible y una
-- devolucion completada para medir el denominador real recibido.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, expected_delivery_date,
  received_at
) values
  ('e4a60000-0000-4000-8000-000000000101', 'e4a00000-0000-4000-8000-000000000001', 'e4a20000-0000-4000-8000-000000000002', '20640000002', 'Proveedor E4A Dos', 'factura', 'E410', '010', '2026-09-01', 'Almacen E4A', 'e4a40000-0000-4000-8000-000000000001', 'USD', true, 'received', '2026-09-01 08:00+00', '2026-09-05', '2026-09-03 08:00+00');
insert into public.purchase_order_items (
  id, purchase_order_id, organization_id, product_id, product_code,
  product_description, unit_of_measure, batch_control, quantity, unit_cost,
  product_type
) values
  ('e4a70000-0000-4000-8000-000000000101', 'e4a60000-0000-4000-8000-000000000101', 'e4a00000-0000-4000-8000-000000000001', 'e4a30000-0000-4000-8000-000000000004', 'E4A-P3', 'Producto E4A Segundo Proveedor', 'UND', false, 4, 7, 'good');

-- Tercera organizacion: debe quedar fuera de toda lectura de la organizacion A.
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  currency, prices_include_tax, status, issued_at, received_at
) values
  ('e4a60000-0000-4000-8000-000000000201', 'e4a00000-0000-4000-8000-000000000002', 'e4a20000-0000-4000-8000-000000000003', '20640000003', 'Proveedor E4A Otra', 'factura', 'E420', '020', '2026-09-01', 'Almacen E4A Otra', 'e4a40000-0000-4000-8000-000000000002', 'PEN', true, 'received', '2026-09-01 08:00+00', '2026-09-02 08:00+00');
insert into public.purchase_order_items (
  id, purchase_order_id, organization_id, product_id, product_code,
  product_description, unit_of_measure, batch_control, quantity, unit_cost,
  product_type
) values
  ('e4a70000-0000-4000-8000-000000000201', 'e4a60000-0000-4000-8000-000000000201', 'e4a00000-0000-4000-8000-000000000002', 'e4a30000-0000-4000-8000-000000000005', 'E4A-OT', 'Producto E4A Otra Empresa', 'UND', false, 9, 8, 'good');

insert into public.purchase_receipts (
  id, organization_id, purchase_order_id, warehouse_id, operation_key,
  received_at, received_by
) values
  ('e4a80000-0000-4000-8000-000000000001', 'e4a00000-0000-4000-8000-000000000001', 'e4a60000-0000-4000-8000-000000000001', 'e4a40000-0000-4000-8000-000000000001', 'e4a81000-0000-4000-8000-000000000001', '2026-01-05 08:00+00', 'e4a10000-0000-4000-8000-000000000001'),
  ('e4a80000-0000-4000-8000-000000000002', 'e4a00000-0000-4000-8000-000000000001', 'e4a60000-0000-4000-8000-000000000002', 'e4a40000-0000-4000-8000-000000000001', 'e4a81000-0000-4000-8000-000000000002', '2026-02-05 08:00+00', 'e4a10000-0000-4000-8000-000000000001'),
  ('e4a80000-0000-4000-8000-000000000003', 'e4a00000-0000-4000-8000-000000000001', 'e4a60000-0000-4000-8000-000000000002', 'e4a40000-0000-4000-8000-000000000001', 'e4a81000-0000-4000-8000-000000000003', '2026-02-07 08:00+00', 'e4a10000-0000-4000-8000-000000000001'),
  ('e4a80000-0000-4000-8000-000000000004', 'e4a00000-0000-4000-8000-000000000001', 'e4a60000-0000-4000-8000-000000000003', 'e4a40000-0000-4000-8000-000000000001', 'e4a81000-0000-4000-8000-000000000004', '2026-03-10 08:00+00', 'e4a10000-0000-4000-8000-000000000001'),
  ('e4a80000-0000-4000-8000-000000000005', 'e4a00000-0000-4000-8000-000000000001', 'e4a60000-0000-4000-8000-000000000004', 'e4a40000-0000-4000-8000-000000000001', 'e4a81000-0000-4000-8000-000000000005', '2026-04-10 08:00+00', 'e4a10000-0000-4000-8000-000000000001'),
  ('e4a80000-0000-4000-8000-000000000006', 'e4a00000-0000-4000-8000-000000000001', 'e4a60000-0000-4000-8000-000000000006', 'e4a40000-0000-4000-8000-000000000001', 'e4a81000-0000-4000-8000-000000000006', '2026-06-02 08:00+00', 'e4a10000-0000-4000-8000-000000000001'),
  ('e4a80000-0000-4000-8000-000000000007', 'e4a00000-0000-4000-8000-000000000001', 'e4a60000-0000-4000-8000-000000000009', 'e4a40000-0000-4000-8000-000000000001', 'e4a81000-0000-4000-8000-000000000007', '2026-09-03 08:00+00', 'e4a10000-0000-4000-8000-000000000001'),
  ('e4a80000-0000-4000-8000-000000000008', 'e4a00000-0000-4000-8000-000000000001', 'e4a60000-0000-4000-8000-000000000101', 'e4a40000-0000-4000-8000-000000000001', 'e4a81000-0000-4000-8000-000000000008', '2026-09-03 08:00+00', 'e4a10000-0000-4000-8000-000000000001'),
  ('e4a80000-0000-4000-8000-000000000009', 'e4a00000-0000-4000-8000-000000000001', 'e4a60000-0000-4000-8000-000000000009', 'e4a40000-0000-4000-8000-000000000001', 'e4a81000-0000-4000-8000-000000000009', '2026-09-03 08:00+00', 'e4a10000-0000-4000-8000-000000000001'),
  ('e4a80000-0000-4000-8000-000000000010', 'e4a00000-0000-4000-8000-000000000002', 'e4a60000-0000-4000-8000-000000000201', 'e4a40000-0000-4000-8000-000000000002', 'e4a81000-0000-4000-8000-000000000010', '2026-09-02 08:00+00', 'e4a10000-0000-4000-8000-000000000004');

insert into public.purchase_receipt_items (
  id, organization_id, receipt_id, purchase_order_item_id, product_id,
  warehouse_id, location_id, quantity, unit_cost, fulfillment_mode
) values
  ('e4a90000-0000-4000-8000-000000000001', 'e4a00000-0000-4000-8000-000000000001', 'e4a80000-0000-4000-8000-000000000001', 'e4a70000-0000-4000-8000-000000000001', 'e4a30000-0000-4000-8000-000000000001', 'e4a40000-0000-4000-8000-000000000001', 'e4a50000-0000-4000-8000-000000000001', 10, 10, 'physical'),
  ('e4a90000-0000-4000-8000-000000000002', 'e4a00000-0000-4000-8000-000000000001', 'e4a80000-0000-4000-8000-000000000002', 'e4a70000-0000-4000-8000-000000000002', 'e4a30000-0000-4000-8000-000000000001', 'e4a40000-0000-4000-8000-000000000001', 'e4a50000-0000-4000-8000-000000000001', 3, 11, 'physical'),
  ('e4a90000-0000-4000-8000-000000000003', 'e4a00000-0000-4000-8000-000000000001', 'e4a80000-0000-4000-8000-000000000003', 'e4a70000-0000-4000-8000-000000000002', 'e4a30000-0000-4000-8000-000000000001', 'e4a40000-0000-4000-8000-000000000001', 'e4a50000-0000-4000-8000-000000000001', 3, 11, 'physical'),
  ('e4a90000-0000-4000-8000-000000000004', 'e4a00000-0000-4000-8000-000000000001', 'e4a80000-0000-4000-8000-000000000004', 'e4a70000-0000-4000-8000-000000000003', 'e4a30000-0000-4000-8000-000000000001', 'e4a40000-0000-4000-8000-000000000001', 'e4a50000-0000-4000-8000-000000000001', 8, 12, 'physical'),
  ('e4a90000-0000-4000-8000-000000000005', 'e4a00000-0000-4000-8000-000000000001', 'e4a80000-0000-4000-8000-000000000005', 'e4a70000-0000-4000-8000-000000000004', 'e4a30000-0000-4000-8000-000000000002', 'e4a40000-0000-4000-8000-000000000001', 'e4a50000-0000-4000-8000-000000000001', 5, 13, 'physical'),
  ('e4a90000-0000-4000-8000-000000000006', 'e4a00000-0000-4000-8000-000000000001', 'e4a80000-0000-4000-8000-000000000006', 'e4a70000-0000-4000-8000-000000000006', 'e4a30000-0000-4000-8000-000000000001', 'e4a40000-0000-4000-8000-000000000001', 'e4a50000-0000-4000-8000-000000000001', 6, 15, 'physical'),
  ('e4a90000-0000-4000-8000-000000000007', 'e4a00000-0000-4000-8000-000000000001', 'e4a80000-0000-4000-8000-000000000007', 'e4a70000-0000-4000-8000-000000000009', 'e4a30000-0000-4000-8000-000000000003', null, null, 2, 100, 'administrative'),
  ('e4a90000-0000-4000-8000-000000000008', 'e4a00000-0000-4000-8000-000000000001', 'e4a80000-0000-4000-8000-000000000008', 'e4a70000-0000-4000-8000-000000000101', 'e4a30000-0000-4000-8000-000000000004', 'e4a40000-0000-4000-8000-000000000001', 'e4a50000-0000-4000-8000-000000000001', 4, 7, 'physical'),
  ('e4a90000-0000-4000-8000-000000000009', 'e4a00000-0000-4000-8000-000000000002', 'e4a80000-0000-4000-8000-000000000010', 'e4a70000-0000-4000-8000-000000000201', 'e4a30000-0000-4000-8000-000000000005', 'e4a40000-0000-4000-8000-000000000002', 'e4a50000-0000-4000-8000-000000000002', 9, 8, 'physical');

-- Sobre-recepcion deliberada: la linea completa y el exceso deben quedar
-- observables, no transformarse silenciosamente en 100 %.
insert into public.purchase_receipts (
  id, organization_id, purchase_order_id, warehouse_id, operation_key,
  received_at, received_by
) values (
  'e4a80000-0000-4000-8000-000000000011', 'e4a00000-0000-4000-8000-000000000001',
  'e4a60000-0000-4000-8000-000000000006', 'e4a40000-0000-4000-8000-000000000001',
  'e4a81000-0000-4000-8000-000000000011', '2026-06-02 09:00+00',
  'e4a10000-0000-4000-8000-000000000001'
);
insert into public.purchase_receipt_items (
  id, organization_id, receipt_id, purchase_order_item_id, product_id,
  warehouse_id, location_id, quantity, unit_cost, fulfillment_mode
) values (
  'e4a90000-0000-4000-8000-000000000011', 'e4a00000-0000-4000-8000-000000000001',
  'e4a80000-0000-4000-8000-000000000011', 'e4a70000-0000-4000-8000-000000000006',
  'e4a30000-0000-4000-8000-000000000001', 'e4a40000-0000-4000-8000-000000000001',
  'e4a50000-0000-4000-8000-000000000001', 6, 15, 'physical'
);

insert into public.supplier_returns (
  id, organization_id, supplier_id, purchase_order_id, purchase_order_item_id,
  purchase_receipt_item_id, product_id, quantity, reason, status, requested_at,
  completed_at, responsible_name
) values
  ('e4aa0000-0000-4000-8000-000000000001', 'e4a00000-0000-4000-8000-000000000001', 'e4a20000-0000-4000-8000-000000000002', 'e4a60000-0000-4000-8000-000000000101', 'e4a70000-0000-4000-8000-000000000101', 'e4a90000-0000-4000-8000-000000000008', 'e4a30000-0000-4000-8000-000000000004', 1, 'Devolucion completada', 'completed', '2026-09-04', '2026-09-05 08:00+00', 'E4A Compras'),
  ('e4aa0000-0000-4000-8000-000000000002', 'e4a00000-0000-4000-8000-000000000002', 'e4a20000-0000-4000-8000-000000000003', 'e4a60000-0000-4000-8000-000000000201', 'e4a70000-0000-4000-8000-000000000201', 'e4a90000-0000-4000-8000-000000000009', 'e4a30000-0000-4000-8000-000000000005', 1, 'Devuelta registrada', 'registered', '2026-09-04', null, 'E4A Compras'),
  ('e4aa0000-0000-4000-8000-000000000003', 'e4a00000-0000-4000-8000-000000000002', 'e4a20000-0000-4000-8000-000000000003', 'e4a60000-0000-4000-8000-000000000201', 'e4a70000-0000-4000-8000-000000000201', 'e4a90000-0000-4000-8000-000000000009', 'e4a30000-0000-4000-8000-000000000005', 1, 'Devuelta cancelada', 'cancelled', '2026-09-04', null, 'E4A Compras');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4a10000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select total_orders, total_order_lines, received_orders,
           partially_received_orders, closed_partial_orders,
           complete_lines, incomplete_lines, over_received_lines,
           first_receipt_sample_size, complete_delivery_sample_size,
           orders_with_expected_delivery, on_time_orders, late_orders,
           on_time_percentage, sample_size
      from public.supplier_operational_performance_summary
     where organization_id = 'e4a00000-0000-4000-8000-000000000001'
       and supplier_id = 'e4a20000-0000-4000-8000-000000000001'$$,
  $$values (6, 6, 3, 1, 1, 3, 3, 1, 5, 3, 3, 2, 1, 66.67::numeric, 6)$$,
  'cuenta ordenes, lineas, estados, muestras y puntualidad del proveedor uno'
);
select is(
  (select quantity_dimensions from public.supplier_operational_performance_summary where supplier_id = 'e4a20000-0000-4000-8000-000000000001'),
  2,
  'conserva separadas UND y KG'
);
select is(
  (select total_ordered_quantity from public.supplier_operational_performance_summary where supplier_id = 'e4a20000-0000-4000-8000-000000000001'),
  null::numeric,
  'no suma cantidades de unidades incompatibles'
);
select is(
  (select fulfillment_percentage from public.supplier_operational_performance_summary where supplier_id = 'e4a20000-0000-4000-8000-000000000001'),
  null::numeric,
  'no fabrica cumplimiento global con unidades incompatibles'
);
select results_eq(
  $$select round(avg_days_to_first_receipt, 2), round(avg_days_to_last_receipt, 2), round(avg_days_to_complete, 2)
      from public.supplier_operational_performance_summary
     where supplier_id = 'e4a20000-0000-4000-8000-000000000001'$$,
  $$values (5.40::numeric, 5.81::numeric, 4.67::numeric)$$,
  'calcula primera recepcion, ultima recepcion y recepcion completa desde issued_at'
);
select results_eq(
  $$select received_quantity, complete_line, over_received_line, first_receipt_at, last_receipt_at
      from public.supplier_operational_performance_facts
     where purchase_order_item_id = 'e4a70000-0000-4000-8000-000000000006'$$,
  $$values (12.000::numeric, true, true, '2026-06-02 08:00+00'::timestamptz, '2026-06-02 09:00+00'::timestamptz)$$,
  'expone sobre-recepcion y conserva primera y ultima recepcion'
);
select results_eq(
  $$select total_orders, total_ordered_quantity, total_received_quantity,
           fulfillment_percentage, completed_returns_count,
           returned_product_count, returned_quantity, returned_quantity_unit,
           returned_quantity_percentage, quantity_unit, quantity_dimensions,
           sample_size
      from public.supplier_operational_performance_summary
     where supplier_id = 'e4a20000-0000-4000-8000-000000000002'$$,
  $$values (1, 4.000::numeric, 4.000::numeric, 100.00::numeric, 1, 1,
           1.000::numeric, 'UND', 25.00::numeric, 'UND', 1, 1)$$,
  'calcula cantidades y devoluciones completadas del segundo proveedor'
);
select is(
  (select count(*) from public.supplier_operational_performance_facts where product_type = 'service'),
  0::bigint,
  'excluye lineas de servicio administrativo'
);
select is(
  (select count(*) from public.supplier_operational_performance_facts where purchase_order_id in ('e4a60000-0000-4000-8000-000000000007', 'e4a60000-0000-4000-8000-000000000008')),
  0::bigint,
  'excluye draft y cancelled'
);
select is(
  (select count(*) from public.supplier_operational_performance_summary where organization_id = 'e4a00000-0000-4000-8000-000000000001'),
  2::bigint,
  'separa multiples proveedores de la misma organizacion'
);
select results_eq(
  $$select total_orders, first_receipt_sample_size, complete_delivery_sample_size,
           orders_with_expected_delivery, on_time_orders, late_orders
      from public.get_supplier_operational_performance_summary(
        'e4a00000-0000-4000-8000-000000000001',
        'e4a20000-0000-4000-8000-000000000001',
        '2026-04-01 00:00+00',
        '2026-07-01 00:00+00'
      )$$,
  $$values (3, 2, 2, 2, 1, 1)$$,
  'filtra el periodo por issued_at y conserva el alcance operativo'
);
select throws_ok(
  $$select public.get_supplier_operational_performance_summary(
    'e4a00000-0000-4000-8000-000000000001', null,
    '2026-08-01 00:00+00', '2026-07-01 00:00+00'
  )$$,
  '22023',
  'E4A_PERFORMANCE_PERIOD_INVALID',
  'rechaza periodos invertidos'
);
select is(
  (select count(*) from public.supplier_operational_performance_summary where organization_id = 'e4a00000-0000-4000-8000-000000000002'),
  0::bigint,
  'RLS aisla la otra organizacion'
);
select throws_ok(
  $$select public.get_supplier_operational_performance_summary(
    'e4a00000-0000-4000-8000-000000000002', null, null, null
  )$$,
  '42501',
  'E4A_SUPPLIER_PERFORMANCE_FORBIDDEN',
  'la funcion no permite solicitar otra organizacion'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4a10000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.get_supplier_operational_performance_summary(
    'e4a00000-0000-4000-8000-000000000001',
    'e4a20000-0000-4000-8000-000000000001', null, null
  )$$,
  '42501',
  'E4A_SUPPLIER_PERFORMANCE_FORBIDDEN',
  'ALMACEN sin SUPPLIERS_VIEW no accede a desempeño por proveedor'
);
select is(
  (select count(*) from public.supplier_operational_performance_summary),
  0::bigint,
  'RLS bloquea el resumen a un usuario sin SUPPLIERS_VIEW'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4a10000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.get_supplier_operational_performance_summary(
    'e4a00000-0000-4000-8000-000000000001', null, null, null
  )$$,
  '42501',
  'E4A_SUPPLIER_PERFORMANCE_FORBIDDEN',
  'un usuario sin PURCHASES_VIEW no accede a desempeño'
);

select * from finish();
rollback;
