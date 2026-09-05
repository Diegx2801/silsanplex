begin;

select no_plan();

select has_function(
  'public', 'order_item_final_unit_price', array['numeric', 'text', 'boolean'],
  'existe la conversion reusable al precio final comparable'
);
select has_function(
  'public', 'enforce_order_item_minimum_sale_price', array[]::text[],
  'existe el guard central de precio minimo'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.order_items'::regclass
      and tgname = 'order_items_enforce_minimum_sale_price'
  ),
  'order_items aplica el guard por trigger'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.order_item_final_unit_price(numeric,text,boolean)',
    'EXECUTE'
  ),
  false,
  'la funcion interna de conversion no se expone a authenticated'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.enforce_order_item_minimum_sale_price()',
    'EXECUTE'
  ),
  false,
  'el guard interno no se expone a authenticated'
);
select is(
  public.order_item_final_unit_price(10::numeric, 'gravado', false),
  11.80::numeric,
  'gravado sin IGV convierte el unit_price a precio final sin redondear'
);
select is(
  public.order_item_final_unit_price(10::numeric, 'gravado', true),
  10::numeric,
  'gravado con IGV usa el unit_price directamente'
);
select is(
  public.order_item_final_unit_price(10::numeric, 'exonerado', false),
  10::numeric,
  'exonerado se compara directamente'
);
select is(
  public.order_item_final_unit_price(10::numeric, 'inafecto', false),
  10::numeric,
  'inafecto se compara directamente'
);

insert into public.organizations (id, name, slug) values
  ('d6100000-0000-4000-8000-000000000001', 'Minimo venta uno', 'minimo-venta-uno'),
  ('d6100000-0000-4000-8000-000000000002', 'Minimo venta dos', 'minimo-venta-dos');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('d6200000-0000-4000-8000-000000000001', 'minimo.venta.uno@test.local', '{"full_name":"Minimo venta uno"}', now(), now()),
  ('d6200000-0000-4000-8000-000000000002', 'minimo.venta.dos@test.local', '{"full_name":"Minimo venta dos"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('d6100000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001'),
  ('d6100000-0000-4000-8000-000000000002', 'd6200000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('d6100000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001', 'VENTAS'),
  ('d6100000-0000-4000-8000-000000000002', 'd6200000-0000-4000-8000-000000000002', 'VENTAS');

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name, created_by, updated_by
) values
  ('d6300000-0000-4000-8000-000000000001', 'd6100000-0000-4000-8000-000000000001', 'RUC', '20999999611', 'Cliente minimo uno', 'd6200000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001'),
  ('d6300000-0000-4000-8000-000000000002', 'd6100000-0000-4000-8000-000000000002', 'RUC', '20999999612', 'Cliente minimo dos', 'd6200000-0000-4000-8000-000000000002', 'd6200000-0000-4000-8000-000000000002');

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by) values
  ('d6400000-0000-4000-8000-000000000001', 'd6100000-0000-4000-8000-000000000001', 'MIN', 'Almacen minimo', 'd6200000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, sale_price, minimum_sale_price, is_active,
  batch_control, expiration_control, created_by, updated_by
) values
  ('d6500000-0000-4000-8000-000000000001', 'd6100000-0000-4000-8000-000000000001', 'MIN-NULL', 'Servicio sin minimo', 'UND', 'service', 'gravado', 30, null, true, false, false, 'd6200000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001'),
  ('d6500000-0000-4000-8000-000000000002', 'd6100000-0000-4000-8000-000000000001', 'MIN-ZERO', 'Servicio minimo cero', 'UND', 'service', 'gravado', 30, 0, true, false, false, 'd6200000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001'),
  ('d6500000-0000-4000-8000-000000000003', 'd6100000-0000-4000-8000-000000000001', 'MIN-GRAV', 'Servicio gravado', 'UND', 'service', 'gravado', 30, 20, true, false, false, 'd6200000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001'),
  ('d6500000-0000-4000-8000-000000000004', 'd6100000-0000-4000-8000-000000000001', 'MIN-EXO', 'Servicio exonerado', 'UND', 'service', 'exonerado', 30, 20, true, false, false, 'd6200000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001'),
  ('d6500000-0000-4000-8000-000000000005', 'd6100000-0000-4000-8000-000000000001', 'MIN-INA', 'Servicio inafecto', 'UND', 'service', 'inafecto', 30, 20, true, false, false, 'd6200000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001'),
  ('d6500000-0000-4000-8000-000000000006', 'd6100000-0000-4000-8000-000000000001', 'MIN-GOOD', 'Bien gravado', 'UND', 'good', 'gravado', 30, 20, true, false, false, 'd6200000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001'),
  ('d6500000-0000-4000-8000-000000000007', 'd6100000-0000-4000-8000-000000000001', 'MIN-OFF', 'Servicio inactivo', 'UND', 'service', 'gravado', 30, 20, false, false, false, 'd6200000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001'),
  ('d6500000-0000-4000-8000-000000000008', 'd6100000-0000-4000-8000-000000000002', 'MIN-OTHER', 'Servicio de otra organizacion', 'UND', 'service', 'gravado', 30, 20, true, false, false, 'd6200000-0000-4000-8000-000000000002', 'd6200000-0000-4000-8000-000000000002');

create function pg_temp.minimum_order_payload(
  requested_key uuid,
  requested_product_id uuid,
  requested_unit_price numeric,
  requested_prices_include_tax boolean default true
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'organization_id', 'd6100000-0000-4000-8000-000000000001',
    'operation_key', requested_key,
    'customer_id', 'd6300000-0000-4000-8000-000000000001',
    'warehouse_id', 'd6400000-0000-4000-8000-000000000001',
    'prices_include_tax', requested_prices_include_tax,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', requested_product_id,
      'quantity', 1,
      'unit_price', requested_unit_price
    ))
  )
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd6200000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.create_order(pg_temp.minimum_order_payload('d6600000-0000-4000-8000-000000000001', 'd6500000-0000-4000-8000-000000000001', 0))$$,
  'NULL no establece minimo'
);
select lives_ok(
  $$select public.create_order(pg_temp.minimum_order_payload('d6600000-0000-4000-8000-000000000002', 'd6500000-0000-4000-8000-000000000002', 0))$$,
  'minimo cero permite precio cero'
);
select lives_ok(
  $$select public.create_order(pg_temp.minimum_order_payload('d6600000-0000-4000-8000-000000000003', 'd6500000-0000-4000-8000-000000000003', 20))$$,
  'gravado con IGV permite el limite exacto'
);
select throws_ok(
  $$select public.create_order(pg_temp.minimum_order_payload('d6600000-0000-4000-8000-000000000004', 'd6500000-0000-4000-8000-000000000003', 19.9999))$$,
  'P0001', 'ORDER_MINIMUM_SALE_PRICE_VIOLATION',
  'create_order rechaza un precio inferior por 0.0001'
);
select lives_ok(
  $$select public.create_order(pg_temp.minimum_order_payload('d6600000-0000-4000-8000-000000000005', 'd6500000-0000-4000-8000-000000000003', 16.9492, false))$$,
  'gravado sin IGV permite el primer valor de cuatro decimales que alcanza el minimo final'
);
select throws_ok(
  $$select public.create_order(pg_temp.minimum_order_payload('d6600000-0000-4000-8000-000000000006', 'd6500000-0000-4000-8000-000000000003', 16.9491, false))$$,
  'P0001', 'ORDER_MINIMUM_SALE_PRICE_VIOLATION',
  'gravado sin IGV compara unit_price por 1.18 sin redondeo monetario'
);
select lives_ok(
  $$select public.create_order(pg_temp.minimum_order_payload('d6600000-0000-4000-8000-000000000007', 'd6500000-0000-4000-8000-000000000004', 20, false))$$,
  'exonerado compara directamente aunque el documento no incluya IGV'
);
select throws_ok(
  $$select public.create_order(pg_temp.minimum_order_payload('d6600000-0000-4000-8000-000000000008', 'd6500000-0000-4000-8000-000000000005', 19.9999, false))$$,
  'P0001', 'ORDER_MINIMUM_SALE_PRICE_VIOLATION',
  'inafecto compara directamente'
);
select throws_ok(
  $$select public.create_order(pg_temp.minimum_order_payload('d6600000-0000-4000-8000-000000000009', 'd6500000-0000-4000-8000-000000000007', 20))$$,
  'P0001', 'ORDER_PRODUCT_UNAVAILABLE',
  'un producto inactivo continua bloqueado por la validacion existente'
);
select throws_ok(
  $$select public.create_order(pg_temp.minimum_order_payload('d6600000-0000-4000-8000-000000000010', 'd6500000-0000-4000-8000-000000000008', 20))$$,
  'P0001', 'ORDER_PRODUCT_UNAVAILABLE',
  'no se puede usar un producto de otra organizacion'
);

reset role;

insert into public.orders (
  id, organization_id, order_number, customer_id, warehouse_id,
  prices_include_tax, operation_key, created_by, updated_by
) values (
  'd6700000-0000-4000-8000-000000000001',
  'd6100000-0000-4000-8000-000000000001', 'PED-900001',
  'd6300000-0000-4000-8000-000000000001',
  'd6400000-0000-4000-8000-000000000001', true,
  'd6800000-0000-4000-8000-000000000001',
  'd6200000-0000-4000-8000-000000000001',
  'd6200000-0000-4000-8000-000000000001'
);
select lives_ok($$
  insert into public.order_items (
    organization_id, order_id, product_id, product_code,
    product_description, unit_of_measure, quantity, unit_price
  ) values (
    'd6100000-0000-4000-8000-000000000001',
    'd6700000-0000-4000-8000-000000000001',
    'd6500000-0000-4000-8000-000000000006',
    'MIN-GOOD', 'Bien gravado', 'UND', 1, 20
  )
$$, 'el trigger aplica la misma regla a bienes');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd6200000-0000-4000-8000-000000000001', true);

select public.create_order(
  pg_temp.minimum_order_payload(
    'd6600000-0000-4000-8000-000000000011',
    'd6500000-0000-4000-8000-000000000003',
    20
  )
);
reset role;
update public.products
set sale_price = 30, minimum_sale_price = 25
where id = 'd6500000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd6200000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.create_order(pg_temp.minimum_order_payload('d6600000-0000-4000-8000-000000000011', 'd6500000-0000-4000-8000-000000000003', 20))$$,
  'un retry idempotente completado no revalida el minimo vigente'
);
select is(
  (
    select item.unit_price
    from public.order_items item
    join public.orders order_data on order_data.id = item.order_id
    where order_data.operation_key = 'd6600000-0000-4000-8000-000000000011'
  ),
  20.0000::numeric,
  'cambiar el minimo despues de confirmar conserva el precio acordado'
);
select lives_ok($$
  select public.update_order_quantities(jsonb_build_object(
    'organization_id', 'd6100000-0000-4000-8000-000000000001',
    'order_id', (
      select id from public.orders
      where operation_key = 'd6600000-0000-4000-8000-000000000011'
    ),
    'operation_key', 'd6900000-0000-4000-8000-000000000001',
    'items', jsonb_build_array(jsonb_build_object(
      'order_item_id', (
        select item.id
        from public.order_items item
        join public.orders order_data on order_data.id = item.order_id
        where order_data.operation_key = 'd6600000-0000-4000-8000-000000000011'
      ),
      'quantity', 2
    ))
  ))
$$, 'actualizar cantidades no revalida el precio historico');
select lives_ok($$
  select public.create_sale_from_order(
    'd6100000-0000-4000-8000-000000000001',
    (select id from public.orders where operation_key = 'd6600000-0000-4000-8000-000000000011'),
    jsonb_build_object(
      'operation_key', 'd6a00000-0000-4000-8000-000000000001',
      'document_type', 'boleta', 'series', 'B001',
      'document_number', '900001', 'warehouse', 'Almacen minimo'
    )
  )
$$, 'pedido a venta no revalida el minimo vigente');
select is(
  (
    select item.unit_price
    from public.sale_items item
    join public.sales sale on sale.id = item.sale_id
    where sale.operation_key = 'd6a00000-0000-4000-8000-000000000001'
  ),
  20.0000::numeric,
  'la venta conserva el precio acordado del pedido'
);

select * from finish();
rollback;
