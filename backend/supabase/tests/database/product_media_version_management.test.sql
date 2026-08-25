begin;

select plan(14);

select has_function(
  'public', 'organize_product_images', array['uuid', 'uuid', 'uuid[]', 'uuid'],
  'existe la organización transaccional de imágenes'
);
select has_function(
  'public', 'restore_product_version', array['uuid', 'uuid', 'integer'],
  'existe la restauración de versiones'
);
select is(
  has_function_privilege('anon', 'public.restore_product_version(uuid, uuid, integer)', 'EXECUTE'),
  false,
  'anon no puede restaurar versiones'
);

insert into public.organizations (id, name, slug)
values ('e1000000-0000-4000-8000-000000000001', 'Multimedia producto', 'multimedia-producto');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'e2000000-0000-4000-8000-000000000001',
  'multimedia.producto@test.local',
  '{"full_name":"Multimedia Producto"}', now(), now()
);

insert into public.organization_memberships (organization_id, user_id)
values (
  'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001'
);
insert into public.user_roles (organization_id, user_id, role_code)
values (
  'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001', 'LOGISTICA'
);

insert into public.products (
  id, organization_id, code, description, sale_price, created_by, updated_by
)
values (
  'e3000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'MEDIA-001', 'Producto original', 20,
  'e2000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001'
);

insert into public.product_files (
  id, organization_id, product_id, kind, storage_path, file_name,
  mime_type, byte_size, sort_order, created_by
)
values
  (
    'e4000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001', 'image',
    'e1000000-0000-4000-8000-000000000001/e3000000-0000-4000-8000-000000000001/uno.webp',
    'uno.webp', 'image/webp', 100, 0,
    'e2000000-0000-4000-8000-000000000001'
  ),
  (
    'e4000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001', 'image',
    'e1000000-0000-4000-8000-000000000001/e3000000-0000-4000-8000-000000000001/dos.webp',
    'dos.webp', 'image/webp', 100, 1,
    'e2000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.update_product_file_description(
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001',
    'Vista frontal del empaque'
  )
$$, 'actualiza la descripción de un archivo');

select is(
  (select description from public.product_files where id = 'e4000000-0000-4000-8000-000000000001'),
  'Vista frontal del empaque',
  'persiste la descripción normalizada'
);

select lives_ok($$
  select public.organize_product_images(
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    array[
      'e4000000-0000-4000-8000-000000000002'::uuid,
      'e4000000-0000-4000-8000-000000000001'::uuid
    ],
    'e4000000-0000-4000-8000-000000000002'
  )
$$, 'ordena imágenes y marca la principal');

select is(
  (select id from public.product_files where is_primary and deleted_at is null),
  'e4000000-0000-4000-8000-000000000002'::uuid,
  'solo la imagen solicitada queda como principal'
);
select results_eq(
  $$select id, sort_order from public.product_files order by sort_order$$,
  $$values
    ('e4000000-0000-4000-8000-000000000002'::uuid, 0),
    ('e4000000-0000-4000-8000-000000000001'::uuid, 1)$$,
  'conserva el orden completo solicitado'
);
select is(
  (select count(*)::integer from public.product_versions
   where product_id = 'e3000000-0000-4000-8000-000000000001'
     and event_type = 'file-updated'),
  2,
  'la descripción y la organización generan un evento consolidado cada una'
);

update public.products
set description = 'Producto modificado', sale_price = 25,
    updated_by = 'e2000000-0000-4000-8000-000000000001'
where id = 'e3000000-0000-4000-8000-000000000001';

select lives_ok($$
  select public.restore_product_version(
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001', 1
  )
$$, 'restaura la ficha desde una versión histórica');

select results_eq(
  $$select description, sale_price from public.products where id = 'e3000000-0000-4000-8000-000000000001'$$,
  $$values ('Producto original'::text, 20::numeric)$$,
  'restaura los valores editables de la instantánea'
);
select is(
  (select event_type from public.product_versions where product_id = 'e3000000-0000-4000-8000-000000000001' order by version_number desc limit 1),
  'restored',
  'la restauración crea una nueva versión explícita'
);
select ok(
  (select summary like '%versión 1%' from public.product_versions where product_id = 'e3000000-0000-4000-8000-000000000001' order by version_number desc limit 1),
  'el historial identifica la versión de origen'
);

select throws_ok($$
  select public.organize_product_images(
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    array['e4000000-0000-4000-8000-000000000001'::uuid],
    'e4000000-0000-4000-8000-000000000001'
  )
$$, 'P0001', 'PRODUCT_IMAGE_ORDER_INVALID',
  'rechaza un orden que omite imágenes activas'
);

select * from finish();
rollback;
