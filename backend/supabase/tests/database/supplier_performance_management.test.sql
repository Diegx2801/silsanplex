begin;

select plan(25);

select has_table('public', 'supplier_evaluations', 'existe el historial de evaluaciones');
select has_table('public', 'supplier_incidents', 'existe la gestión de incidencias');
select has_table('public', 'supplier_returns', 'existe la gestión de devoluciones');
select has_view('public', 'supplier_supplied_products', 'existe el abastecimiento real por producto');
select has_view('public', 'supplier_performance_summary', 'existe el resumen operativo del proveedor');
select has_function('public', 'record_supplier_evaluation', array['jsonb'], 'existe el registro seguro de evaluaciones');
select has_function('public', 'complete_supplier_return', array['uuid', 'uuid'], 'existe la devolución transaccional a inventario');
select is(has_table_privilege('anon', 'public.supplier_incidents', 'SELECT'), false, 'anon no consulta incidencias');
select is(has_function_privilege('anon', 'public.complete_supplier_return(uuid, uuid)', 'EXECUTE'), false, 'anon no completa devoluciones');
select ok((select relrowsecurity from pg_class where oid = 'public.supplier_returns'::regclass), 'devoluciones tiene RLS');

insert into public.organizations (id, name, slug)
values ('91000000-0000-4000-8000-000000000001', 'Calidad proveedores', 'calidad-proveedores');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  '92000000-0000-4000-8000-000000000001',
  'calidad.proveedores@test.local',
  '{"full_name":"Responsable de Calidad"}', now(), now()
);
insert into public.organization_memberships (organization_id, user_id)
values ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'ADMIN');

insert into public.suppliers (
  id, organization_id, document_type, document_number, business_name, created_by, updated_by
) values (
  '93000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
  'ruc', '20555555551', 'Proveedor medible SAC',
  '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure, batch_control,
  expiration_control, created_by, updated_by
) values (
  '94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
  'CAL-001', 'Producto evaluado', 'UND', false, false,
  '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'
);
insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values (
  '95000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
  'PRIN', 'Principal', '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values (
  '96000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001', 'GENERAL', 'General',
  '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'
);
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, expected_delivery_date,
  warehouse, status, issued_at, received_at, received_by, created_by, updated_by
) values (
  '97000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001', '20555555551', 'Proveedor medible SAC',
  'factura', 'F001', '9001', '2026-08-01', '2026-08-05', 'Principal', 'received',
  '2026-08-01 09:00:00+00', '2026-08-07 15:00:00+00',
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'
);
insert into public.purchase_order_items (
  id, purchase_order_id, organization_id, product_id, product_code,
  product_description, unit_of_measure, batch_control, quantity, unit_cost
) values (
  '98000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
  'CAL-001', 'Producto evaluado', 'UND', false, 10, 7.5
);
insert into public.inventory_movements (
  organization_id, product_id, product_code, product_description, unit_of_measure,
  movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
  unit_cost, operation_date, reason, source_type, source_id, created_by
) values (
  '91000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
  'CAL-001', 'Producto evaluado', 'UND', 'entrada', 10, 'Principal',
  '95000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001',
  'available', 7.5, '2026-08-07', 'Recepción de prueba', 'purchase-receipt',
  '98000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.record_supplier_evaluation('{
    "organization_id":"91000000-0000-4000-8000-000000000001",
    "supplier_id":"93000000-0000-4000-8000-000000000001",
    "evaluated_at":"2026-08-08","quality_rating":5,"delivery_rating":3,
    "service_rating":4,"price_rating":4,"comments":"Evaluación mensual"
  }'::jsonb)
$$, 'registra una evaluación fechada');
select is((select overall_rating from public.supplier_evaluations), 4.00::numeric, 'calcula la evaluación global');
select is((select responsible_name from public.supplier_evaluations), 'Responsable de Calidad', 'conserva el responsable');

select lives_ok($$
  select public.save_supplier_incident('{
    "organization_id":"91000000-0000-4000-8000-000000000001",
    "supplier_id":"93000000-0000-4000-8000-000000000001",
    "purchase_order_id":"97000000-0000-4000-8000-000000000001",
    "product_id":"94000000-0000-4000-8000-000000000001",
    "incident_type":"late-delivery","severity":"high","status":"open",
    "occurred_at":"2026-08-07","description":"Entrega recibida después de la fecha comprometida"
  }'::jsonb)
$$, 'registra una incidencia vinculada a la compra');
select is((select open_incident_count from public.supplier_performance_summary), 1, 'el resumen refleja incidencias abiertas');

select lives_ok($$
  select public.register_supplier_return('{
    "organization_id":"91000000-0000-4000-8000-000000000001",
    "supplier_id":"93000000-0000-4000-8000-000000000001",
    "purchase_order_id":"97000000-0000-4000-8000-000000000001",
    "purchase_order_item_id":"98000000-0000-4000-8000-000000000001",
    "quantity":"2","reason":"Empaque dañado al recibir","requested_at":"2026-08-08"
  }'::jsonb)
$$, 'registra una devolución válida');

set local role postgres;
insert into public.inventory_reservations (
  id, organization_id, product_id, warehouse_id, location_id, stock_status,
  quantity, quantity_consumed, status, source_type, source_id, created_by, updated_by
) values (
  '99000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001', 'available', 9, 0, 'active',
  'test-supplier-return', '99000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);

select throws_ok($$
  select public.complete_supplier_return(
    '91000000-0000-4000-8000-000000000001', (select id from public.supplier_returns limit 1)
  )
$$, 'P0001', 'INVENTORY_RESERVED_STOCK', 'la devolución no consume stock reservado');
select is(
  (select count(*)::integer from public.inventory_movements where source_type = 'supplier-return'),
  0,
  'la devolución bloqueada no deja movimientos parciales'
);

set local role postgres;
update public.inventory_reservations
set status = 'released', updated_at = now()
where id = '99000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);
select lives_ok($$
  select public.complete_supplier_return(
    '91000000-0000-4000-8000-000000000001', (select id from public.supplier_returns limit 1)
  )
$$, 'completa la devolución descontando inventario');
select is((select status from public.supplier_returns), 'completed', 'la devolución queda completada');
select is((select count(*)::integer from public.inventory_movements where source_type = 'supplier-return'), 1, 'crea un movimiento trazable');
select is((
  select sum(case when movement_type in ('entrada','ajuste-positivo') then quantity else -quantity end)
  from public.inventory_movements where product_id = '94000000-0000-4000-8000-000000000001'
), 8.000::numeric, 'el saldo descuenta la devolución');
select results_eq(
  $$select purchase_count, supplied_quantity, latest_unit_cost from public.supplier_supplied_products$$,
  $$values (1, 10.000::numeric, 7.5000::numeric)$$,
  'los productos suministrados se derivan de recepciones reales'
);
select results_eq(
  $$select measured_deliveries, late_deliveries, on_time_percentage, latest_evaluation from public.supplier_performance_summary$$,
  $$values (1, 1, 0.0::numeric, 4.00::numeric)$$,
  'el resumen combina puntualidad y evaluación histórica'
);
select throws_ok($$
  select public.complete_supplier_return(
    '91000000-0000-4000-8000-000000000001', (select id from public.supplier_returns limit 1)
  )
$$, 'P0001', 'SUPPLIER_RETURN_NOT_COMPLETABLE', 'una devolución no se completa dos veces');

select * from finish();
rollback;
