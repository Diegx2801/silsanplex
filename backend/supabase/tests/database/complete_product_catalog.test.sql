begin;

select plan(32);

select has_column('public', 'products', 'extended_description', 'producto tiene descripción ampliada');
select has_column('public', 'products', 'width_cm', 'producto tiene ancho');
select has_column('public', 'products', 'height_cm', 'producto tiene alto');
select has_column('public', 'products', 'length_cm', 'producto tiene largo');
select has_column('public', 'products', 'weight_kg', 'producto tiene peso');
select has_column('public', 'products', 'minimum_sale_price', 'producto tiene precio mínimo');
select has_column('public', 'products', 'maximum_stock', 'producto tiene stock máximo');
select has_column('public', 'products', 'expiration_control', 'producto controla vencimiento por separado');

select has_table('public', 'product_files', 'existe metadata de archivos');
select has_table('public', 'product_versions', 'existe historial versionado');
select is((select count(*) from storage.buckets where id = 'product-files'), 1::bigint, 'existe bucket privado de productos');

select ok((select relrowsecurity from pg_class where oid = 'public.product_files'::regclass), 'archivos tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.product_versions'::regclass), 'versiones tiene RLS');
select is(has_table_privilege('anon', 'public.product_files', 'SELECT'), false, 'anon no consulta archivos');
select is(has_table_privilege('anon', 'public.product_versions', 'SELECT'), false, 'anon no consulta versiones');
select is(has_table_privilege('authenticated', 'public.product_files', 'INSERT'), true, 'authenticated carga metadata bajo RLS');
select is(has_table_privilege('authenticated', 'public.product_files', 'UPDATE'), true, 'authenticated retira metadata bajo RLS');
select is(has_table_privilege('authenticated', 'public.product_versions', 'SELECT'), true, 'authenticated consulta historial bajo RLS');

insert into public.organizations (id, name, slug) values
  ('b1000000-0000-4000-8000-000000000001', 'Productos completos', 'productos-completos');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('b2000000-0000-4000-8000-000000000001', 'productos.completos@test.local', '{"full_name":"Productos Completos"}', now(), now());

insert into public.products (
  id, organization_id, code, description, extended_description,
  sale_price, minimum_sale_price, maximum_stock,
  width_cm, height_cm, length_cm, weight_kg,
  batch_control, expiration_control, created_by, updated_by
) values (
  'b3000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'FULL-001', 'Producto completo', 'Descripción técnica ampliada',
  20, 15, 100, 10, 20, 30, 0.5, true, false,
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001'
);

select is((select max(version_number) from public.product_versions where product_id = 'b3000000-0000-4000-8000-000000000001'), 1, 'alta crea versión inicial');

update public.products
set minimum_sale_price = 16,
    updated_by = 'b2000000-0000-4000-8000-000000000001'
where id = 'b3000000-0000-4000-8000-000000000001';

select is((select max(version_number) from public.product_versions where product_id = 'b3000000-0000-4000-8000-000000000001'), 2, 'edición incrementa versión');
select ok((select changes ? 'minimum_sale_price' from public.product_versions where product_id = 'b3000000-0000-4000-8000-000000000001' and version_number = 2), 'versión identifica el campo modificado');

insert into public.product_files (
  id, organization_id, product_id, kind, storage_path, file_name,
  mime_type, byte_size, created_by
) values (
  'b4000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'image',
  'b1000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/imagen.webp',
  'imagen.webp', 'image/webp', 2048,
  'b2000000-0000-4000-8000-000000000001'
);

select is(
  (select is_primary from public.product_files where id = 'b4000000-0000-4000-8000-000000000001'),
  true,
  'la primera imagen del producto se establece como principal'
);

select is((select max(version_number) from public.product_versions where product_id = 'b3000000-0000-4000-8000-000000000001'), 3, 'archivo agregado entra al historial');

update public.product_files
set deleted_at = now(), deleted_by = 'b2000000-0000-4000-8000-000000000001'
where id = 'b4000000-0000-4000-8000-000000000001';

select is((select max(version_number) from public.product_versions where product_id = 'b3000000-0000-4000-8000-000000000001'), 4, 'archivo retirado entra al historial');

select throws_ok(
  $$update public.product_versions set summary = 'Alterada' where product_id = 'b3000000-0000-4000-8000-000000000001'$$,
  'P0001', 'PRODUCT_VERSION_IMMUTABLE', 'el historial es inmutable'
);
select throws_ok(
  $$update public.product_files set deleted_at = null, deleted_by = null where id = 'b4000000-0000-4000-8000-000000000001'$$,
  'P0001', 'PRODUCT_FILE_IMMUTABLE_FIELDS', 'un archivo retirado no puede restaurarse'
);
select throws_ok(
  $$insert into public.products (organization_id, code, description, sale_price, minimum_sale_price) values ('b1000000-0000-4000-8000-000000000001', 'BAD-PRICE', 'Precio inválido', 10, 11)$$,
  '23514', null, 'precio mínimo no supera precio base'
);
select throws_ok(
  $$insert into public.products (organization_id, code, description, width_cm) values ('b1000000-0000-4000-8000-000000000001', 'BAD-SIZE', 'Dimensión inválida', 0)$$,
  '23514', null, 'dimensiones deben ser positivas'
);
select throws_ok(
  $$insert into public.product_files (organization_id, product_id, kind, storage_path, file_name, mime_type, byte_size, created_by) values ('b1000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'image', 'otra/ruta/imagen.webp', 'imagen.webp', 'image/webp', 100, 'b2000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'ruta debe pertenecer a organización y producto'
);
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'product_files_storage_%'), 3::bigint, 'Storage tiene políticas de lectura, carga y retiro');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.products'::regclass and tgname = 'products_record_version'), 'products registra versiones por trigger');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.inventory_movements'::regclass and tgname = 'inventory_movements_validate_product_tracking'), 'inventario valida controles independientes');

select * from finish();
rollback;
