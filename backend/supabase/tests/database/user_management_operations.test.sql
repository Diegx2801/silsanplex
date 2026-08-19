begin;

select plan(21);

select has_function(
  'public',
  'admin_list_users',
  array['uuid'],
  'existe la operación para listar usuarios'
);

select has_function(
  'public',
  'admin_create_user_membership',
  array['uuid', 'uuid', 'text[]'],
  'existe la operación para crear membresías'
);

select has_function(
  'public',
  'admin_update_user_membership',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text[]'],
  'existe la operación para actualizar usuarios'
);

select has_function(
  'public',
  'admin_set_user_membership_status',
  array['uuid', 'uuid', 'boolean'],
  'existe la operación para activar y desactivar usuarios'
);

select has_function(
  'public',
  'admin_record_invitation_resent',
  array['uuid', 'uuid'],
  'existe la auditoría para reenvíos de invitación'
);

select has_function(
  'public',
  'admin_list_user_confirmation_statuses',
  array['uuid'],
  'existe la consulta privada de estados de invitación'
);

select has_function(
  'public',
  'admin_record_password_reset',
  array['uuid', 'uuid'],
  'existe la operación de auditoría para recuperar contraseñas'
);

select has_function(
  'public',
  'platform_bootstrap_organization_admin',
  array['text', 'uuid'],
  'existe la operación privada de bootstrap'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.admin_list_users(uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated no ejecuta operaciones administrativas directamente'
);

select is(
  has_function_privilege(
    'service_role',
    'public.admin_list_users(uuid)',
    'EXECUTE'
  ),
  true,
  'service_role puede ejecutar operaciones administrativas'
);

insert into public.organizations (id, name, slug)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'Organización de operaciones de prueba',
  'operaciones-test'
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
    '41111111-1111-4111-8111-111111111111',
    'bootstrap.admin@test.local',
    '{"full_name":"Administrador inicial"}'::jsonb,
    now(),
    now()
  ),
  (
    '42222222-2222-4222-8222-222222222222',
    'usuario.operativo@test.local',
    '{"full_name":"Usuario operativo"}'::jsonb,
    now(),
    now()
  );

select public.platform_bootstrap_organization_admin(
  'operaciones-test',
  '41111111-1111-4111-8111-111111111111'
);

select is(
  (
    select count(*)
    from public.user_roles
    where user_id = '41111111-1111-4111-8111-111111111111'
      and role_code = 'ADMIN'
  ),
  1::bigint,
  'el bootstrap asigna el rol ADMIN'
);

select public.platform_bootstrap_organization_admin(
  'operaciones-test',
  '41111111-1111-4111-8111-111111111111'
);

select is(
  (
    select count(*)
    from public.organization_memberships
    where user_id = '41111111-1111-4111-8111-111111111111'
  ),
  1::bigint,
  'el bootstrap es idempotente para el mismo administrador'
);

select public.admin_create_user_membership(
  '41111111-1111-4111-8111-111111111111',
  '42222222-2222-4222-8222-222222222222',
  array['VENTAS', 'ALMACEN']
);

select is(
  (
    select count(*)
    from public.user_roles
    where user_id = '42222222-2222-4222-8222-222222222222'
  ),
  2::bigint,
  'un administrador asigna múltiples roles'
);

select is(
  (
    select count(*)
    from public.admin_list_users(
      '41111111-1111-4111-8111-111111111111'
    )
  ),
  2::bigint,
  'el administrador lista únicamente los usuarios de su organización'
);

select throws_ok(
  $$
    select public.admin_list_users(
      '42222222-2222-4222-8222-222222222222'
    )
  $$,
  'P0001',
  'ADMIN_ACCESS_REQUIRED',
  'un usuario operativo no puede usar las operaciones administrativas'
);

select throws_ok(
  $$
    select public.admin_set_user_membership_status(
      '41111111-1111-4111-8111-111111111111',
      '41111111-1111-4111-8111-111111111111',
      false
    )
  $$,
  'P0001',
  'SELF_DEACTIVATION_FORBIDDEN',
  'el administrador no puede desactivarse a sí mismo'
);

select throws_ok(
  $$
    select public.admin_update_user_membership(
      '41111111-1111-4111-8111-111111111111',
      '41111111-1111-4111-8111-111111111111',
      'bootstrap.admin@test.local',
      'bootstrap.admin@test.local',
      'Administrador inicial',
      '',
      array['GERENCIA']
    )
  $$,
  'P0001',
  'SELF_ADMIN_ROLE_REMOVAL_FORBIDDEN',
  'el administrador no puede quitarse su propio rol'
);

select lives_ok(
  $$
    select public.admin_update_user_membership(
      '41111111-1111-4111-8111-111111111111',
      '42222222-2222-4222-8222-222222222222',
      'usuario.operativo@test.local',
      'usuario.operativo@test.local',
      'Usuario operativo actualizado',
      '999888777',
      array['ADMIN', 'VENTAS']
    )
  $$,
  'un administrador puede promover a otro usuario'
);

select lives_ok(
  $$
    select public.admin_set_user_membership_status(
      '41111111-1111-4111-8111-111111111111',
      '42222222-2222-4222-8222-222222222222',
      false
    )
  $$,
  'se puede desactivar otro administrador si queda uno activo'
);

select is(
  (
    select is_active
    from public.organization_memberships
    where user_id = '42222222-2222-4222-8222-222222222222'
  ),
  false,
  'la desactivación es reversible y no elimina la membresía'
);

select ok(
  (
    select count(*) >= 4
    from public.audit_events
    where organization_id = (
      select id from public.organizations where slug = 'operaciones-test'
    )
  ),
  'las operaciones sensibles generan auditoría'
);

select * from finish();

rollback;
