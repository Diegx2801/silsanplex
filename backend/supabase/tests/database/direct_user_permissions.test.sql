begin;

select plan(35);

select has_table('public', 'organization_user_permissions', 'existe asignación directa multiempresa');
select has_table('public', 'permission_dependencies', 'existe catálogo de dependencias');
select has_column('public', 'organization_memberships', 'access_version', 'el acceso usa versión optimista');
select has_column('public', 'permissions', 'is_directly_assignable', 'el catálogo distingue permisos delegables');
select is((select is_directly_assignable from public.permissions where code='USERS_MANAGE'), false, 'USERS_MANAGE no es delegable');
select is((select is_directly_assignable from public.permissions where code='PRODUCTS_VIEW'), true, 'los permisos operativos declarados son delegables');
select has_function('public', 'admin_create_user_membership', array['uuid','uuid','boolean','text[]'], 'existe alta atómica por acceso');
select has_function('public', 'admin_update_user_membership', array['uuid','uuid','text','text','text','text','boolean','text[]','bigint'], 'existe edición atómica por acceso');
select has_function('public', 'admin_list_user_access', array['uuid'], 'existe lectura privada del contrato nuevo');
select is(has_table_privilege('authenticated','public.organization_user_permissions','SELECT'), false, 'el navegador no lee asignaciones directamente');
select is(has_function_privilege('authenticated','public.admin_list_user_access(uuid)','EXECUTE'), false, 'authenticated no ejecuta administración privada');
select is(has_function_privilege('service_role','public.admin_list_user_access(uuid)','EXECUTE'), true, 'service_role ejecuta administración privada');

insert into public.organizations(id,name,slug) values
  ('da100000-0000-4000-8000-000000000001','Acceso directo uno','acceso-directo-uno'),
  ('da100000-0000-4000-8000-000000000002','Acceso directo dos','acceso-directo-dos');
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values
  ('da200000-0000-4000-8000-000000000001','admin.directo@test.local','{"full_name":"Admin Directo"}',now(),now()),
  ('da200000-0000-4000-8000-000000000002','operador.directo@test.local','{"full_name":"Operador Directo"}',now(),now()),
  ('da200000-0000-4000-8000-000000000003','segundo.admin@test.local','{"full_name":"Segundo Admin"}',now(),now());

select public.platform_bootstrap_organization_admin('acceso-directo-uno','da200000-0000-4000-8000-000000000001');

select throws_ok(
  $$select public.admin_create_user_membership('da200000-0000-4000-8000-000000000001','da200000-0000-4000-8000-000000000002',false,'{}'::text[])$$,
  'P0001','AT_LEAST_ONE_OPERATIONAL_PERMISSION_REQUIRED','un operador requiere al menos una capacidad'
);
select throws_ok(
  $$select public.admin_create_user_membership('da200000-0000-4000-8000-000000000001','da200000-0000-4000-8000-000000000002',false,array['USERS_MANAGE'])$$,
  'P0001','INVALID_OR_INACTIVE_PERMISSION','USERS_MANAGE no se concede directamente'
);
insert into public.permissions(code,name,description) values('INTERNAL_TEST_PERMISSION','Interno','No delegable');
select throws_ok(
  $$select public.normalize_operational_permission_codes(array['INTERNAL_TEST_PERMISSION'])$$,
  'P0001','INVALID_OR_INACTIVE_PERMISSION','un permiso interno futuro queda cerrado por defecto'
);
select throws_ok(
  $$select public.admin_create_user_membership('da200000-0000-4000-8000-000000000001','da200000-0000-4000-8000-000000000002',null,array['PRODUCTS_VIEW'])$$,
  '22023','USER_ACCESS_TYPE_REQUIRED','el tipo de acceso es obligatorio también en PostgreSQL'
);
select lives_ok(
  $$select public.admin_create_user_membership('da200000-0000-4000-8000-000000000001','da200000-0000-4000-8000-000000000002',false,array['PRODUCTS_MANAGE'])$$,
  'crea operador con permiso explícito'
);
select results_eq(
  $$select permission_code from public.organization_user_permissions where user_id='da200000-0000-4000-8000-000000000002' order by permission_code$$,
  $$values ('PRODUCTS_MANAGE'::text),('PRODUCTS_VIEW'::text)$$,
  'administrar incluye consultar mediante dependencia'
);
select is((select access_version from public.organization_memberships where user_id='da200000-0000-4000-8000-000000000002'),1::bigint,'el acceso comienza en versión uno');
select results_eq(
  $$select unnest(public.normalize_operational_permission_codes(array['PURCHASES_RECEIVE']))$$,
  $$values ('INVENTORY_MANAGE'::text),('INVENTORY_VIEW'::text),('PRODUCTS_VIEW'::text),('PURCHASES_RECEIVE'::text),('PURCHASES_VIEW'::text),('SUPPLIERS_VIEW'::text)$$,
  'las dependencias entre módulos se expanden transitivamente'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','da200000-0000-4000-8000-000000000002',true);
select results_eq('select unnest(public.current_user_permissions())', $$values ('PRODUCTS_MANAGE'::text),('PRODUCTS_VIEW'::text)$$, 'la sesión obtiene permisos directos');
select is(public.has_organization_permission('da100000-0000-4000-8000-000000000001','PRODUCTS_MANAGE'),true,'RLS reconoce permisos directos');
select is(public.has_organization_permission('da100000-0000-4000-8000-000000000002','PRODUCTS_MANAGE'),false,'el permiso no cruza organizaciones');
select results_eq(
  $$select unnest(public.current_user_organization_ids_with_permission('PRODUCTS_VIEW'))$$,
  $$values ('da100000-0000-4000-8000-000000000001'::uuid)$$,
  'la autorización optimizada conserva la organización permitida'
);
select is(
  cardinality(public.current_user_organization_ids_with_permission('INVENTORY_VIEW')),
  0,
  'la autorización optimizada no concede módulos ajenos'
);
reset role;

select lives_ok(
  $$select public.admin_update_user_membership('da200000-0000-4000-8000-000000000001','da200000-0000-4000-8000-000000000002','operador.directo@test.local','operador.directo@test.local','Operador Directo','',false,array['INVENTORY_MANAGE'],1)$$,
  'actualiza perfil y permisos atómicamente'
);
select is((select access_version from public.organization_memberships where user_id='da200000-0000-4000-8000-000000000002'),2::bigint,'editar incrementa la versión');
select throws_ok(
  $$select public.admin_update_user_membership('da200000-0000-4000-8000-000000000001','da200000-0000-4000-8000-000000000002','operador.directo@test.local','operador.directo@test.local','Cambio obsoleto','',false,array['SALES_VIEW'],1)$$,
  '40001','USER_ACCESS_STALE_WRITE','rechaza una escritura obsoleta'
);
select is(
  (select is_admin from public.admin_list_user_access('da200000-0000-4000-8000-000000000001') where user_id='da200000-0000-4000-8000-000000000002'),
  false,
  'lista el tipo de acceso operativo'
);
select is(
  (select permission_codes from public.admin_list_user_access('da200000-0000-4000-8000-000000000001') where user_id='da200000-0000-4000-8000-000000000002'),
  array['INVENTORY_MANAGE','INVENTORY_VIEW']::text[],
  'lista los permisos operativos efectivos'
);
select is(
  (select access_version from public.admin_list_user_access('da200000-0000-4000-8000-000000000001') where user_id='da200000-0000-4000-8000-000000000002'),
  2::bigint,
  'lista la versión de acceso'
);
select lives_ok(
  $$select public.admin_create_user_membership('da200000-0000-4000-8000-000000000001','da200000-0000-4000-8000-000000000003',true,'{}'::text[])$$,
  'crea un segundo administrador sin permisos directos'
);
select throws_ok(
  $$select public.admin_update_user_membership('da200000-0000-4000-8000-000000000001','da200000-0000-4000-8000-000000000003','segundo.admin@test.local','segundo.admin@test.local','Segundo Admin','',true,array['PRODUCTS_VIEW'],1)$$,
  'P0001','ADMIN_DIRECT_PERMISSIONS_FORBIDDEN','ADMIN no mezcla permisos directos'
);
select lives_ok(
  $$select public.admin_update_user_membership('da200000-0000-4000-8000-000000000001','da200000-0000-4000-8000-000000000003','segundo.admin@test.local','segundo.admin@test.local','Segundo Admin','',false,array['SALES_MANAGE'],1)$$,
  'puede convertir otro administrador en operador cuando queda un ADMIN'
);
select ok((select count(*)>=3 from public.audit_events where organization_id='da100000-0000-4000-8000-000000000001' and entity_type='ORGANIZATION_MEMBERSHIP'),'los cambios de acceso dejan auditoría');

select * from finish();
rollback;
