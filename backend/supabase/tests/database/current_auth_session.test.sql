begin;

select plan(5);

select has_function(
  'public',
  'current_auth_session_is_active',
  array[]::text[],
  'existe la validación de la sesión autenticada actual'
);

select is(
  has_function_privilege(
    'anon',
    'public.current_auth_session_is_active()',
    'EXECUTE'
  ),
  false,
  'anon no puede validar sesiones'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.current_auth_session_is_active()',
    'EXECUTE'
  ),
  true,
  'authenticated puede validar únicamente su sesión actual'
);

select is(
  public.current_auth_session_is_active(),
  false,
  'sin un JWT autenticado no existe una sesión actual válida'
);

insert into auth.users (id, email, created_at, updated_at)
values (
  '71717171-7171-4171-8171-717171717171',
  'sesion.actual@test.local',
  now(),
  now()
);

insert into auth.sessions (id, user_id, created_at, updated_at)
values (
  '72727272-7272-4272-8272-727272727272',
  '71717171-7171-4171-8171-717171717171',
  now(),
  now()
);

select set_config(
  'request.jwt.claims',
  '{"sub":"71717171-7171-4171-8171-717171717171","role":"authenticated","session_id":"72727272-7272-4272-8272-727272727272"}',
  true
);
set local role authenticated;

select is(
  public.current_auth_session_is_active(),
  true,
  'el JWT autenticado reconoce únicamente su sesión existente'
);

reset role;

select * from finish();

rollback;
