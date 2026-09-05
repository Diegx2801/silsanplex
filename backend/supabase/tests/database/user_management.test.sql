begin;

select plan(55);

-- -------------------------------------------------------------------------
-- Estructura y datos base
-- -------------------------------------------------------------------------

select has_table('public', 'organizations', 'existe organizations');
select has_table('public', 'profiles', 'existe profiles');
select has_table('public', 'roles', 'existe roles');
select has_table(
  'public',
  'organization_memberships',
  'existe organization_memberships'
);
select has_table('public', 'user_roles', 'existe user_roles');
select has_table('public', 'audit_events', 'existe audit_events');

select has_column(
  'public',
  'organization_memberships',
  'is_active',
  'la membresía tiene estado independiente'
);

select has_column(
  'public',
  'profiles',
  'is_active',
  'el perfil conserva el bloqueo global de plataforma'
);

select has_column(
  'public',
  'profiles',
  'auth_confirmed_at',
  'el perfil registra la aceptación de la invitación'
);

select is(
  (
    select count(*)
    from public.organizations
    where slug = 'drogueria-silsan'
      and is_active
  ),
  1::bigint,
  'SILSAN existe como primera organización activa'
);

select is(
  (select count(*) from public.roles where is_active),
  8::bigint,
  'existen los siete roles iniciales y el técnico de reparaciones'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.organizations'::regclass
  ),
  true,
  'organizations tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.profiles'::regclass
  ),
  true,
  'profiles tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.roles'::regclass
  ),
  true,
  'roles tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.organization_memberships'::regclass
  ),
  true,
  'organization_memberships tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.user_roles'::regclass
  ),
  true,
  'user_roles tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.audit_events'::regclass
  ),
  true,
  'audit_events tiene RLS'
);

select is(
  has_table_privilege('anon', 'public.organizations', 'SELECT'),
  false,
  'anon no puede consultar organizaciones'
);

select is(
  has_table_privilege('authenticated', 'public.organizations', 'INSERT'),
  false,
  'un usuario autenticado no puede crear organizaciones'
);

select is(
  has_table_privilege(
    'authenticated',
    'public.organization_memberships',
    'UPDATE'
  ),
  false,
  'el frontend no puede activar ni desactivar membresías directamente'
);

select is(
  has_table_privilege('authenticated', 'public.audit_events', 'INSERT'),
  false,
  'el frontend no puede insertar auditoría directamente'
);

select has_function(
  'public', 'prevent_audit_event_mutation', array[]::text[],
  'existe la proteccion de auditoria inmutable'
);
select has_trigger(
  'public', 'audit_events', 'audit_events_immutable',
  'audit_events rechaza mutaciones despues de insertar'
);
select is(
  has_table_privilege('service_role', 'public.audit_events', 'SELECT'),
  false,
  'service_role no consulta auditoria directamente'
);
select is(
  has_table_privilege('service_role', 'public.audit_events', 'INSERT'),
  false,
  'service_role escribe auditoria solo mediante RPC confiables'
);
select is(
  has_table_privilege('service_role', 'public.audit_events', 'UPDATE'),
  false,
  'service_role no puede alterar auditoria'
);
select is(
  has_table_privilege('service_role', 'public.audit_events', 'DELETE'),
  false,
  'service_role no puede eliminar auditoria'
);
select is(
  has_table_privilege('authenticated', 'public.audit_events', 'SELECT'),
  true,
  'authenticated conserva lectura sujeta a RLS'
);
select is(
  has_table_privilege('authenticated', 'public.audit_events', 'UPDATE'),
  false,
  'authenticated no puede alterar auditoria'
);
select is(
  has_table_privilege('authenticated', 'public.audit_events', 'DELETE'),
  false,
  'authenticated no puede eliminar auditoria'
);
select is(
  (
    select constraint_definition.confdeltype
    from pg_catalog.pg_constraint constraint_definition
    where constraint_definition.conrelid = 'public.audit_events'::regclass
      and constraint_definition.conname = 'audit_events_actor_user_id_fkey'
  ),
  'r'::"char",
  'un actor auditado no se elimina ni pierde su identidad historica'
);

-- -------------------------------------------------------------------------
-- Usuarios y organizaciones de prueba
-- -------------------------------------------------------------------------

insert into auth.users (
  id,
  email,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'admin.silsan@test.local',
    '{"full_name":"Administrador SILSAN","phone":"999111111"}'::jsonb,
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'ventas.silsan@test.local',
    '{"full_name":"Usuario Ventas"}'::jsonb,
    now(),
    now()
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'admin.otro@test.local',
    '{"full_name":"Administrador Externo"}'::jsonb,
    now(),
    now()
  );

select is(
  (
    select auth_confirmed_at
    from public.profiles
    where id = '22222222-2222-4222-8222-222222222222'
  ),
  null::timestamptz,
  'un usuario sin confirmar conserva la invitación pendiente'
);

update auth.users
set email_confirmed_at = now()
where id = '22222222-2222-4222-8222-222222222222';

select isnt(
  (
    select auth_confirmed_at
    from public.profiles
    where id = '22222222-2222-4222-8222-222222222222'
  ),
  null::timestamptz,
  'la confirmación de Auth se sincroniza con el perfil'
);

select is(
  (
    select count(*)
    from public.profiles
    where id in (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333'
    )
  ),
  3::bigint,
  'el trigger crea un perfil por cada usuario de Auth'
);

select is(
  (
    select full_name
    from public.profiles
    where id = '11111111-1111-4111-8111-111111111111'
  ),
  'Administrador SILSAN',
  'el perfil conserva el nombre recibido desde Auth'
);

select is(
  (
    select phone
    from public.profiles
    where id = '11111111-1111-4111-8111-111111111111'
  ),
  '999111111',
  'el perfil conserva el teléfono recibido desde Auth'
);

insert into public.organizations (id, name, slug)
values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Organización SILSAN de prueba',
    'organizacion-silsan-test'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Organización externa de prueba',
    'organizacion-prueba'
  );

insert into public.organization_memberships (
  organization_id,
  user_id,
  created_by
)
values
  (
    (select id from public.organizations where slug = 'organizacion-silsan-test'),
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    (select id from public.organizations where slug = 'organizacion-silsan-test'),
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333',
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
    (select id from public.organizations where slug = 'organizacion-silsan-test'),
    '11111111-1111-4111-8111-111111111111',
    'ADMIN',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    (select id from public.organizations where slug = 'organizacion-silsan-test'),
    '22222222-2222-4222-8222-222222222222',
    'VENTAS',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    (select id from public.organizations where slug = 'organizacion-silsan-test'),
    '22222222-2222-4222-8222-222222222222',
    'ALMACEN',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333',
    'ADMIN',
    null
  );

select is(
  (
    select count(*)
    from public.user_roles
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  2::bigint,
  'una membresía puede tener varios roles'
);

insert into public.audit_events (
  organization_id,
  actor_user_id,
  action,
  entity_type,
  entity_id
)
values (
  (select id from public.organizations where slug = 'organizacion-silsan-test'),
  '11111111-1111-4111-8111-111111111111',
  'USER_CREATED',
  'PROFILE',
  '22222222-2222-4222-8222-222222222222'
);

select throws_ok($$
  update public.audit_events
  set metadata = jsonb_build_object('altered', true)
  where entity_id = '22222222-2222-4222-8222-222222222222'
$$, 'P0001', 'AUDIT_EVENT_IMMUTABLE', 'no permite alterar un evento de auditoria');

select throws_ok($$
  delete from public.audit_events
  where entity_id = '22222222-2222-4222-8222-222222222222'
$$, 'P0001', 'AUDIT_EVENT_IMMUTABLE', 'no permite eliminar un evento de auditoria');

select is(
  (
    select count(*)
    from public.audit_events
    where entity_id = '22222222-2222-4222-8222-222222222222'
  ),
  1::bigint,
  'el evento permanece intacto despues de los intentos de mutacion'
);

-- -------------------------------------------------------------------------
-- RLS: administrador de SILSAN
-- -------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select is(
  (select count(*) from public.organizations),
  1::bigint,
  'el administrador de SILSAN solo ve su organización'
);

select is(
  (select count(*) from public.profiles),
  2::bigint,
  'el administrador de SILSAN solo ve sus usuarios'
);

select is(
  (select count(*) from public.audit_events),
  1::bigint,
  'el administrador de SILSAN consulta su auditoría'
);

reset role;

-- -------------------------------------------------------------------------
-- RLS: usuario operativo de SILSAN
-- -------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

select is(
  (
    select count(*)
    from public.organizations
    where slug = 'organizacion-silsan-test'
  ),
  1::bigint,
  'un usuario activo accede a SILSAN'
);

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'un usuario operativo solo consulta su perfil'
);

select is(
  (select count(*) from public.audit_events),
  0::bigint,
  'un usuario operativo no consulta auditoría'
);

select is(
  (select count(*) from public.user_roles),
  2::bigint,
  'un usuario operativo consulta únicamente sus roles'
);

reset role;

-- -------------------------------------------------------------------------
-- RLS: aislamiento de otra organización
-- -------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

select is(
  (
    select count(*)
    from public.organizations
    where slug = 'organizacion-silsan-test'
  ),
  0::bigint,
  'otra organización no puede consultar SILSAN'
);

select is(
  (
    select count(*)
    from public.organizations
    where slug = 'organizacion-prueba'
  ),
  1::bigint,
  'el administrador externo consulta únicamente su organización'
);

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'el administrador externo no consulta perfiles de SILSAN'
);

reset role;

-- -------------------------------------------------------------------------
-- Desactivación por membresía
-- -------------------------------------------------------------------------

update public.organization_memberships
set
  is_active = false,
  deactivated_at = now()
where organization_id = (
  select id from public.organizations where slug = 'organizacion-silsan-test'
)
and user_id = '22222222-2222-4222-8222-222222222222';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

select is(
  public.is_organization_member(
    (select id from public.organizations where slug = 'organizacion-silsan-test')
  ),
  false,
  'desactivar la membresía revoca el acceso a SILSAN'
);

select is(
  (select count(*) from public.organizations),
  0::bigint,
  'la membresía inactiva no puede consultar la organización'
);

reset role;

-- -------------------------------------------------------------------------
-- Suspensión de organización
-- -------------------------------------------------------------------------

update public.organization_memberships
set
  is_active = true,
  deactivated_at = null
where organization_id = (
  select id from public.organizations where slug = 'organizacion-silsan-test'
)
and user_id = '22222222-2222-4222-8222-222222222222';

update public.organizations
set is_active = false
where slug = 'organizacion-silsan-test';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select is(
  public.is_organization_admin(
    (select id from public.organizations where slug = 'organizacion-silsan-test')
  ),
  false,
  'suspender SILSAN revoca las capacidades de su administrador'
);

select is(
  (select count(*) from public.organizations),
  0::bigint,
  'una organización suspendida no es visible para sus miembros'
);

reset role;

-- -------------------------------------------------------------------------
-- Bloqueo global de identidad
-- -------------------------------------------------------------------------

update public.profiles
set
  is_active = false,
  deactivated_at = now()
where id = '33333333-3333-4333-8333-333333333333';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

select is(
  public.is_active_user(),
  false,
  'el bloqueo global desactiva la identidad en toda la plataforma'
);

select * from finish();

rollback;
