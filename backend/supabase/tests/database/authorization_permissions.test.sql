begin;

select plan(29);

-- -------------------------------------------------------------------------
-- Estructura y privilegios
-- -------------------------------------------------------------------------

select has_table('public', 'permissions', 'existe el catálogo de permisos');
select has_table(
  'public',
  'role_permissions',
  'existe la asignación de permisos a roles'
);
select has_function(
  'public',
  'current_user_permissions',
  array[]::text[],
  'existe la consulta de permisos de la identidad actual'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.permissions'::regclass
  ),
  true,
  'permissions tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.role_permissions'::regclass
  ),
  true,
  'role_permissions tiene RLS'
);

select is(
  has_table_privilege('authenticated', 'public.permissions', 'SELECT'),
  false,
  'authenticated no consulta directamente el catálogo de permisos'
);

select is(
  has_table_privilege('authenticated', 'public.role_permissions', 'SELECT'),
  false,
  'authenticated no consulta directamente las asignaciones'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.current_user_permissions()',
    'EXECUTE'
  ),
  true,
  'authenticated puede consultar únicamente sus permisos efectivos'
);

select is(
  has_function_privilege(
    'anon',
    'public.current_user_permissions()',
    'EXECUTE'
  ),
  false,
  'anon no puede consultar permisos efectivos'
);

select is(
  (select count(*) from public.permissions where code = 'USERS_MANAGE'),
  1::bigint,
  'existe el permiso inicial USERS_MANAGE'
);

select is(
  (
    select count(*)
    from public.role_permissions
    where role_code = 'ADMIN'
      and permission_code = 'USERS_MANAGE'
  ),
  1::bigint,
  'ADMIN recibe USERS_MANAGE'
);

select is(
  (
    select count(*)
    from public.role_permissions
    where role_code <> 'ADMIN'
      and permission_code = 'USERS_MANAGE'
  ),
  0::bigint,
  'USERS_MANAGE sigue reservado exclusivamente a ADMIN'
);

select is(
  (
    select indisunique
    from pg_catalog.pg_index
    where indexrelid =
      'public.organization_memberships_one_active_per_user_idx'::regclass
  ),
  true,
  'la membresía activa está protegida por un índice único'
);

select is(
  (
    select pg_get_expr(indexprs, indrelid)
    from pg_catalog.pg_index
    where indexrelid =
      'public.organization_memberships_one_active_per_user_idx'::regclass
  ),
  null::text,
  'el índice utiliza directamente user_id'
);

select is(
  (
    select pg_get_expr(indpred, indrelid)
    from pg_catalog.pg_index
    where indexrelid =
      'public.organization_memberships_one_active_per_user_idx'::regclass
  ),
  'is_active',
  'el índice único solo incluye membresías activas'
);

-- -------------------------------------------------------------------------
-- Identidades y organizaciones de prueba
-- -------------------------------------------------------------------------

insert into public.organizations (id, name, slug)
values
  (
    'd1111111-1111-4111-8111-111111111111',
    'Organización autorización uno',
    'autorizacion-uno'
  ),
  (
    'd2222222-2222-4222-8222-222222222222',
    'Organización autorización dos',
    'autorizacion-dos'
  );

insert into auth.users (
  id,
  email,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    'e1111111-1111-4111-8111-111111111111',
    'admin.permissions@test.local',
    '{"full_name":"Administrador permisos"}'::jsonb,
    now(),
    now()
  ),
  (
    'e2222222-2222-4222-8222-222222222222',
    'ventas.permissions@test.local',
    '{"full_name":"Ventas sin permisos"}'::jsonb,
    now(),
    now()
  );

insert into public.organization_memberships (
  organization_id,
  user_id,
  created_by
)
values
  (
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    null
  ),
  (
    'd1111111-1111-4111-8111-111111111111',
    'e2222222-2222-4222-8222-222222222222',
    null
  );

insert into public.user_roles (
  organization_id,
  user_id,
  role_code,
  assigned_by
)
values
  (
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    'ADMIN',
    null
  ),
  (
    'd1111111-1111-4111-8111-111111111111',
    'e2222222-2222-4222-8222-222222222222',
    'VENTAS',
    null
  );

select throws_ok(
  $$
    insert into public.organization_memberships (
      organization_id,
      user_id,
      created_by
    )
    values (
      'd2222222-2222-4222-8222-222222222222',
      'e1111111-1111-4111-8111-111111111111',
      null
    )
  $$,
  '23505',
  null,
  'una identidad no puede tener dos membresías activas'
);

update public.organization_memberships
set
  is_active = false,
  deactivated_at = now()
where organization_id = 'd1111111-1111-4111-8111-111111111111'
  and user_id = 'e1111111-1111-4111-8111-111111111111';

select lives_ok(
  $$
    insert into public.organization_memberships (
      organization_id,
      user_id,
      created_by
    )
    values (
      'd2222222-2222-4222-8222-222222222222',
      'e1111111-1111-4111-8111-111111111111',
      null
    )
  $$,
  'se puede activar otra organización conservando la membresía histórica'
);

select is(
  (
    select count(*)
    from public.organization_memberships
    where user_id = 'e1111111-1111-4111-8111-111111111111'
  ),
  2::bigint,
  'la membresía inactiva se conserva'
);

select is(
  (
    select count(*)
    from public.organization_memberships
    where user_id = 'e1111111-1111-4111-8111-111111111111'
      and is_active
  ),
  1::bigint,
  'solo queda una membresía activa'
);

-- El rol ADMIN se traslada a la organización activa para comprobar la RPC.
insert into public.user_roles (
  organization_id,
  user_id,
  role_code,
  assigned_by
)
values (
  'd2222222-2222-4222-8222-222222222222',
  'e1111111-1111-4111-8111-111111111111',
  'ADMIN',
  null
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1111111-1111-4111-8111-111111111111',
  true
);

select is(
  public.current_user_permissions(),
  array[
    'CUSTOMERS_EXPORT',
    'CUSTOMERS_MANAGE',
    'CUSTOMERS_VIEW',
    'DISTRIBUTION_MANAGE',
    'DISTRIBUTION_VIEW',
    'INVENTORY_MANAGE',
    'INVENTORY_VIEW',
    'PRODUCTS_MANAGE',
    'PRODUCTS_VIEW',
    'PURCHASES_MANAGE',
    'PURCHASES_RECEIVE',
    'PURCHASES_VIEW',
    'REPAIRS_APPROVE_QUOTE',
    'REPAIRS_ASSIGN',
    'REPAIRS_CHANGE_STATUS',
    'REPAIRS_CREATE',
    'REPAIRS_DELIVER',
    'REPAIRS_UPDATE',
    'REPAIRS_USE_PARTS',
    'REPAIRS_VIEW',
    'SUPPLIERS_MANAGE',
    'SUPPLIERS_VIEW',
    'USERS_MANAGE'
  ]::text[],
  'ADMIN obtiene sus permisos en la única organización activa'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e2222222-2222-4222-8222-222222222222',
  true
);

select is(
  public.current_user_permissions(),
  array[
    'CUSTOMERS_EXPORT',
    'CUSTOMERS_MANAGE',
    'CUSTOMERS_VIEW',
    'INVENTORY_VIEW',
    'PRODUCTS_VIEW',
    'REPAIRS_APPROVE_QUOTE',
    'REPAIRS_CREATE',
    'REPAIRS_UPDATE',
    'REPAIRS_VIEW'
  ]::text[],
  'VENTAS obtiene sus permisos comerciales y de consulta operativa'
);

reset role;

update public.organizations
set is_active = false
where id = 'd2222222-2222-4222-8222-222222222222';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1111111-1111-4111-8111-111111111111',
  true
);

select is(
  public.current_user_permissions(),
  '{}'::text[],
  'una organización inactiva no concede permisos'
);

reset role;

update public.organizations
set is_active = true
where id = 'd2222222-2222-4222-8222-222222222222';

update public.organization_memberships
set
  is_active = false,
  deactivated_at = now()
where organization_id = 'd2222222-2222-4222-8222-222222222222'
  and user_id = 'e1111111-1111-4111-8111-111111111111';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1111111-1111-4111-8111-111111111111',
  true
);

select is(
  public.current_user_permissions(),
  '{}'::text[],
  'una membresía inactiva no concede permisos'
);

reset role;

update public.organization_memberships
set
  is_active = true,
  deactivated_at = null
where organization_id = 'd2222222-2222-4222-8222-222222222222'
  and user_id = 'e1111111-1111-4111-8111-111111111111';

update public.profiles
set
  is_active = false,
  deactivated_at = now()
where id = 'e1111111-1111-4111-8111-111111111111';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1111111-1111-4111-8111-111111111111',
  true
);

select is(
  public.current_user_permissions(),
  '{}'::text[],
  'un perfil inactivo no recibe permisos'
);

reset role;

update public.profiles
set
  is_active = true,
  deactivated_at = null
where id = 'e1111111-1111-4111-8111-111111111111';

update public.permissions
set is_active = false
where code = 'USERS_MANAGE';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1111111-1111-4111-8111-111111111111',
  true
);

select is(
  public.current_user_permissions(),
  array[
    'CUSTOMERS_EXPORT',
    'CUSTOMERS_MANAGE',
    'CUSTOMERS_VIEW',
    'DISTRIBUTION_MANAGE',
    'DISTRIBUTION_VIEW',
    'INVENTORY_MANAGE',
    'INVENTORY_VIEW',
    'PRODUCTS_MANAGE',
    'PRODUCTS_VIEW',
    'PURCHASES_MANAGE',
    'PURCHASES_RECEIVE',
    'PURCHASES_VIEW',
    'REPAIRS_APPROVE_QUOTE',
    'REPAIRS_ASSIGN',
    'REPAIRS_CHANGE_STATUS',
    'REPAIRS_CREATE',
    'REPAIRS_DELIVER',
    'REPAIRS_UPDATE',
    'REPAIRS_USE_PARTS',
    'REPAIRS_VIEW',
    'SUPPLIERS_MANAGE',
    'SUPPLIERS_VIEW'
  ]::text[],
  'desactivar USERS_MANAGE no elimina otros permisos activos'
);

reset role;

update public.permissions
set is_active = true
where code = 'USERS_MANAGE';

update public.roles
set is_active = false
where code = 'ADMIN';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1111111-1111-4111-8111-111111111111',
  true
);

select is(
  public.current_user_permissions(),
  '{}'::text[],
  'un rol inactivo no concede permisos'
);

reset role;

set local role service_role;

select throws_ok(
  $$
    select public.resolve_admin_organization(
      'e1111111-1111-4111-8111-111111111111'
    )
  $$,
  'P0001',
  'ADMIN_ACCESS_REQUIRED',
  'un rol inactivo no puede ejecutar operaciones administrativas'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1111111-1111-4111-8111-111111111111',
  true
);

select is(
  public.is_organization_admin(
    'd2222222-2222-4222-8222-222222222222'
  ),
  false,
  'un rol ADMIN inactivo no conserva privilegios RLS de administrador'
);

select is(
  public.can_manage_user(
    'e2222222-2222-4222-8222-222222222222'
  ),
  false,
  'un rol inactivo no puede consultar perfiles administrados'
);

reset role;

select * from finish();

rollback;
