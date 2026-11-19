begin;

select plan(11);

select has_column(
  'public',
  'profiles',
  'password_setup_required',
  'el perfil registra si una invitación aún debe definir contraseña'
);
select has_function(
  'public',
  'current_user_password_setup_required',
  array[]::text[],
  'existe el RPC de estado de configuración para la sesión actual'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.complete_user_password_setup(uuid)',
    'EXECUTE'
  ),
  false,
  'un usuario autenticado no puede marcarse como configurado directamente'
);
select is(
  has_function_privilege(
    'service_role',
    'public.complete_user_password_setup(uuid)',
    'EXECUTE'
  ),
  true,
  'solo el backend confiable puede finalizar la configuración'
);

insert into auth.users (
  id, email, invited_at, email_confirmed_at, encrypted_password,
  raw_user_meta_data, created_at, updated_at
)
values (
  'a5500000-0000-4000-8000-000000000001',
  'password-setup@test.local',
  now(),
  now(),
  '',
  '{"silsan_password_setup_required":"true"}'::jsonb,
  now(),
  now()
);
insert into auth.sessions (id, user_id, created_at, updated_at)
values (
  'a5500000-0000-4000-8000-000000000002',
  'a5500000-0000-4000-8000-000000000001',
  now(),
  now()
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a5500000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a5500000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select is(
  public.current_user_password_setup_required(),
  true,
  'la sesión de una invitación debe pasar por establecer contraseña'
);
select is(
  public.current_auth_session_is_active(),
  false,
  'la sesión pendiente no pasa la barrera central de acceso'
);
select is(
  (select count(*) from public.profiles where id = auth.uid()),
  0::bigint,
  'RLS oculta los datos del perfil durante la configuración pendiente'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"a5500000-0000-4000-8000-000000000001","role":"service_role"}',
  true
);
set local role service_role;
select lives_ok(
  $$select public.complete_user_password_setup('a5500000-0000-4000-8000-000000000001'::uuid)$$,
  'el backend finaliza el estado pendiente tras actualizar la contraseña'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"a5500000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a5500000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select is(
  public.current_user_password_setup_required(),
  false,
  'la sesión deja de estar pendiente tras completar la configuración'
);
select is(
  public.current_auth_session_is_active(),
  true,
  'la sesión queda habilitada después de completar la contraseña'
);
select is(
  (select count(*) from public.profiles where id = auth.uid()),
  1::bigint,
  'RLS vuelve a permitir el acceso propio después de la configuración'
);

select * from finish();
rollback;
