begin;

select plan(4);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.inventory_movements'::regclass
      and tgname = 'inventory_movements_enforce_product_maximum_stock'
  ),
  'inventario aplica el stock maximo del producto por trigger'
);

insert into public.organizations (id, name, slug)
values ('c1000000-0000-4000-8000-000000000001', 'Reglas producto', 'reglas-producto');

insert into public.products (
  id, organization_id, code, description, maximum_stock,
  batch_control, expiration_control
)
values (
  'c2000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'MAX-001', 'Producto con tope', 12, false, false
);

insert into public.warehouses (id, organization_id, code, name)
values (
  'c3000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'PRUEBA', 'Almacen de prueba'
);

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name
)
values (
  'c4000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'GENERAL', 'Ubicacion general'
);

select lives_ok($$
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description,
    movement_type, quantity, warehouse, warehouse_id, location_id,
    operation_date, reason
  ) values (
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'MAX-001', 'Producto con tope', 'entrada', 10, 'Almacen de prueba',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', current_date, 'Entrada inicial'
  )
$$, 'permite una entrada debajo del stock maximo');

select throws_ok($$
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description,
    movement_type, quantity, warehouse, warehouse_id, location_id,
    operation_date, reason
  ) values (
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'MAX-001', 'Producto con tope', 'entrada', 3, 'Almacen de prueba',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', current_date, 'Entrada excesiva'
  )
$$, 'P0001', 'INVENTORY_MAXIMUM_STOCK_EXCEEDED',
  'rechaza una entrada que supera el stock maximo global');

select lives_ok($$
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description,
    movement_type, quantity, warehouse, warehouse_id, location_id,
    operation_date, reason
  ) values (
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'MAX-001', 'Producto con tope', 'entrada', 2, 'Almacen de prueba',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', current_date, 'Completa el maximo'
  )
$$, 'permite alcanzar exactamente el stock maximo');

select * from finish();
rollback;
