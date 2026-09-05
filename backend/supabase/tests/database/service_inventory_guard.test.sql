begin;

select plan(21);

insert into public.organizations (id, name, slug)
values (
  'c1000000-0000-4000-8000-000000000001',
  'Servicios sin stock',
  'servicios-sin-stock'
);

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'c2000000-0000-4000-8000-000000000001',
  'service-inventory@test.local',
  '{"full_name":"Operador de inventario"}',
  now(), now()
);
insert into public.organization_memberships (organization_id, user_id)
values ('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'ALMACEN');
insert into public.user_roles (organization_id, user_id, role_code)
values ('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'VENTAS');
insert into public.customers (
  id, organization_id, document_type, document_number, legal_name,
  created_by, updated_by
) values (
  'cc000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001', 'RUC', '20999999991',
  'Cliente de servicios',
  'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  batch_control, expiration_control
) values
  (
    'c3000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'GOOD-001', 'Producto fisico de prueba', 'UND', 'good', false, false
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000001',
    'SERV-001', 'Servicio sin stock', 'UND', 'service', false, false
  );

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values
  (
    'c4000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001', 'CENTRAL', 'Central',
    'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'
  ),
  (
    'c4000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000001', 'NORTE', 'Norte',
    'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'
  );
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values
  (
    'c5000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'A-01', 'Anaquel central',
    'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'
  ),
  (
    'c5000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000002', 'B-01', 'Anaquel norte',
    'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.record_inventory_movement(jsonb_build_object(
    'organization_id', 'c1000000-0000-4000-8000-000000000001',
    'product_id', 'c3000000-0000-4000-8000-000000000001',
    'warehouse_id', 'c4000000-0000-4000-8000-000000000001',
    'location_id', 'c5000000-0000-4000-8000-000000000001',
    'movement_type', 'entrada', 'quantity', 10, 'unit_cost', 5,
    'stock_status', 'available', 'operation_date', current_date,
    'reason', 'Entrada fisica'
  ))
$$, 'un producto fisico sigue entrando a inventario');

select is(
  (select count(*) from public.inventory_movements
   where organization_id = 'c1000000-0000-4000-8000-000000000001'),
  1::bigint,
  'la entrada fisica crea un movimiento'
);

select lives_ok($$
  select public.create_order(jsonb_build_object(
    'organization_id', 'c1000000-0000-4000-8000-000000000001',
    'operation_key', 'cd000000-0000-4000-8000-000000000001',
    'customer_id', 'cc000000-0000-4000-8000-000000000001',
    'warehouse_id', 'c4000000-0000-4000-8000-000000000001',
    'order_date', current_date,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', 'c3000000-0000-4000-8000-000000000002',
      'quantity', 1, 'unit_price', 100
    ))
  ))
$$, 'un servicio puede utilizarse en un pedido comercial');
select is(
  (select count(*) from public.inventory_reservations
   where organization_id = 'c1000000-0000-4000-8000-000000000001'
     and source_type = 'order-item'),
  0::bigint,
  'un pedido de servicio no crea reservas'
);

select throws_ok($$
  select public.record_inventory_movement(jsonb_build_object(
    'organization_id', 'c1000000-0000-4000-8000-000000000001',
    'product_id', 'c3000000-0000-4000-8000-000000000002',
    'warehouse_id', 'c4000000-0000-4000-8000-000000000001',
    'location_id', 'c5000000-0000-4000-8000-000000000001',
    'movement_type', 'entrada', 'quantity', 1, 'unit_cost', 100,
    'stock_status', 'available', 'operation_date', current_date,
    'reason', 'Entrada de servicio'
  ))
$$, 'P0001', 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN',
  'un servicio no puede crear una entrada manual');

select throws_ok($$
  select public.record_inventory_movement(jsonb_build_object(
    'organization_id', 'c1000000-0000-4000-8000-000000000001',
    'product_id', 'c3000000-0000-4000-8000-000000000002',
    'warehouse_id', 'c4000000-0000-4000-8000-000000000001',
    'location_id', 'c5000000-0000-4000-8000-000000000001',
    'movement_type', 'ajuste-positivo', 'quantity', 1, 'unit_cost', 100,
    'stock_status', 'available', 'operation_date', current_date,
    'reason', 'Ajuste de servicio'
  ))
$$, 'P0001', 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN',
  'un servicio no puede ajustarse como stock');

select throws_ok($$
  select public.transfer_inventory(jsonb_build_object(
    'organization_id', 'c1000000-0000-4000-8000-000000000001',
    'reference', 'TR-SERVICE',
    'source_warehouse_id', 'c4000000-0000-4000-8000-000000000001',
    'destination_warehouse_id', 'c4000000-0000-4000-8000-000000000002',
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', 'c3000000-0000-4000-8000-000000000002',
      'source_location_id', 'c5000000-0000-4000-8000-000000000001',
      'destination_location_id', 'c5000000-0000-4000-8000-000000000002',
      'quantity', 1, 'stock_status', 'available'
    ))
  ))
$$, 'P0001', 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN',
  'un servicio no puede transferirse');

select throws_ok($$
  select public.reclassify_inventory(jsonb_build_object(
    'organization_id', 'c1000000-0000-4000-8000-000000000001',
    'product_id', 'c3000000-0000-4000-8000-000000000002',
    'warehouse_id', 'c4000000-0000-4000-8000-000000000001',
    'location_id', 'c5000000-0000-4000-8000-000000000001',
    'source_status', 'available', 'destination_status', 'damaged',
    'quantity', 1, 'reason', 'Reclasificacion de servicio'
  ))
$$, 'P0001', 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN',
  'un servicio no puede reclasificarse como stock');

select throws_ok($$
  select public.plan_inventory_fefo(
    'c1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000001', 1, null
  )
$$, 'P0001', 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN',
  'un servicio no entra en FEFO');

select throws_ok($$
  select public.record_inventory_fefo_outbound(jsonb_build_object(
    'organization_id', 'c1000000-0000-4000-8000-000000000001',
    'product_id', 'c3000000-0000-4000-8000-000000000002',
    'warehouse_id', 'c4000000-0000-4000-8000-000000000001',
    'quantity', 1, 'reason', 'Salida FEFO de servicio'
  ))
$$, 'P0001', 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN',
  'un servicio no puede salir por FEFO');

select throws_ok($$
  select public.transfer_inventory_fefo(jsonb_build_object(
    'organization_id', 'c1000000-0000-4000-8000-000000000001',
    'product_id', 'c3000000-0000-4000-8000-000000000002',
    'source_warehouse_id', 'c4000000-0000-4000-8000-000000000001',
    'destination_warehouse_id', 'c4000000-0000-4000-8000-000000000002',
    'destination_location_id', 'c5000000-0000-4000-8000-000000000002',
    'quantity', 1, 'reference', 'TR-FEFO-SERVICE'
  ))
$$, 'P0001', 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN',
  'un servicio no puede transferirse por FEFO');

select is(
  (select count(*) from public.inventory_movements
   where organization_id = 'c1000000-0000-4000-8000-000000000001'),
  1::bigint,
  'las operaciones de servicio no generan movimientos'
);

select is(
  (select count(*) from public.inventory_kardex
   where organization_id = 'c1000000-0000-4000-8000-000000000001'
     and product_id = 'c3000000-0000-4000-8000-000000000002'),
  0::bigint,
  'un servicio no aparece en Kardex'
);
select is(
  (select count(*) from public.inventory_bucket_balances
   where organization_id = 'c1000000-0000-4000-8000-000000000001'
     and product_id = 'c3000000-0000-4000-8000-000000000002'),
  0::bigint,
  'un servicio no aparece en saldos de inventario'
);

reset role;

select throws_ok($$
  insert into public.inventory_reservations (
    organization_id, product_id, warehouse_id, location_id, stock_status,
    quantity, source_type, source_id
  ) values (
    'c1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000001',
    'available', 1, 'test-service', 'c6000000-0000-4000-8000-000000000001'
  )
$$, 'P0001', 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN',
  'un servicio no puede reservarse');

select throws_ok($$
  insert into public.lotes (
    organization_id, producto_id, numero_lote, fecha_vencimiento
  ) values (
    'c1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002', 'SERV-LOTE', current_date + 30
  )
$$, 'P0001', 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN',
  'un servicio no puede generar lotes o vencimientos');

insert into public.suppliers (id, organization_id, document_type, document_number, business_name)
values (
  'c7000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001', 'ruc', '20123456789', 'Proveedor de prueba'
);
insert into public.purchase_orders (
  id, organization_id, supplier_id, supplier_document, supplier_name,
  document_type, series, document_number, issue_date, warehouse, warehouse_id,
  status
) values (
  'c8000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c7000000-0000-4000-8000-000000000001', '20123456789', 'Proveedor de prueba',
  'otro', 'OC', 'SERV-001', current_date, 'Central',
  'c4000000-0000-4000-8000-000000000001', 'draft'
);
insert into public.purchase_order_items (
  id, purchase_order_id, organization_id, product_id, product_code,
  product_description, batch_control, quantity, unit_cost
) values (
  'c9000000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000002', 'SERV-001', 'Servicio sin stock',
  false, 1, 100
);
insert into public.purchase_receipts (
  id, organization_id, purchase_order_id, warehouse_id, operation_key
) values (
  'ca000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'cb000000-0000-4000-8000-000000000001'
);

select throws_ok($$
  insert into public.purchase_receipt_items (
    organization_id, receipt_id, purchase_order_item_id, product_id,
    warehouse_id, location_id, quantity, unit_cost
  ) values (
    'c1000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000001',
    'c9000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000001', 1, 100
  )
$$, 'P0001', 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN',
  'un servicio no puede recibirse como mercaderia');

select throws_ok($$
  select public.transfer_inventory(jsonb_build_object(
    'organization_id', 'c1000000-0000-4000-8000-000000000001',
    'reference', 'TR-MIXED-SERVICE',
    'source_warehouse_id', 'c4000000-0000-4000-8000-000000000001',
    'destination_warehouse_id', 'c4000000-0000-4000-8000-000000000002',
    'items', jsonb_build_array(
      jsonb_build_object(
        'product_id', 'c3000000-0000-4000-8000-000000000001',
        'source_location_id', 'c5000000-0000-4000-8000-000000000001',
        'destination_location_id', 'c5000000-0000-4000-8000-000000000002',
        'quantity', 1, 'stock_status', 'available'
      ),
      jsonb_build_object(
        'product_id', 'c3000000-0000-4000-8000-000000000002',
        'source_location_id', 'c5000000-0000-4000-8000-000000000001',
        'destination_location_id', 'c5000000-0000-4000-8000-000000000002',
        'quantity', 1, 'stock_status', 'available'
      )
    )
  ))
$$, 'P0001', 'INVENTORY_SERVICE_PRODUCT_FORBIDDEN',
  'una operacion mixta rechaza el servicio');

select is(
  (select count(*) from public.inventory_movements
   where organization_id = 'c1000000-0000-4000-8000-000000000001'),
  1::bigint,
  'una operacion mixta hace rollback completo y no deja movimientos fisicos'
);
select is(
  (select count(*) from public.warehouse_transfers
   where organization_id = 'c1000000-0000-4000-8000-000000000001'),
  0::bigint,
  'una operacion mixta hace rollback completo del encabezado de transferencia'
);

select ok(
  position('requested_product_type' in pg_get_functiondef('public.assert_product_is_stockable(uuid, uuid)'::regprocedure)) > 0
    and position('requested_product_type <> ''good''' in pg_get_functiondef('public.assert_product_is_stockable(uuid, uuid)'::regprocedure)) > 0,
  'la regla identifica servicios por product_type'
);

rollback;
