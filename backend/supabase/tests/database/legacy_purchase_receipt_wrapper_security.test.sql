begin;

select plan(27);

select has_function(
  'public', 'receive_purchase_order', array['uuid', 'uuid'],
  'existe el wrapper legado de recepcion'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.receive_purchase_order(uuid, uuid)'::regprocedure),
  true,
  'el wrapper conserva SECURITY DEFINER'
);
select is(
  (select proconfig from pg_proc where oid = 'public.receive_purchase_order(uuid, uuid)'::regprocedure),
  array['search_path=""']::text[],
  'el wrapper conserva search_path vacio'
);
select is(
  has_function_privilege('anon', 'public.receive_purchase_order(uuid, uuid)', 'EXECUTE'),
  false,
  'anon no puede ejecutar el wrapper'
);
select is(
  has_function_privilege('authenticated', 'public.receive_purchase_order(uuid, uuid)', 'EXECUTE'),
  true,
  'authenticated puede alcanzar el guard del wrapper'
);
select ok(
  position(
    'has_organization_permission' in
    pg_get_functiondef('public.receive_purchase_order(uuid, uuid)'::regprocedure)
  ) < position(
    'from public.purchase_orders' in
    pg_get_functiondef('public.receive_purchase_order(uuid, uuid)'::regprocedure)
  ),
  'la autorizacion ocurre antes del lookup de la orden'
);
select ok(
  position(
    'receive_purchase_order_partial' in
    pg_get_functiondef('public.receive_purchase_order(uuid, uuid)'::regprocedure)
  ) > 0,
  'el wrapper sigue delegando al RPC principal'
);

insert into public.organizations (id, name, slug) values
  ('b0000000-0000-4000-8000-000000000001', 'B0 Organizacion uno', 'b0-organizacion-uno'),
  ('b0000000-0000-4000-8000-000000000002', 'B0 Organizacion dos', 'b0-organizacion-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('b0100000-0000-4000-8000-000000000001', 'b0.compras.uno@test.local', '{"full_name":"B0 Compras uno"}', now(), now()),
  ('b0100000-0000-4000-8000-000000000002', 'b0.gerencia.uno@test.local', '{"full_name":"B0 Gerencia uno"}', now(), now()),
  ('b0100000-0000-4000-8000-000000000003', 'b0.compras.dos@test.local', '{"full_name":"B0 Compras dos"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('b0000000-0000-4000-8000-000000000001', 'b0100000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001', 'b0100000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000002', 'b0100000-0000-4000-8000-000000000003');

insert into public.user_roles (organization_id, user_id, role_code) values
  ('b0000000-0000-4000-8000-000000000001', 'b0100000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('b0000000-0000-4000-8000-000000000001', 'b0100000-0000-4000-8000-000000000002', 'GERENCIA'),
  ('b0000000-0000-4000-8000-000000000002', 'b0100000-0000-4000-8000-000000000003', 'COMPRAS');

insert into public.suppliers (
  id, organization_id, document_type, document_number, business_name,
  created_by, updated_by
) values
  (
    'b0200000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001', 'ruc', '20123456781',
    'Proveedor B0 Uno', 'b0100000-0000-4000-8000-000000000001',
    'b0100000-0000-4000-8000-000000000001'
  ),
  (
    'b0200000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000002', 'ruc', '20123456782',
    'Proveedor B0 Dos', 'b0100000-0000-4000-8000-000000000003',
    'b0100000-0000-4000-8000-000000000003'
  );

insert into public.warehouses (
  id, organization_id, code, name, created_by, updated_by
) values
  (
    'b0300000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001', 'B0-A1', 'Almacen B0 Uno',
    'b0100000-0000-4000-8000-000000000001',
    'b0100000-0000-4000-8000-000000000001'
  ),
  (
    'b0300000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000002', 'B0-A2', 'Almacen B0 Dos',
    'b0100000-0000-4000-8000-000000000003',
    'b0100000-0000-4000-8000-000000000003'
  );

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values
  (
    'b0400000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'b0300000-0000-4000-8000-000000000001', 'GENERAL', 'General B0 Uno',
    'b0100000-0000-4000-8000-000000000001',
    'b0100000-0000-4000-8000-000000000001'
  ),
  (
    'b0400000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000002',
    'b0300000-0000-4000-8000-000000000002', 'GENERAL', 'General B0 Dos',
    'b0100000-0000-4000-8000-000000000003',
    'b0100000-0000-4000-8000-000000000003'
  );

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control, created_by, updated_by
) values
  (
    'b0500000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001', 'B0-GOOD', 'Bien B0', 'UND',
    'good', 'gravado', false, false,
    'b0100000-0000-4000-8000-000000000001',
    'b0100000-0000-4000-8000-000000000001'
  ),
  (
    'b0500000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000001', 'B0-SERVICE', 'Servicio B0', 'UND',
    'service', 'inafecto', false, false,
    'b0100000-0000-4000-8000-000000000001',
    'b0100000-0000-4000-8000-000000000001'
  ),
  (
    'b0500000-0000-4000-8000-000000000003',
    'b0000000-0000-4000-8000-000000000002', 'B0-OTHER', 'Servicio B0 Dos', 'UND',
    'service', 'inafecto', false, false,
    'b0100000-0000-4000-8000-000000000003',
    'b0100000-0000-4000-8000-000000000003'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0100000-0000-4000-8000-000000000001', true);

select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'b0000000-0000-4000-8000-000000000001',
  'supplier_id', 'b0200000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'B001', 'document_number', 'B0-001',
  'issue_date', current_date,
  'warehouse_id', 'b0300000-0000-4000-8000-000000000001',
  'warehouse', 'Almacen B0 Uno', 'prices_include_tax', false,
  'items', jsonb_build_array(
    jsonb_build_object(
      'product_id', 'b0500000-0000-4000-8000-000000000001',
      'quantity', 2, 'unit_cost', 10, 'lot', '', 'expiration_date', ''
    ),
    jsonb_build_object(
      'product_id', 'b0500000-0000-4000-8000-000000000002',
      'quantity', 1, 'unit_cost', 20, 'lot', '', 'expiration_date', ''
    )
  )
)) as own_mixed_order_id \gset

select public.issue_purchase_order(
  'b0000000-0000-4000-8000-000000000001', :'own_mixed_order_id'
);

select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'b0000000-0000-4000-8000-000000000001',
  'supplier_id', 'b0200000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'B001', 'document_number', 'B0-002',
  'issue_date', current_date,
  'warehouse_id', 'b0300000-0000-4000-8000-000000000001',
  'warehouse', 'Almacen B0 Uno',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'b0500000-0000-4000-8000-000000000002',
    'quantity', 1, 'unit_cost', 15, 'lot', '', 'expiration_date', ''
  ))
)) as own_draft_order_id \gset

select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'b0000000-0000-4000-8000-000000000001',
  'supplier_id', 'b0200000-0000-4000-8000-000000000001',
  'document_type', 'factura', 'series', 'B001', 'document_number', 'B0-003',
  'issue_date', current_date,
  'warehouse_id', 'b0300000-0000-4000-8000-000000000001',
  'warehouse', 'Almacen B0 Uno',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'b0500000-0000-4000-8000-000000000002',
    'quantity', 1, 'unit_cost', 12, 'lot', '', 'expiration_date', ''
  ))
)) as own_idempotent_order_id \gset

select public.issue_purchase_order(
  'b0000000-0000-4000-8000-000000000001', :'own_idempotent_order_id'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0100000-0000-4000-8000-000000000003', true);

select public.save_purchase_order(jsonb_build_object(
  'organization_id', 'b0000000-0000-4000-8000-000000000002',
  'supplier_id', 'b0200000-0000-4000-8000-000000000002',
  'document_type', 'factura', 'series', 'B002', 'document_number', 'B0-X01',
  'issue_date', current_date,
  'warehouse_id', 'b0300000-0000-4000-8000-000000000002',
  'warehouse', 'Almacen B0 Dos',
  'items', jsonb_build_array(jsonb_build_object(
    'product_id', 'b0500000-0000-4000-8000-000000000003',
    'quantity', 1, 'unit_cost', 30, 'lot', '', 'expiration_date', ''
  ))
)) as other_order_id \gset

select public.issue_purchase_order(
  'b0000000-0000-4000-8000-000000000002', :'other_order_id'
);

reset role;
update public.products
set is_active = false,
    updated_by = 'b0100000-0000-4000-8000-000000000001'
where id = 'b0500000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0100000-0000-4000-8000-000000000001', true);

select lives_ok(
  format(
    'select public.receive_purchase_order(%L::uuid, %L::uuid)',
    'b0000000-0000-4000-8000-000000000001', :'own_mixed_order_id'
  ),
  'un usuario autorizado recibe su orden por el wrapper'
);
select is(
  (select status from public.purchase_orders where id = :'own_mixed_order_id'),
  'received',
  'la orden mixta queda recibida'
);
select is(
  (select count(*) from public.purchase_receipt_items
   where organization_id = 'b0000000-0000-4000-8000-000000000001'
     and fulfillment_mode = 'physical'),
  1::bigint,
  'el wrapper conserva la recepcion fisica de goods'
);
select is(
  (select count(*) from public.purchase_receipt_items
   where organization_id = 'b0000000-0000-4000-8000-000000000001'
     and fulfillment_mode = 'administrative'),
  1::bigint,
  'el wrapper conserva el cumplimiento administrativo de services'
);
select is(
  (select count(*) from public.inventory_movements
   where organization_id = 'b0000000-0000-4000-8000-000000000001'
     and source_type = 'purchase-receipt'),
  1::bigint,
  'solo el good crea movimiento de inventario'
);
select is(
  (select is_active from public.products where id = 'b0500000-0000-4000-8000-000000000001'),
  false,
  'el producto posteriormente inactivo permanece inactivo'
);
select ok(
  (select operation_payload_hash is not null
   from public.purchase_receipts where purchase_order_id = :'own_mixed_order_id'),
  'la delegacion persiste el hash estricto de A3'
);

select throws_ok(
  format(
    'select public.receive_purchase_order(%L::uuid, %L::uuid)',
    'b0000000-0000-4000-8000-000000000001', :'own_draft_order_id'
  ),
  'P0001', 'PURCHASE_ORDER_NOT_RECEIVABLE',
  'una orden propia no recepcionable conserva un error funcional'
);

select throws_ok(
  format(
    'select public.receive_purchase_order(%L::uuid, %L::uuid)',
    'b0000000-0000-4000-8000-000000000001', :'other_order_id'
  ),
  'P0001', 'PURCHASE_ORDER_NOT_RECEIVABLE',
  'una orden ajena presentada bajo la organizacion autorizada no se distingue de una inexistente'
);
select throws_ok(
  $$select public.receive_purchase_order(
    'b0000000-0000-4000-8000-000000000001',
    'b0999999-9999-4999-8999-999999999999'
  )$$,
  'P0001', 'PURCHASE_ORDER_NOT_RECEIVABLE',
  'un UUID inexistente bajo la organizacion autorizada usa el mismo contrato'
);
select throws_ok(
  format(
    'select public.receive_purchase_order(%L::uuid, %L::uuid)',
    'b0000000-0000-4000-8000-000000000002', :'other_order_id'
  ),
  '42501', 'PURCHASE_RECEIPT_FORBIDDEN',
  'una organizacion no autorizada se rechaza antes del lookup aunque la orden exista'
);
select throws_ok(
  $$select public.receive_purchase_order(
    'b0000000-0000-4000-8000-000000000002',
    'b0999999-9999-4999-8999-999999999998'
  )$$,
  '42501', 'PURCHASE_RECEIPT_FORBIDDEN',
  'una organizacion no autorizada devuelve lo mismo para un UUID inexistente'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0100000-0000-4000-8000-000000000002', true);
select throws_ok(
  format(
    'select public.receive_purchase_order(%L::uuid, %L::uuid)',
    'b0000000-0000-4000-8000-000000000001', :'own_draft_order_id'
  ),
  '42501', 'PURCHASE_RECEIPT_FORBIDDEN',
  'un miembro sin PURCHASES_RECEIVE es rechazado'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0100000-0000-4000-8000-000000000001', true);

select public.receive_purchase_order_partial(jsonb_build_object(
  'organization_id', 'b0000000-0000-4000-8000-000000000001',
  'purchase_order_id', :'own_idempotent_order_id',
  'operation_key', 'b0600000-0000-4000-8000-000000000001',
  'items', jsonb_build_array(jsonb_build_object(
    'purchase_order_item_id', (
      select id from public.purchase_order_items
      where purchase_order_id = :'own_idempotent_order_id'
    ),
    'quantity', 1,
    'fulfillment_mode', 'administrative'
  ))
)) as first_receipt_id \gset

select public.receive_purchase_order_partial(jsonb_build_object(
  'organization_id', 'b0000000-0000-4000-8000-000000000001',
  'purchase_order_id', :'own_idempotent_order_id',
  'operation_key', 'b0600000-0000-4000-8000-000000000001',
  'items', jsonb_build_array(jsonb_build_object(
    'purchase_order_item_id', (
      select id from public.purchase_order_items
      where purchase_order_id = :'own_idempotent_order_id'
    ),
    'quantity', 1,
    'fulfillment_mode', 'administrative'
  ))
)) as retry_receipt_id \gset

select is(
  :'retry_receipt_id'::uuid,
  :'first_receipt_id'::uuid,
  'A3 conserva el receipt_id en un retry exacto'
);
select is(
  (select count(*) from public.purchase_receipts
   where organization_id = 'b0000000-0000-4000-8000-000000000001'
     and operation_key = 'b0600000-0000-4000-8000-000000000001'),
  1::bigint,
  'A3 no duplica la cabecera de recepcion'
);
select is(
  (select count(*) from public.purchase_receipt_items receipt_item
   join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id
   where receipt.operation_key = 'b0600000-0000-4000-8000-000000000001'),
  1::bigint,
  'A3 no duplica partidas en el retry'
);
select ok(
  (select operation_payload_hash is not null
   from public.purchase_receipts
   where operation_key = 'b0600000-0000-4000-8000-000000000001'),
  'A3 conserva el hash canonico en la ruta principal'
);
select is(
  (select count(*) from public.inventory_movements
   where organization_id = 'b0000000-0000-4000-8000-000000000001'),
  1::bigint,
  'el retry administrativo de A3 no crea inventario adicional'
);

reset role;
select is(
  (select count(*) from public.purchase_receipts
   where organization_id = 'b0000000-0000-4000-8000-000000000002'),
  0::bigint,
  'los intentos cross-organizacion no crean recepciones'
);
select is(
  (select count(*) from public.audit_events
   where organization_id = 'b0000000-0000-4000-8000-000000000001'
     and action = 'PURCHASE_RECEIPT_CONFIRMED'),
  2::bigint,
  'cada recepcion legitima genera una sola auditoria'
);

select * from finish();
rollback;
