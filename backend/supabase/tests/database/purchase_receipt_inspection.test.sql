begin;

select plan(53);

select has_table(
  'public',
  'purchase_receipt_inspections',
  'existe la entidad de inspeccion de recepcion'
);
select has_table(
  'public',
  'purchase_receipt_inspection_reasons',
  'existen motivos estructurados de inspeccion'
);
select has_view(
  'public',
  'purchase_receipt_inspection_details',
  'existe la lectura detallada de inspecciones'
);
select has_function(
  'public',
  'receive_purchase_order_partial_inspected',
  array['jsonb'],
  'existe la recepcion con inspeccion'
);
select has_function(
  'public',
  'correct_purchase_receipt_inspection',
  array['uuid', 'uuid', 'jsonb'],
  'existe la correccion auditada'
);
select has_column(
  'public',
  'purchase_receipt_inspections',
  'accepted_quantity',
  'la inspeccion conserva la cantidad aceptada'
);
select has_column(
  'public',
  'purchase_receipt_inspections',
  'rejected_quantity',
  'la inspeccion conserva la cantidad rechazada'
);
select has_column(
  'public',
  'purchase_receipt_inspection_reasons',
  'reason_code',
  'los motivos tienen codigo estructurado'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.purchase_receipt_inspections'::regclass),
  'las inspecciones tienen RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.purchase_receipt_inspection_reasons'::regclass),
  'los motivos tienen RLS'
);
select is(
  has_table_privilege('authenticated', 'public.purchase_receipt_inspections', 'INSERT'),
  false,
  'las inspecciones solo se crean mediante el RPC transaccional'
);
select is(
  has_function_privilege(
    'anon',
    'public.receive_purchase_order_partial_inspected(jsonb)',
    'EXECUTE'
  ),
  false,
  'anon no puede ejecutar la recepcion inspeccionada'
);

insert into public.organizations (id, name, slug)
values
  ('c4c00000-0000-4000-8000-000000000001', 'E4C Uno', 'e4c-uno'),
  ('c4c00000-0000-4000-8000-000000000002', 'E4C Dos', 'e4c-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('c4c10000-0000-4000-8000-000000000001', 'e4c.operador@test.local', '{"full_name":"Operador E4C"}', now(), now()),
  ('c4c10000-0000-4000-8000-000000000002', 'e4c.otra@test.local', '{"full_name":"Otra organizacion"}', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('c4c00000-0000-4000-8000-000000000001', 'c4c10000-0000-4000-8000-000000000001'),
  ('c4c00000-0000-4000-8000-000000000002', 'c4c10000-0000-4000-8000-000000000002');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('c4c00000-0000-4000-8000-000000000001', 'c4c10000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('c4c00000-0000-4000-8000-000000000001', 'c4c10000-0000-4000-8000-000000000001', 'ALMACEN'),
  ('c4c00000-0000-4000-8000-000000000001', 'c4c10000-0000-4000-8000-000000000001', 'GERENCIA');

insert into public.suppliers (
  id, organization_id, document_type, document_number, business_name,
  created_by, updated_by
)
values (
  'c4c20000-0000-4000-8000-000000000001',
  'c4c00000-0000-4000-8000-000000000001',
  'ruc',
  '20999999991',
  'Proveedor E4C',
  'c4c10000-0000-4000-8000-000000000001',
  'c4c10000-0000-4000-8000-000000000001'
);

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
)
values (
  'c4c30000-0000-4000-8000-000000000001',
  'c4c00000-0000-4000-8000-000000000001',
  'E4C-ALM',
  'Almacen E4C',
  'c4c10000-0000-4000-8000-000000000001',
  'c4c10000-0000-4000-8000-000000000001'
);

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values (
  'c4c40000-0000-4000-8000-000000000001',
  'c4c00000-0000-4000-8000-000000000001',
  'c4c30000-0000-4000-8000-000000000001',
  'GENERAL',
  'General E4C',
  'c4c10000-0000-4000-8000-000000000001',
  'c4c10000-0000-4000-8000-000000000001'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control, created_by, updated_by
)
values
  (
    'c4c50000-0000-4000-8000-000000000001',
    'c4c00000-0000-4000-8000-000000000001',
    'E4C-GOOD',
    'Bien E4C',
    'UND',
    'good',
    'gravado',
    true,
    true,
    'c4c10000-0000-4000-8000-000000000001',
    'c4c10000-0000-4000-8000-000000000001'
  ),
  (
    'c4c50000-0000-4000-8000-000000000002',
    'c4c00000-0000-4000-8000-000000000001',
    'E4C-SERVICE',
    'Servicio E4C',
    'UND',
    'service',
    'inafecto',
    false,
    false,
    'c4c10000-0000-4000-8000-000000000001',
    'c4c10000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4c10000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$
    select public.save_purchase_order(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'supplier_id', 'c4c20000-0000-4000-8000-000000000001',
      'document_type', 'factura',
      'series', 'E4C',
      'document_number', '001',
      'issue_date', current_date,
      'warehouse_id', 'c4c30000-0000-4000-8000-000000000001',
      'warehouse', 'Almacen E4C',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', 'c4c50000-0000-4000-8000-000000000001',
        'quantity', 10,
        'unit_cost', 12.50,
        'lot', 'ORD-LOTE-1',
        'expiration_date', '2027-12-31'
      ))
    ))
  $$,
  'crea la orden de prueba para rechazo parcial'
);
select lives_ok(
  $$
    select public.issue_purchase_order(
      'c4c00000-0000-4000-8000-000000000001',
      (select id from public.purchase_orders where document_number = '001')
    )
  $$,
  'emite la orden de prueba'
);

select throws_ok(
  $$
    select public.receive_purchase_order_partial_inspected(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
      'operation_key', 'c4c60000-0000-4000-8000-000000000001',
      'items', jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001')),
        'quantity', 10,
        'fulfillment_mode', 'physical',
        'location_id', 'c4c40000-0000-4000-8000-000000000001',
        'lot', 'LOTE-E4C-INVALIDO',
        'expiration_date', '2027-12-31',
        'inspection', jsonb_build_object(
          'inspected_quantity', 10,
          'accepted_quantity', 9,
          'rejected_quantity', 1,
          'findings', jsonb_build_array(jsonb_build_object(
            'reason_code', 'other',
            'quantity', 1
          ))
        )
      ))
    ))
  $$,
  '22023',
  'PURCHASE_RECEIPT_INSPECTION_REASON_INVALID',
  'exige texto para el motivo other'
);
select throws_ok(
  $$
    select public.receive_purchase_order_partial_inspected(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
      'operation_key', 'c4c60000-0000-4000-8000-000000000002',
      'items', jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001')),
        'quantity', 10,
        'fulfillment_mode', 'physical',
        'location_id', 'c4c40000-0000-4000-8000-000000000001',
        'lot', 'LOTE-E4C-INVALIDO',
        'expiration_date', '2027-12-31',
        'inspection', jsonb_build_object(
          'inspected_quantity', 10,
          'accepted_quantity', 9,
          'rejected_quantity', 0,
          'findings', '[]'::jsonb
        )
      ))
    ))
  $$,
  '22023',
  'PURCHASE_RECEIPT_INSPECTION_QUANTITY_INVALID',
  'exige conservar inspeccionada como aceptada mas rechazada'
);

select lives_ok(
  $$
    select public.receive_purchase_order_partial_inspected(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
      'operation_key', 'c4c60000-0000-4000-8000-000000000003',
      'items', jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001')),
        'quantity', 10,
        'fulfillment_mode', 'physical',
        'location_id', 'c4c40000-0000-4000-8000-000000000001',
        'lot', 'LOTE-E4C-1',
        'expiration_date', '2027-12-31',
        'inspection', jsonb_build_object(
          'inspected_quantity', 10,
          'accepted_quantity', 7,
          'rejected_quantity', 3,
          'observation', 'Se separaron tres unidades para rechazo en recepcion',
          'findings', jsonb_build_array(
            jsonb_build_object('reason_code', 'quality', 'quantity', 2),
            jsonb_build_object('reason_code', 'other', 'reason_text', 'Envase deteriorado', 'quantity', 1)
          )
        )
      ))
    ))
  $$,
  'registra una recepcion con rechazo parcial'
);
select is(
  (select quantity from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001'))),
  10.000::numeric,
  'purchase_receipt_items conserva la cantidad fisica recibida'
);
select is(
  (select count(*) from public.purchase_receipt_inspections where purchase_receipt_id = (select id from public.purchase_receipts where purchase_order_id = (select id from public.purchase_orders where document_number = '001'))),
  1::bigint,
  'crea una inspeccion para la linea de recepcion'
);
select results_eq(
  $$
    select inspected_quantity, accepted_quantity, rejected_quantity
    from public.purchase_receipt_inspections
    where purchase_order_id = (select id from public.purchase_orders where document_number = '001')
  $$,
  $$ values (10.000::numeric, 7.000::numeric, 3.000::numeric) $$,
  'conserva las cantidades inspeccionada aceptada y rechazada'
);
select results_eq(
  $$
    select reason_code, quantity, reason_text
    from public.purchase_receipt_inspection_reasons
    where inspection_id = (select id from public.purchase_receipt_inspections where purchase_order_id = (select id from public.purchase_orders where document_number = '001'))
    order by reason_code
  $$,
  $$ values
    ('other'::text, 1.000::numeric, 'Envase deteriorado'::text),
    ('quality'::text, 2.000::numeric, null::text)
  $$,
  'persiste mas de un motivo estructurado'
);
select results_eq(
  $$
    select lot, expiration_date, inspected_quantity, accepted_quantity, rejected_quantity
    from public.purchase_receipt_inspection_details
    where purchase_order_id = (select id from public.purchase_orders where document_number = '001')
  $$,
  $$ values ('LOTE-E4C-1'::text, '2027-12-31'::date, 10.000::numeric, 7.000::numeric, 3.000::numeric) $$,
  'el detalle conserva lote y vencimiento del receipt item'
);
select is(
  (select sum(quantity) from public.inventory_movements where source_id = (select id from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001'))) and source_type = 'purchase-receipt'),
  7.000::numeric,
  'solo la cantidad aceptada entra al ledger de inventario'
);
select is(
  (select count(*) from public.inventory_movements where source_id = (select id from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001'))) and source_type = 'purchase-receipt' and stock_status = 'available'),
  1::bigint,
  'la aceptacion crea un unico movimiento disponible'
);
select is(
  (select count(*) from public.supplier_returns where purchase_order_id = (select id from public.purchase_orders where document_number = '001')),
  0::bigint,
  'un rechazo de recepcion no crea una devolucion posterior'
);
set local role postgres;
select is(
  (select count(*) from public.audit_events where action = 'PURCHASE_RECEIPT_INSPECTION_COMPLETED' and entity_type = 'purchase_receipt_inspection'),
  1::bigint,
  'la inspeccion completada queda auditada por separado'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4c10000-0000-4000-8000-000000000001', true);
select is(
  (select status from public.purchase_orders where document_number = '001'),
  'received',
  'la recepcion fisica completa conserva la semantica del estado de la orden'
);

set local role postgres;
select throws_ok(
  $$
    update public.purchase_receipt_inspections
    set accepted_quantity = 6
    where purchase_order_id = (select id from public.purchase_orders where document_number = '001')
  $$,
  '55000',
  'PURCHASE_RECEIPT_INSPECTION_IMMUTABLE',
  'una inspeccion completada no se edita libremente'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4c10000-0000-4000-8000-000000000001', true);

select is(
  public.receive_purchase_order_partial_inspected(jsonb_build_object(
    'organization_id', 'c4c00000-0000-4000-8000-000000000001',
    'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
    'operation_key', 'c4c60000-0000-4000-8000-000000000003',
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001')),
      'quantity', 10,
      'fulfillment_mode', 'physical',
      'location_id', 'c4c40000-0000-4000-8000-000000000001',
      'lot', 'LOTE-E4C-1',
      'expiration_date', '2027-12-31',
      'inspection', jsonb_build_object(
        'inspected_quantity', 10,
        'accepted_quantity', 7,
        'rejected_quantity', 3,
        'observation', 'Se separaron tres unidades para rechazo en recepcion',
        'findings', jsonb_build_array(
          jsonb_build_object('reason_code', 'quality', 'quantity', 2),
          jsonb_build_object('reason_code', 'other', 'reason_text', 'Envase deteriorado', 'quantity', 1)
        )
      )
    ))
  )),
  (select id from public.purchase_receipts where purchase_order_id = (select id from public.purchase_orders where document_number = '001')),
  'reintentar la misma operacion devuelve la recepcion original'
);
select throws_ok(
  $$
    select public.receive_purchase_order_partial_inspected(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
      'operation_key', 'c4c60000-0000-4000-8000-000000000003',
      'items', jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001')),
        'quantity', 10,
        'fulfillment_mode', 'physical',
        'location_id', 'c4c40000-0000-4000-8000-000000000001',
        'lot', 'LOTE-E4C-1',
        'expiration_date', '2027-12-31',
        'inspection', jsonb_build_object(
          'inspected_quantity', 10,
          'accepted_quantity', 6,
          'rejected_quantity', 4,
          'findings', jsonb_build_array(jsonb_build_object('reason_code', 'quality', 'quantity', 4))
        )
      ))
    ))
  $$,
  'P0001',
  'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT',
  'reutilizar la clave con otro payload falla'
);
select lives_ok(
  $$
    select public.correct_purchase_receipt_inspection(
      'c4c00000-0000-4000-8000-000000000001',
      (select id from public.purchase_receipt_inspections where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and status = 'completed'),
      jsonb_build_object(
        'operation_key', 'c4c60000-0000-4000-8000-000000000004',
        'observation', 'Correccion auditada del motivo',
        'findings', jsonb_build_array(jsonb_build_object(
          'reason_code', 'other',
          'reason_text', 'Correccion de inspeccion',
          'quantity', 3
        ))
      )
    )
  $$,
  'corrige motivos sin alterar cantidades ni inventario'
);
select is(
  (select count(*) from public.purchase_receipt_inspections where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and status = 'voided'),
  1::bigint,
  'la inspeccion anterior queda anulada'
);
select is(
  (select count(*) from public.purchase_receipt_inspections where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and status = 'completed'),
  1::bigint,
  'la correccion deja una sola inspeccion activa'
);
set local role postgres;
select is(
  (select count(*) from public.audit_events where action = 'PURCHASE_RECEIPT_INSPECTION_CORRECTED' and entity_type = 'purchase_receipt_inspection'),
  1::bigint,
  'la correccion queda auditada'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4c10000-0000-4000-8000-000000000001', true);
select is(
  (select sum(quantity) from public.inventory_movements where source_id = (select id from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '001'))) and source_type = 'purchase-receipt'),
  7.000::numeric,
  'corregir la inspeccion no duplica ni descuenta inventario'
);
select is(
  public.correct_purchase_receipt_inspection(
    'c4c00000-0000-4000-8000-000000000001',
    (select id from public.purchase_receipt_inspections where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and status = 'completed'),
    jsonb_build_object(
      'operation_key', 'c4c60000-0000-4000-8000-000000000004',
      'observation', 'Correccion auditada del motivo',
      'findings', jsonb_build_array(jsonb_build_object(
        'reason_code', 'other',
        'reason_text', 'Correccion de inspeccion',
        'quantity', 3
      ))
    )
  ),
  (select id from public.purchase_receipt_inspections where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and status = 'completed'),
  'reintentar la correccion con el mismo payload es idempotente'
);
select throws_ok(
  $$
    select public.correct_purchase_receipt_inspection(
      'c4c00000-0000-4000-8000-000000000001',
      (select id from public.purchase_receipt_inspections where purchase_order_id = (select id from public.purchase_orders where document_number = '001') and status = 'voided'),
      jsonb_build_object(
        'operation_key', 'c4c60000-0000-4000-8000-000000000004',
        'observation', 'Payload diferente',
        'findings', jsonb_build_array(jsonb_build_object(
          'reason_code', 'other',
          'reason_text', 'Correccion de inspeccion',
          'quantity', 3
        ))
      )
    )
  $$,
  'P0001',
  'PURCHASE_RECEIPT_INSPECTION_IDEMPOTENCY_CONFLICT',
  'reutilizar la clave de correccion con otro payload falla'
);

select lives_ok(
  $$
    select public.save_purchase_order(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'supplier_id', 'c4c20000-0000-4000-8000-000000000001',
      'document_type', 'factura',
      'series', 'E4C',
      'document_number', '002',
      'issue_date', current_date,
      'warehouse_id', 'c4c30000-0000-4000-8000-000000000001',
      'warehouse', 'Almacen E4C',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', 'c4c50000-0000-4000-8000-000000000001',
        'quantity', 4,
        'unit_cost', 12.50,
        'lot', 'ORD-LOTE-2',
        'expiration_date', '2027-12-31'
      ))
    ))
  $$,
  'crea la orden para rechazo total'
);
select lives_ok(
  $$
    select public.issue_purchase_order(
      'c4c00000-0000-4000-8000-000000000001',
      (select id from public.purchase_orders where document_number = '002')
    )
  $$,
  'emite la orden para rechazo total'
);
select lives_ok(
  $$
    select public.receive_purchase_order_partial_inspected(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = '002'),
      'operation_key', 'c4c60000-0000-4000-8000-000000000005',
      'items', jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '002')),
        'quantity', 4,
        'fulfillment_mode', 'physical',
        'location_id', 'c4c40000-0000-4000-8000-000000000001',
        'lot', 'LOTE-E4C-2',
        'expiration_date', '2027-12-31',
        'inspection', jsonb_build_object(
          'inspected_quantity', 4,
          'accepted_quantity', 0,
          'rejected_quantity', 4,
          'findings', jsonb_build_array(jsonb_build_object(
            'reason_code', 'documentation',
            'quantity', 4
          ))
        )
      ))
    ))
  $$,
  'registra rechazo total sin aceptar stock'
);
select is(
  (select count(*) from public.inventory_movements where source_id = (select id from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '002'))) and source_type = 'purchase-receipt'),
  0::bigint,
  'el rechazo total no crea movimiento de inventario'
);
select throws_ok(
  $$
    select public.register_supplier_return(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'supplier_id', 'c4c20000-0000-4000-8000-000000000001',
      'purchase_receipt_item_id', (select id from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '002'))),
      'quantity', 1,
      'reason', 'No corresponde una devolucion posterior'
    ))
  $$,
  '22023',
  'SUPPLIER_RETURN_NO_ACCEPTED_QUANTITY',
  'un rechazo total no se convierte en devolucion'
);

select lives_ok(
  $$
    select public.save_purchase_order(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'supplier_id', 'c4c20000-0000-4000-8000-000000000001',
      'document_type', 'factura',
      'series', 'E4C',
      'document_number', '003',
      'issue_date', current_date,
      'warehouse_id', 'c4c30000-0000-4000-8000-000000000001',
      'warehouse', 'Almacen E4C',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', 'c4c50000-0000-4000-8000-000000000002',
        'quantity', 1,
        'unit_cost', 100,
        'lot', '',
        'expiration_date', ''
      ))
    ))
  $$,
  'crea una orden de servicio'
);
select lives_ok(
  $$
    select public.issue_purchase_order(
      'c4c00000-0000-4000-8000-000000000001',
      (select id from public.purchase_orders where document_number = '003')
    )
  $$,
  'emite la orden de servicio'
);
select lives_ok(
  $$
    select public.receive_purchase_order_partial_inspected(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = '003'),
      'operation_key', 'c4c60000-0000-4000-8000-000000000006',
      'items', jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '003')),
        'quantity', 1,
        'fulfillment_mode', 'administrative'
      ))
    ))
  $$,
  'recibe un servicio sin inspeccion fisica'
);
select is(
  (select count(*) from public.purchase_receipt_inspections where purchase_order_id = (select id from public.purchase_orders where document_number = '003')),
  0::bigint,
  'los servicios no crean inspecciones fisicas'
);
select is(
  (select count(*) from public.inventory_movements where source_id in (select id from public.purchase_receipt_items where receipt_id = (select id from public.purchase_receipts where purchase_order_id = (select id from public.purchase_orders where document_number = '003')))),
  0::bigint,
  'los servicios no crean movimientos de inventario'
);

select lives_ok(
  $$
    select public.save_purchase_order(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'supplier_id', 'c4c20000-0000-4000-8000-000000000001',
      'document_type', 'factura',
      'series', 'E4C',
      'document_number', '004',
      'issue_date', current_date,
      'warehouse_id', 'c4c30000-0000-4000-8000-000000000001',
      'warehouse', 'Almacen E4C',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', 'c4c50000-0000-4000-8000-000000000001',
        'quantity', 1,
        'unit_cost', 12.50,
        'lot', 'ORD-LOTE-HIST',
        'expiration_date', '2027-12-31'
      ))
    ))
  $$,
  'crea una orden historica compatible'
);
select lives_ok(
  $$
    select public.issue_purchase_order(
      'c4c00000-0000-4000-8000-000000000001',
      (select id from public.purchase_orders where document_number = '004')
    )
  $$,
  'emite la orden historica compatible'
);
select lives_ok(
  $$
    select public.receive_purchase_order_partial(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = '004'),
      'operation_key', 'c4c60000-0000-4000-8000-000000000007',
      'items', jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = '004')),
        'quantity', 1,
        'fulfillment_mode', 'physical',
        'location_id', 'c4c40000-0000-4000-8000-000000000001',
        'lot', 'LOTE-HIST',
        'expiration_date', '2027-12-31'
      ))
    ))
  $$,
  'la recepcion legacy sigue funcionando sin fabricar inspeccion'
);
select is(
  (select count(*) from public.purchase_receipt_inspections where purchase_order_id = (select id from public.purchase_orders where document_number = '004')),
  0::bigint,
  'las recepciones historicas sin inspeccion quedan distinguibles'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4c10000-0000-4000-8000-000000000002', true);
select is(
  (select count(*) from public.purchase_receipt_inspection_details where organization_id = 'c4c00000-0000-4000-8000-000000000001'),
  0::bigint,
  'otra organizacion no puede leer inspecciones ajenas'
);
set local role postgres;
select throws_ok(
  $$
    select public.receive_purchase_order_partial_inspected(jsonb_build_object(
      'organization_id', 'c4c00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = '001'),
      'operation_key', 'c4c60000-0000-4000-8000-000000000008',
      'items', '[]'::jsonb
    ))
  $$,
  '42501',
  'PURCHASE_RECEIPT_FORBIDDEN',
  'otra organizacion no puede ejecutar la recepcion'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4c10000-0000-4000-8000-000000000002', true);

select * from finish();
rollback;
