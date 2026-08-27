begin;

select plan(7);

insert into public.organizations (id, name, slug)
values ('d1000000-0000-4000-8000-000000000001', 'Importacion extendida', 'importacion-extendida');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'd2000000-0000-4000-8000-000000000001',
  'importacion.extendida@test.local',
  '{"full_name":"Importacion Extendida"}', now(), now()
);

insert into public.organization_memberships (organization_id, user_id)
values (
  'd1000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001'
);

insert into public.user_roles (organization_id, user_id, role_code)
values (
  'd1000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'LOGISTICA'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2000000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.import_products(
    'd1000000-0000-4000-8000-000000000001',
    '{
      "productos":[{
        "fila":2,"codigo":"EXT-001","descripcion":"Producto extendido",
        "categoria":"Linea","sublinea":"","laboratorio":"Marca",
        "descripcion_ampliada":"Detalle técnico","codigo_barras":"775000000001",
        "presentacion":"Caja","registro_sanitario":"RS-001","stock_maximo":"100",
        "ancho_cm":"10","alto_cm":"20","largo_cm":"30","peso_kg":"0.5",
         "control_lote":true,"control_vencimiento":true,"control_serie":true,"venta_receta":false
      }],
      "precios":[{
        "fila":2,"codigo_producto":"EXT-001","producto":"Producto extendido",
        "unidad_medida":"UND","precio_venta":"15.00","inc_igv":"Sí",
        "costo_base":"8.00","precio_minimo":"12.00"
      }]
    }'::jsonb
  )
$$, 'importa el contrato extendido de productos');

select is(
  (select extended_description from public.products where code = 'EXT-001'),
  'Detalle técnico',
  'persiste la descripcion ampliada'
);

select results_eq(
  $$select width_cm, height_cm, length_cm, weight_kg, maximum_stock from public.products where code = 'EXT-001'$$,
  $$values (10::numeric, 20::numeric, 30::numeric, 0.5::numeric, 100::numeric)$$,
  'persiste dimensiones, peso y stock maximo'
);

select results_eq(
  $$select cost, sale_price, minimum_sale_price from public.products where code = 'EXT-001'$$,
  $$values (8::numeric, 15::numeric, 12::numeric)$$,
  'persiste costo, precio base y precio minimo'
);

select results_eq(
  $$select batch_control, expiration_control, serial_control, prescription_sale from public.products where code = 'EXT-001'$$,
  $$values (true, true, true, false)$$,
  'persiste los controles independientes'
);

select is(
  (select count(*) from public.product_versions where product_id = (select id from public.products where code = 'EXT-001')),
  3::bigint,
  'la ampliacion importada queda versionada'
);

select throws_ok($$
  select public.import_products(
    'd1000000-0000-4000-8000-000000000001',
    '{
      "productos":[{"fila":3,"codigo":"EXT-002","descripcion":"Precio invalido","categoria":"","sublinea":"","laboratorio":""}],
      "precios":[{"fila":3,"codigo_producto":"EXT-002","producto":"Precio invalido","unidad_medida":"UND","precio_venta":"10.00","precio_minimo":"11.00","inc_igv":"Sí"}]
    }'::jsonb
  )
$$, 'P0001', 'PRODUCT_IMPORT_INVALID_PAYLOAD',
  'rechaza precio minimo mayor al precio base'
);

select * from finish();
rollback;
