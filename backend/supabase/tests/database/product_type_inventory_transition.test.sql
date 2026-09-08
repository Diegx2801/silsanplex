begin;

select plan(19);

insert into public.organizations (id, name, slug) values
  ('d1100000-0000-4000-8000-000000000001', 'Transición de productos', 'transicion-productos'),
  ('d1100000-0000-4000-8000-000000000002', 'Otra organización', 'otra-transicion-productos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'd1200000-0000-4000-8000-000000000001',
  'product-transition@test.local',
  '{"full_name":"Administrador de productos"}',
  now(), now()
);

insert into public.organization_memberships (organization_id, user_id)
values ('d1100000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('d1100000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001', 'ADMIN');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control
) values
  ('d1300000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001', 'EMPTY', 'Sin dependencias', 'UND', 'good', 'gravado', false, false),
  ('d1300000-0000-4000-8000-000000000002', 'd1100000-0000-4000-8000-000000000001', 'STOCK', 'Con stock', 'UND', 'good', 'gravado', false, false),
  ('d1300000-0000-4000-8000-000000000003', 'd1100000-0000-4000-8000-000000000001', 'RESERVED', 'Con reserva', 'UND', 'good', 'gravado', false, false),
  ('d1300000-0000-4000-8000-000000000004', 'd1100000-0000-4000-8000-000000000001', 'LOT', 'Con lote activo', 'UND', 'good', 'gravado', true, true),
  ('d1300000-0000-4000-8000-000000000005', 'd1100000-0000-4000-8000-000000000001', 'HISTORY', 'Con historial sin saldo', 'UND', 'good', 'gravado', false, false),
  ('d1300000-0000-4000-8000-000000000006', 'd1100000-0000-4000-8000-000000000001', 'SERVICE', 'Servicio convertible', 'UND', 'service', 'gravado', false, false),
  ('d1300000-0000-4000-8000-000000000007', 'd1100000-0000-4000-8000-000000000001', 'SAME', 'Mismo tipo', 'UND', 'good', 'gravado', false, false),
  ('d1300000-0000-4000-8000-000000000008', 'd1100000-0000-4000-8000-000000000002', 'CROSS', 'Producto ajeno', 'UND', 'good', 'gravado', false, false);

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values (
  'd1400000-0000-4000-8000-000000000001',
  'd1100000-0000-4000-8000-000000000001', 'CENTRAL', 'Almacén central',
  'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'
);
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values (
  'd1500000-0000-4000-8000-000000000001',
  'd1100000-0000-4000-8000-000000000001',
  'd1400000-0000-4000-8000-000000000001', 'A-01', 'Ubicación A-01',
  'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1200000-0000-4000-8000-000000000001', true);

select public.record_inventory_movement(jsonb_build_object(
  'organization_id', 'd1100000-0000-4000-8000-000000000001',
  'product_id', 'd1300000-0000-4000-8000-000000000002',
  'warehouse_id', 'd1400000-0000-4000-8000-000000000001',
  'location_id', 'd1500000-0000-4000-8000-000000000001',
  'movement_type', 'entrada', 'quantity', 5, 'unit_cost', 10,
  'stock_status', 'available', 'operation_date', current_date,
  'reason', 'Stock vigente'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id', 'd1100000-0000-4000-8000-000000000001',
  'product_id', 'd1300000-0000-4000-8000-000000000003',
  'warehouse_id', 'd1400000-0000-4000-8000-000000000001',
  'location_id', 'd1500000-0000-4000-8000-000000000001',
  'movement_type', 'entrada', 'quantity', 4, 'unit_cost', 10,
  'stock_status', 'available', 'operation_date', current_date,
  'reason', 'Stock para reserva'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id', 'd1100000-0000-4000-8000-000000000001',
  'product_id', 'd1300000-0000-4000-8000-000000000004',
  'warehouse_id', 'd1400000-0000-4000-8000-000000000001',
  'location_id', 'd1500000-0000-4000-8000-000000000001',
  'movement_type', 'entrada', 'quantity', 3, 'unit_cost', 10,
  'stock_status', 'available', 'lot', 'LOTE-A',
  'expiration_date', current_date + 30, 'operation_date', current_date,
  'reason', 'Lote vigente'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id', 'd1100000-0000-4000-8000-000000000001',
  'product_id', 'd1300000-0000-4000-8000-000000000005',
  'warehouse_id', 'd1400000-0000-4000-8000-000000000001',
  'location_id', 'd1500000-0000-4000-8000-000000000001',
  'movement_type', 'entrada', 'quantity', 2, 'unit_cost', 10,
  'stock_status', 'available', 'operation_date', current_date,
  'reason', 'Entrada histórica'
));
select public.record_inventory_movement(jsonb_build_object(
  'organization_id', 'd1100000-0000-4000-8000-000000000001',
  'product_id', 'd1300000-0000-4000-8000-000000000005',
  'warehouse_id', 'd1400000-0000-4000-8000-000000000001',
  'location_id', 'd1500000-0000-4000-8000-000000000001',
  'movement_type', 'salida', 'quantity', 2, 'unit_cost', 10,
  'stock_status', 'available', 'operation_date', current_date,
  'reason', 'Salida histórica'
));

reset role;

insert into public.inventory_reservations (
  organization_id, product_id, warehouse_id, location_id, stock_status,
  quantity, source_type, source_id
) values (
  'd1100000-0000-4000-8000-000000000001',
  'd1300000-0000-4000-8000-000000000003',
  'd1400000-0000-4000-8000-000000000001',
  'd1500000-0000-4000-8000-000000000001',
  'available', 2, 'transition-test', 'd1600000-0000-4000-8000-000000000001'
);

select lives_ok($$
  update public.products
  set product_type = 'service'
  where organization_id = 'd1100000-0000-4000-8000-000000000001'
    and id = 'd1300000-0000-4000-8000-000000000001'
$$, 'good sin dependencias puede convertirse a service');
select is((select product_type from public.products where id = 'd1300000-0000-4000-8000-000000000001'), 'service', 'se confirma good a service');

select throws_ok($$
  update public.products set product_type = 'service'
  where id = 'd1300000-0000-4000-8000-000000000002'
$$, 'P0001', 'PRODUCT_TYPE_CHANGE_INVENTORY_CONFLICT', 'good con stock físico se rechaza');

select throws_ok($$
  update public.products set product_type = 'service'
  where id = 'd1300000-0000-4000-8000-000000000003'
$$, 'P0001', 'PRODUCT_TYPE_CHANGE_INVENTORY_CONFLICT', 'good con reserva activa se rechaza');
select is(
  (select sum(quantity - quantity_consumed) from public.inventory_reservations
   where product_id = 'd1300000-0000-4000-8000-000000000003' and status = 'active'),
  2::numeric,
  'el stock reservado continúa visible después del rechazo'
);

select throws_ok($$
  update public.products set product_type = 'service'
  where id = 'd1300000-0000-4000-8000-000000000004'
$$, 'P0001', 'PRODUCT_TYPE_CHANGE_INVENTORY_CONFLICT', 'good con lote o bucket activo se rechaza');

select lives_ok($$
  update public.products set product_type = 'service'
  where id = 'd1300000-0000-4000-8000-000000000005'
$$, 'el historial inmutable con saldo cero no bloquea');
select is((select count(*) from public.inventory_movements where product_id = 'd1300000-0000-4000-8000-000000000005'), 2::bigint, 'el historial se conserva íntegro');

select lives_ok($$
  update public.products set product_type = 'good'
  where id = 'd1300000-0000-4000-8000-000000000006'
$$, 'service puede convertirse a good');
select is((select count(*) from public.inventory_movements where product_id = 'd1300000-0000-4000-8000-000000000006'), 0::bigint, 'service a good no inventa movimientos');

select lives_ok($$
  update public.products set product_type = 'good'
  where id = 'd1300000-0000-4000-8000-000000000007'
$$, 'guardar el mismo tipo no se altera');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1200000-0000-4000-8000-000000000001', true);

select throws_ok($$
  select public.save_product_catalog(
    'd1100000-0000-4000-8000-000000000001',
    'd1300000-0000-4000-8000-000000000008',
    jsonb_build_object(
      'code', 'CROSS', 'description', 'Producto ajeno',
      'base_unit_id', (select base_unit_id from public.products where id = 'd1300000-0000-4000-8000-000000000002'),
      'product_type', 'service', 'alternate_units', jsonb_build_array()
    )
  )
$$, 'P0002', 'PRODUCT_NOT_FOUND', 'la organización cruzada no puede cambiar el producto');

select throws_ok($$
  select public.save_product_catalog(
    'd1100000-0000-4000-8000-000000000001',
    'd1300000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'code', 'STOCK', 'description', 'Con stock',
      'base_unit_id', (select base_unit_id from public.products where id = 'd1300000-0000-4000-8000-000000000002'),
      'product_type', 'service', 'alternate_units', jsonb_build_array()
    )
  )
$$, 'P0001', 'PRODUCT_TYPE_CHANGE_INVENTORY_CONFLICT', 'la llamada directa al RPC no evita la barrera');

reset role;

select is((select product_type from public.products where id = 'd1300000-0000-4000-8000-000000000002'), 'good', 'un cambio inválido conserva el tipo good');
select is(
  (select sum(physical_quantity) from public.inventory_bucket_balances where product_id = 'd1300000-0000-4000-8000-000000000002'),
  5::numeric,
  'un cambio inválido no hace desaparecer el stock de las vistas'
);
select is((select product_type from public.products where id = 'd1300000-0000-4000-8000-000000000003'), 'good', 'la reserva activa conserva inventariable al producto');
select is((select product_type from public.products where id = 'd1300000-0000-4000-8000-000000000004'), 'good', 'el lote activo conserva inventariable al producto');
select ok(
  position('for update' in lower(pg_get_functiondef('public.reject_service_inventory_reference()'::regprocedure))) > 0,
  'las escrituras físicas bloquean la fila del producto'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.products'::regclass
      and tgname = 'products_guard_type_inventory_transition'
      and not tgisinternal
  ),
  'la barrera vive en backend y cubre cualquier UPDATE'
);

select * from finish();

rollback;
