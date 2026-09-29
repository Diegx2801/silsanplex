begin;

select plan(56);

select has_function(
  'public',
  'receive_purchase_order_partial_inspected',
  array['jsonb'],
  'la recepcion inspeccionada esta disponible para la integracion transversal'
);
select has_view(
  'public',
  'supplier_operational_performance_summary',
  'E4A expone el resumen operativo transversal'
);
select has_function(
  'public',
  'get_product_supplier_comparison',
  array['uuid', 'uuid', 'timestamptz', 'timestamptz'],
  'E4B expone la comparacion producto proveedor transversal'
);
select has_view(
  'public',
  'supplier_purchase_price_summary',
  'E2 expone el resumen historico de precios'
);
select has_view(
  'public',
  'inventory_bucket_balances',
  'inventario expone el balance por bucket y lote'
);

set local role postgres;

insert into public.organizations (id, name, slug)
values
  ('e4f00000-0000-4000-8000-000000000001', 'E4C transversal', 'e4f-transversal'),
  ('e4f00000-0000-4000-8000-000000000002', 'E4C transversal otra', 'e4f-transversal-otra');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('e4f10000-0000-4000-8000-000000000001', 'e4f.operador@test.local', '{"full_name":"Operador transversal"}', now(), now()),
  ('e4f10000-0000-4000-8000-000000000002', 'e4f.otra@test.local', '{"full_name":"Otra organizacion"}', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('e4f00000-0000-4000-8000-000000000001', 'e4f10000-0000-4000-8000-000000000001'),
  ('e4f00000-0000-4000-8000-000000000002', 'e4f10000-0000-4000-8000-000000000002');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('e4f00000-0000-4000-8000-000000000001', 'e4f10000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('e4f00000-0000-4000-8000-000000000001', 'e4f10000-0000-4000-8000-000000000001', 'ALMACEN'),
  ('e4f00000-0000-4000-8000-000000000002', 'e4f10000-0000-4000-8000-000000000002', 'COMPRAS');

insert into public.suppliers (
  id, organization_id, document_type, document_number, business_name,
  created_by, updated_by
)
values (
  'e4f20000-0000-4000-8000-000000000001',
  'e4f00000-0000-4000-8000-000000000001',
  'ruc', '20999999991', 'Proveedor transversal',
  'e4f10000-0000-4000-8000-000000000001',
  'e4f10000-0000-4000-8000-000000000001'
);

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
)
values (
  'e4f30000-0000-4000-8000-000000000001',
  'e4f00000-0000-4000-8000-000000000001',
  'E4F-ALM', 'Almacen transversal',
  'e4f10000-0000-4000-8000-000000000001',
  'e4f10000-0000-4000-8000-000000000001'
);

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
)
values (
  'e4f40000-0000-4000-8000-000000000001',
  'e4f00000-0000-4000-8000-000000000001',
  'e4f30000-0000-4000-8000-000000000001',
  'GENERAL', 'General transversal',
  'e4f10000-0000-4000-8000-000000000001',
  'e4f10000-0000-4000-8000-000000000001'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control, created_by, updated_by
)
values (
  'e4f50000-0000-4000-8000-000000000001',
  'e4f00000-0000-4000-8000-000000000001',
  'E4F-GOOD', 'Producto transversal', 'UND', 'good',
  'gravado', true, true,
  'e4f10000-0000-4000-8000-000000000001',
  'e4f10000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4f10000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"e4f10000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$
    select public.save_purchase_order(jsonb_build_object(
      'organization_id', 'e4f00000-0000-4000-8000-000000000001',
      'supplier_id', 'e4f20000-0000-4000-8000-000000000001',
      'document_type', 'factura',
      'series', 'E4F',
      'document_number', 'BASE-001',
      'issue_date', current_date,
      'warehouse_id', 'e4f30000-0000-4000-8000-000000000001',
      'warehouse', 'Almacen transversal',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', 'e4f50000-0000-4000-8000-000000000001',
        'quantity', 100,
        'unit_cost', 10,
        'lot', 'E4F-BASE-LOT',
        'expiration_date', '2027-12-31'
      ))
    ))
  $$,
  'crea la orden base de 100 unidades'
);
select lives_ok(
  $$
    select public.issue_purchase_order(
      'e4f00000-0000-4000-8000-000000000001',
      (select id from public.purchase_orders where document_number = 'BASE-001')
    )
  $$,
  'emite la orden base'
);
select lives_ok(
  $$
    select public.receive_purchase_order_partial_inspected(jsonb_build_object(
      'organization_id', 'e4f00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = 'BASE-001'),
      'operation_key', 'e4f60000-0000-4000-8000-000000000001',
      'items', jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001')),
        'quantity', 100,
        'fulfillment_mode', 'physical',
        'location_id', 'e4f40000-0000-4000-8000-000000000001',
        'lot', 'E4F-BASE-LOT',
        'expiration_date', '2027-12-31',
        'inspection', jsonb_build_object(
          'inspected_quantity', 100,
          'accepted_quantity', 90,
          'rejected_quantity', 10,
          'observation', 'Prueba transversal de recepcion inspeccionada',
          'findings', jsonb_build_array(jsonb_build_object(
            'reason_code', 'quality',
            'quantity', 10
          ))
        )
      ))
    ))
  $$,
  'registra 100 unidades fisicas con 90 aceptadas y 10 rechazadas'
);
select is(
  (select quantity from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001'))),
  100.000::numeric,
  'la recepcion fisica base conserva 100 unidades'
);
select results_eq(
  $$
    select inspected_quantity, accepted_quantity, rejected_quantity
    from public.purchase_receipt_inspections
    where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001')
  $$,
  $$values (100.000::numeric, 90.000::numeric, 10.000::numeric)$$,
  'la inspeccion base conserva 100/90/10'
);
select results_eq(
  $$
    select lot, expiration_date
    from public.purchase_receipt_inspection_details
    where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001')
  $$,
  $$values ('E4F-BASE-LOT'::text, '2027-12-31'::date)$$,
  'la inspeccion base conserva lote y vencimiento'
);
select is(
  (select sum(quantity) from public.inventory_movements where source_type = 'purchase-receipt' and source_id = (select id from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001')))),
  90.000::numeric,
  'inventario recibe unicamente la cantidad aceptada base'
);
select is(
  (select count(*) from public.inventory_movements where source_type = 'purchase-receipt' and source_id = (select id from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001')))),
  1::bigint,
  'la recepcion base crea un solo movimiento de entrada'
);
select is(
  (select count(*) from public.inventory_movements where source_type = 'purchase-receipt' and source_id = (select id from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001'))) and quantity = 100),
  0::bigint,
  'inventario no registra las 100 unidades fisicas como stock aceptado'
);
select is(
  (select count(*) from public.supplier_returns where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001')),
  0::bigint,
  'el rechazo en recepcion no crea una devolucion posterior'
);
select is(
  (select status from public.purchase_orders where document_number = 'BASE-001'),
  'received',
  'la orden completa fisicamente queda received aunque solo 90 entren a inventario'
);
select results_eq(
  $$
    select total_orders, total_order_lines, total_ordered_quantity,
           total_received_quantity, fulfillment_percentage, received_orders,
           partially_received_orders, closed_partial_orders,
           first_receipt_sample_size, sample_size
    from public.get_supplier_operational_performance_summary(
      'e4f00000-0000-4000-8000-000000000001',
      'e4f20000-0000-4000-8000-000000000001', null, null
    )
  $$,
  $$values (1, 1, 100.000::numeric, 100.000::numeric, 100.00::numeric, 1, 0, 0, 1, 1)$$,
  'E4A conserva la cantidad fisica base y no usa 90 aceptadas'
);
select results_eq(
  $$
    select comparison_status, currency, unit_of_measure, total_orders,
           ordered_quantity, received_quantity, fulfillment_percentage,
           closed_partial_orders, operational_receipt_count, sample_size
    from public.get_product_supplier_comparison(
      'e4f00000-0000-4000-8000-000000000001',
      'e4f50000-0000-4000-8000-000000000001', null, null
    )
    where supplier_id = 'e4f20000-0000-4000-8000-000000000001'
      and currency = 'PEN'
      and unit_of_measure = (select unit_of_measure from public.products where id = 'e4f50000-0000-4000-8000-000000000001')
  $$,
  $$values ('comparable'::text, 'PEN'::text, 'Unidad'::text, 1, 100.000::numeric, 100.000::numeric, 100.00::numeric, 0, 1, 1)$$,
  'E4B conserva la cantidad fisica base y no usa 90 aceptadas'
);
select results_eq(
  $$
    select received_quantity, receipt_count, weighted_average_unit_cost
    from public.supplier_purchase_price_summary
    where organization_id = 'e4f00000-0000-4000-8000-000000000001'
      and supplier_id = 'e4f20000-0000-4000-8000-000000000001'
      and product_id = 'e4f50000-0000-4000-8000-000000000001'
      and currency = 'PEN'
      and unit_of_measure = (select unit_of_measure from public.products where id = 'e4f50000-0000-4000-8000-000000000001')
  $$,
  $$values (100.000::numeric, 1, 10.0000::numeric)$$,
  'E2 conserva el evento fisico y el costo unitario original'
);
select is(
  (select physical_quantity from public.inventory_bucket_balances where organization_id = 'e4f00000-0000-4000-8000-000000000001' and product_id = 'e4f50000-0000-4000-8000-000000000001' and lot = 'E4F-BASE-LOT'),
  90.000::numeric,
  'el bucket base queda con 90 unidades disponibles'
);

select lives_ok(
  $$
    select public.save_purchase_order(jsonb_build_object(
      'organization_id', 'e4f00000-0000-4000-8000-000000000001',
      'supplier_id', 'e4f20000-0000-4000-8000-000000000001',
      'document_type', 'factura',
      'series', 'E4F',
      'document_number', 'PARTIAL-001',
      'issue_date', current_date,
      'warehouse_id', 'e4f30000-0000-4000-8000-000000000001',
      'warehouse', 'Almacen transversal',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', 'e4f50000-0000-4000-8000-000000000001',
        'quantity', 100,
        'unit_cost', 10,
        'lot', 'E4F-PARTIAL-ORDER',
        'expiration_date', '2028-01-31'
      ))
    ))
  $$,
  'crea la orden de multiples recepciones'
);
select lives_ok(
  $$
    select public.issue_purchase_order(
      'e4f00000-0000-4000-8000-000000000001',
      (select id from public.purchase_orders where document_number = 'PARTIAL-001')
    )
  $$,
  'emite la orden de multiples recepciones'
);
select lives_ok(
  $$
    select public.receive_purchase_order_partial_inspected(jsonb_build_object(
      'organization_id', 'e4f00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = 'PARTIAL-001'),
      'operation_key', 'e4f60000-0000-4000-8000-000000000002',
      'items', jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'PARTIAL-001')),
        'quantity', 40,
        'fulfillment_mode', 'physical',
        'location_id', 'e4f40000-0000-4000-8000-000000000001',
        'lot', 'E4F-PARTIAL-LOT-A',
        'expiration_date', '2028-01-31',
        'inspection', jsonb_build_object(
          'inspected_quantity', 40,
          'accepted_quantity', 35,
          'rejected_quantity', 5,
          'findings', jsonb_build_array(jsonb_build_object('reason_code', 'quality', 'quantity', 5))
        )
      ))
    ))
  $$,
  'registra la primera recepcion parcial 40/35/5'
);
select lives_ok(
  $$
    select public.receive_purchase_order_partial_inspected(jsonb_build_object(
      'organization_id', 'e4f00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = 'PARTIAL-001'),
      'operation_key', 'e4f60000-0000-4000-8000-000000000003',
      'items', jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'PARTIAL-001')),
        'quantity', 30,
        'fulfillment_mode', 'physical',
        'location_id', 'e4f40000-0000-4000-8000-000000000001',
        'lot', 'E4F-PARTIAL-LOT-B',
        'expiration_date', '2028-02-28',
        'inspection', jsonb_build_object(
          'inspected_quantity', 30,
          'accepted_quantity', 30,
          'rejected_quantity', 0,
          'findings', '[]'::jsonb
        )
      ))
    ))
  $$,
  'registra la segunda recepcion parcial 30/30/0'
);
select is(
  (select sum(quantity) from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'PARTIAL-001'))),
  70.000::numeric,
  'las multiples recepciones conservan 70 unidades fisicas'
);
select results_eq(
  $$
    select sum(inspected_quantity), sum(accepted_quantity), sum(rejected_quantity)
    from public.purchase_receipt_inspections
    where purchase_order_id = (select id from public.purchase_orders where document_number = 'PARTIAL-001')
  $$,
  $$values (70.000::numeric, 65.000::numeric, 5.000::numeric)$$,
  'las multiples inspecciones conservan 70/65/5'
);
select is(
  (select sum(quantity) from public.inventory_movements where source_type = 'purchase-receipt' and source_id in (select receipt_item.id from public.purchase_receipt_items receipt_item where receipt_item.purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'PARTIAL-001')))),
  65.000::numeric,
  'inventario de multiples recepciones suma solo 65 aceptadas'
);
select results_eq(
  $$
    select lot, physical_quantity
    from public.inventory_bucket_balances
    where organization_id = 'e4f00000-0000-4000-8000-000000000001'
      and product_id = 'e4f50000-0000-4000-8000-000000000001'
      and lot in ('E4F-PARTIAL-LOT-A', 'E4F-PARTIAL-LOT-B')
    order by lot
  $$,
  $$values ('E4F-PARTIAL-LOT-A'::text, 35.000::numeric), ('E4F-PARTIAL-LOT-B'::text, 30.000::numeric)$$,
  'cada aceptado llega al bucket de su lote'
);
select is(
  (select status from public.purchase_orders where document_number = 'PARTIAL-001'),
  'partially_received',
  'la orden con 70 fisicas permanece parcialmente recibida'
);
select lives_ok(
  $$
    select public.close_purchase_order(jsonb_build_object(
      'organization_id', 'e4f00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = 'PARTIAL-001'),
      'reason', 'Saldo parcial cerrado'
    ))
  $$,
  'cierra la orden parcial sin recepcion ficticia'
);
select is(
  (select status from public.purchase_orders where document_number = 'PARTIAL-001'),
  'closed_partial',
  'closed_partial permanece diferenciado'
);
select is(
  (select count(*) from public.purchase_receipts where purchase_order_id = (select id from public.purchase_orders where document_number = 'PARTIAL-001')),
  2::bigint,
  'closed_partial no crea una recepcion adicional'
);
select results_eq(
  $$
    select ordered_quantity, received_quantity, complete_line
    from public.supplier_operational_performance_facts
    where purchase_order_id = (select id from public.purchase_orders where document_number = 'PARTIAL-001')
  $$,
  $$values (100.000::numeric, 70.000::numeric, false)$$,
  'E4A conserva 100 ordenadas y 70 fisicas en closed_partial'
);
select results_eq(
  $$
    select total_orders, ordered_quantity, received_quantity,
           partially_received_orders, closed_partial_orders,
           operational_receipt_count
    from public.get_product_supplier_comparison(
      'e4f00000-0000-4000-8000-000000000001',
      'e4f50000-0000-4000-8000-000000000001', null, null
    )
    where supplier_id = 'e4f20000-0000-4000-8000-000000000001'
      and currency = 'PEN'
      and unit_of_measure = (select unit_of_measure from public.products where id = 'e4f50000-0000-4000-8000-000000000001')
  $$,
  $$values (2, 200.000::numeric, 170.000::numeric, 0, 1, 3)$$,
  'E4B diferencia closed_partial y conserva 170 fisicas'
);

select lives_ok(
  $$
    select public.save_purchase_order(jsonb_build_object(
      'organization_id', 'e4f00000-0000-4000-8000-000000000001',
      'supplier_id', 'e4f20000-0000-4000-8000-000000000001',
      'document_type', 'factura',
      'series', 'E4F',
      'document_number', 'LEGACY-001',
      'issue_date', current_date,
      'warehouse_id', 'e4f30000-0000-4000-8000-000000000001',
      'warehouse', 'Almacen transversal',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', 'e4f50000-0000-4000-8000-000000000001',
        'quantity', 10,
        'unit_cost', 10,
        'lot', 'E4F-LEGACY-LOT',
        'expiration_date', '2028-03-31'
      ))
    ))
  $$,
  'crea la orden historica compatible'
);
select lives_ok(
  $$
    select public.issue_purchase_order(
      'e4f00000-0000-4000-8000-000000000001',
      (select id from public.purchase_orders where document_number = 'LEGACY-001')
    )
  $$,
  'emite la orden historica compatible'
);
select lives_ok(
  $$
    select public.receive_purchase_order_partial(jsonb_build_object(
      'organization_id', 'e4f00000-0000-4000-8000-000000000001',
      'purchase_order_id', (select id from public.purchase_orders where document_number = 'LEGACY-001'),
      'operation_key', 'e4f60000-0000-4000-8000-000000000004',
      'items', jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id', (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'LEGACY-001')),
        'quantity', 10,
        'fulfillment_mode', 'physical',
        'location_id', 'e4f40000-0000-4000-8000-000000000001',
        'lot', 'E4F-LEGACY-LOT',
        'expiration_date', '2028-03-31'
      ))
    ))
  $$,
  'mantiene la recepcion historica sin inspeccion'
);
select is(
  (select count(*) from public.purchase_receipt_inspections where purchase_order_id = (select id from public.purchase_orders where document_number = 'LEGACY-001')),
  0::bigint,
  'la recepcion historica no fabrica accepted ni rejected'
);
select is(
  (select quantity from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'LEGACY-001'))),
  10.000::numeric,
  'la recepcion historica conserva su cantidad fisica'
);
select is(
  (select sum(quantity) from public.inventory_movements where source_type = 'purchase-receipt' and source_id = (select id from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'LEGACY-001')))),
  10.000::numeric,
  'la recepcion historica conserva su entrada de inventario'
);
select results_eq(
  $$
    select received_quantity
    from public.supplier_operational_performance_facts
    where purchase_order_id = (select id from public.purchase_orders where document_number = 'LEGACY-001')
  $$,
  $$values (10.000::numeric)$$,
  'E4A lee la cantidad fisica de la recepcion historica'
);

select lives_ok(
  $$
    select public.register_supplier_return(jsonb_build_object(
      'organization_id', 'e4f00000-0000-4000-8000-000000000001',
      'supplier_id', 'e4f20000-0000-4000-8000-000000000001',
      'purchase_receipt_item_id', (select id from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001'))),
      'quantity', 30,
      'reason', 'Devolucion posterior de aceptado'
    ))
  $$,
  'registra la devolucion posterior sobre aceptado'
);
select is(
  (select sum(quantity) from public.supplier_returns where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001') and status <> 'cancelled'),
  30.000::numeric,
  'la devolucion posterior registra 30 unidades'
);
select throws_ok(
  $$
    select public.register_supplier_return(jsonb_build_object(
      'organization_id', 'e4f00000-0000-4000-8000-000000000001',
      'supplier_id', 'e4f20000-0000-4000-8000-000000000001',
      'purchase_receipt_item_id', (select id from public.purchase_receipt_items where purchase_order_item_id = (select id from public.purchase_order_items where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001'))),
      'quantity', 61,
      'reason', 'Intento de devolver rechazo'
    ))
  $$,
  '22023',
  'SUPPLIER_RETURN_QUANTITY_INVALID',
  'la cantidad rechazada no aumenta el limite devolvible de 90 aceptadas'
);
select lives_ok(
  $$
    select public.complete_supplier_return(
      'e4f00000-0000-4000-8000-000000000001',
      (select id from public.supplier_returns where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001'))
    )
  $$,
  'la devolucion posterior genera la salida solo al completarse'
);
select is(
  (select status from public.supplier_returns where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001')),
  'completed',
  'la devolucion posterior queda completed'
);
select is(
  (select sum(quantity) from public.inventory_movements where source_type = 'supplier-return' and source_id = (select id from public.supplier_returns where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001'))),
  30.000::numeric,
  'la salida posterior corresponde solo a la devolucion aceptada'
);
select is(
  (select physical_quantity from public.inventory_bucket_balances where organization_id = 'e4f00000-0000-4000-8000-000000000001' and product_id = 'e4f50000-0000-4000-8000-000000000001' and lot = 'E4F-BASE-LOT'),
  60.000::numeric,
  'la devolucion reduce el bucket aceptado sin tocar el rechazo'
);
select is(
  (select count(*) from public.supplier_returns where purchase_order_id = (select id from public.purchase_orders where document_number = 'BASE-001')),
  1::bigint,
  'la recepcion inspeccionada no genero una devolucion automatica adicional'
);
select results_eq(
  $$
    select total_orders, total_ordered_quantity, total_received_quantity,
           received_orders, partially_received_orders, closed_partial_orders,
           first_receipt_sample_size, completed_returns_count, returned_quantity
    from public.get_supplier_operational_performance_summary(
      'e4f00000-0000-4000-8000-000000000001',
      'e4f20000-0000-4000-8000-000000000001', null, null
    )
  $$,
  $$values (3, 210.000::numeric, 180.000::numeric, 2, 0, 1, 3, 1, 30.000::numeric)$$,
  'E4A mantiene 180 fisicas y reporta la devolucion aparte'
);
select results_eq(
  $$
    select total_orders, ordered_quantity, received_quantity,
           received_orders, partially_received_orders, closed_partial_orders,
           operational_receipt_count, completed_returns_count, returned_quantity,
           sample_size
    from public.get_product_supplier_comparison(
      'e4f00000-0000-4000-8000-000000000001',
      'e4f50000-0000-4000-8000-000000000001', null, null
    )
    where supplier_id = 'e4f20000-0000-4000-8000-000000000001'
      and currency = 'PEN'
      and unit_of_measure = (select unit_of_measure from public.products where id = 'e4f50000-0000-4000-8000-000000000001')
  $$,
  $$values (3, 210.000::numeric, 180.000::numeric, 2, 0, 1, 4, 1, 30.000::numeric, 3)$$,
  'E4B mantiene 180 fisicas y no convierte la devolucion en rechazo'
);
select results_eq(
  $$
    select received_quantity, receipt_count, weighted_average_unit_cost
    from public.supplier_purchase_price_summary
    where organization_id = 'e4f00000-0000-4000-8000-000000000001'
      and supplier_id = 'e4f20000-0000-4000-8000-000000000001'
      and product_id = 'e4f50000-0000-4000-8000-000000000001'
      and currency = 'PEN'
      and unit_of_measure = (select unit_of_measure from public.products where id = 'e4f50000-0000-4000-8000-000000000001')
  $$,
  $$values (180.000::numeric, 4, 10.0000::numeric)$$,
  'E2 conserva las cuatro recepciones fisicas y el precio historico'
);
select is(
  (select physical_quantity from public.inventory_product_stock_summary where organization_id = 'e4f00000-0000-4000-8000-000000000001' and product_id = 'e4f50000-0000-4000-8000-000000000001'),
  135.000::numeric,
  'el stock fisico total es aceptado historico menos la devolucion'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4f10000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"e4f10000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*) from public.supplier_operational_performance_summary where organization_id = 'e4f00000-0000-4000-8000-000000000001'),
  0::bigint,
  'la lectura E4A no cruza organizaciones'
);
select throws_ok(
  $$select public.get_supplier_operational_performance_summary(
    'e4f00000-0000-4000-8000-000000000001',
    'e4f20000-0000-4000-8000-000000000001', null, null
  )$$,
  '42501',
  'E4A_SUPPLIER_PERFORMANCE_FORBIDDEN',
  'E4A bloquea la organizacion ajena'
);
select throws_ok(
  $$select public.get_product_supplier_comparison(
    'e4f00000-0000-4000-8000-000000000001',
    'e4f50000-0000-4000-8000-000000000001', null, null
  )$$,
  '42501',
  'E4B_PRODUCT_SUPPLIER_COMPARISON_FORBIDDEN',
  'E4B bloquea la organizacion ajena'
);

select * from finish();
rollback;
