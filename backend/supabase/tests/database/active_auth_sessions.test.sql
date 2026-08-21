begin;

select plan(4);

select has_function(
  'public',
  'is_auth_session_active',
  array['uuid', 'uuid'],
  'existe la verificación privada de sesiones activas'
);

select is(
  has_function_privilege(
    'anon',
    'public.is_auth_session_active(uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'anon no puede consultar sesiones activas'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.is_auth_session_active(uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated no puede consultar sesiones activas'
);

select is(
  has_function_privilege(
    'service_role',
    'public.is_auth_session_active(uuid,uuid)',
    'EXECUTE'
  ),
  true,
  'service_role puede verificar una sesión para operaciones sensibles'
);

select * from finish();

rollback;
