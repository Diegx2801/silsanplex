begin;

select plan(38);

select has_column(
  'public',
  'profiles',
  'password_changed_at',
  'el perfil conserva el corte de sesiones previo al cambio de contraseña'
);
select has_column(
  'public',
  'profiles',
  'password_recovery_requested_at',
  'el perfil registra una solicitud de recuperación autorizada'
);
select has_function(
  'public',
  'current_user_password_setup_required',
  array[]::text[],
  'existe el estado de configuración para la sesión actual'
);
select has_function(
  'public',
  'current_auth_session_is_active',
  array[]::text[],
  'existe la barrera central de sesión'
);
select has_function(
  'public',
  'is_auth_session_current_after_password_change',
  array['uuid', 'uuid', 'boolean']::text[],
  'existe el RPC privado para validar sesiones posteriores al cambio'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.is_auth_session_current_after_password_change(uuid, uuid, boolean)',
    'EXECUTE'
  ),
  false,
  'el cliente no puede consultar el validador privado de sesiones'
);
select is(
  has_function_privilege(
    'service_role',
    'public.is_auth_session_current_after_password_change(uuid, uuid, boolean)',
    'EXECUTE'
  ),
  true,
  'solo las Edge Functions pueden validar sesiones en el backend'
);
select has_function(
  'public',
  'record_user_password_change',
  array['uuid']::text[],
  'existe el RPC privado para aplicar el corte de sesiones'
);
select has_function(
  'public',
  'complete_user_password_recovery',
  array['uuid']::text[],
  'existe el RPC privado para finalizar una recuperación'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.record_user_password_change(uuid)',
    'EXECUTE'
  ),
  false,
  'el cliente no puede invalidar sesiones llamando directamente al RPC'
);
select is(
  has_function_privilege(
    'service_role',
    'public.record_user_password_change(uuid)',
    'EXECUTE'
  ),
  true,
  'solo el backend confiable puede aplicar el corte de sesiones'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.complete_user_password_recovery(uuid)',
    'EXECUTE'
  ),
  false,
  'el usuario no puede borrar por su cuenta la solicitud de recuperación'
);
select is(
  has_function_privilege(
    'service_role',
    'public.complete_user_password_recovery(uuid)',
    'EXECUTE'
  ),
  true,
  'solo el backend confiable finaliza la recuperación'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.current_user_password_setup_required()',
    'EXECUTE'
  ),
  true,
  'el usuario autenticado puede consultar su propio estado de contraseña'
);
select is(
  has_function_privilege(
    'anon',
    'public.current_user_password_setup_required()',
    'EXECUTE'
  ),
  false,
  'anon no puede consultar el estado de contraseña de una sesión'
);

insert into auth.users (
  id, email, email_confirmed_at, encrypted_password,
  raw_user_meta_data, created_at, updated_at
)
values (
  'a6600000-0000-4000-8000-000000000001',
  'password-recovery@test.local',
  now(),
  'already-has-a-password',
  '{}'::jsonb,
  now(),
  now()
);
insert into auth.sessions (id, user_id, created_at, updated_at)
values (
  'a6600000-0000-4000-8000-000000000002',
  'a6600000-0000-4000-8000-000000000001',
  now(),
  now()
);
update public.profiles
set password_recovery_requested_at = now() - interval '5 minutes'
where id = 'a6600000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"a6600000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a6600000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1}]}',
  true
);
set local role authenticated;
select is(
  public.current_user_password_setup_required(),
  false,
  'una sesión normal no aparece como pendiente de recuperación'
);
select is(
  public.current_auth_session_is_active(),
  true,
  'una sesión normal conserva el acceso'
);
select is(
  (select count(*) from public.profiles where id = auth.uid()),
  1::bigint,
  'RLS permite los datos del perfil con una sesión normal'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a6600000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a6600000-0000-4000-8000-000000000002","amr":[{"method":"recovery","timestamp":2}]}',
  true
);
select is(
  public.current_user_password_setup_required(),
  true,
  'la sesión firmada como recovery exige cambiar contraseña'
);
select is(
  public.current_auth_session_is_active(),
  false,
  'la barrera central rechaza la sesión recovery aunque se cambie la URL'
);
select is(
  (select count(*) from public.profiles where id = auth.uid()),
  0::bigint,
  'RLS oculta los datos del perfil durante la sesión recovery'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a6600000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a6600000-0000-4000-8000-000000000002","amr":[{"method":"otp","timestamp":3}]}',
  true
);
select is(
  public.current_user_password_setup_required(),
  true,
  'una sesión otp reciente tras la solicitud entra al formulario de recuperación'
);
select is(
  public.current_auth_session_is_active(),
  false,
  'una sesión otp no obtiene acceso normal al cambiar la URL'
);
select is(
  (select count(*) from public.profiles where id = auth.uid()),
  0::bigint,
  'RLS oculta los datos del perfil durante una sesión otp'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
set local role service_role;
select ok(
  public.record_user_password_change(
    'a6600000-0000-4000-8000-000000000001'::uuid
  ) is not null,
  'el backend registra el cambio antes de actualizar la contraseña'
);
select is(
  public.is_auth_session_current_after_password_change(
    'a6600000-0000-4000-8000-000000000002'::uuid,
    'a6600000-0000-4000-8000-000000000001'::uuid,
    false
  ),
  false,
  'una sesión ordinaria anterior al cambio queda invalidada'
);
select is(
  public.is_auth_session_current_after_password_change(
    'a6600000-0000-4000-8000-000000000002'::uuid,
    'a6600000-0000-4000-8000-000000000001'::uuid,
    true
  ),
  true,
  'la sesión recovery puede reintentar el flujo si falla el cierre global'
);
select is(
  public.is_auth_session_current_after_password_change(
    'a6600000-0000-4000-8000-000000000002'::uuid,
    'a6600000-0000-4000-8000-000000000001'::uuid,
    true
  ),
  true,
  'una sesión otp emitida después de la solicitud puede cambiar contraseña'
);
update public.profiles
set password_recovery_requested_at = now() - interval '2 hours'
where id = 'a6600000-0000-4000-8000-000000000001';
select is(
  public.is_auth_session_current_after_password_change(
    'a6600000-0000-4000-8000-000000000002'::uuid,
    'a6600000-0000-4000-8000-000000000001'::uuid,
    true
  ),
  false,
  'una solicitud vencida ya no autoriza la sesión otp'
);
update public.profiles
set password_recovery_requested_at = now() - interval '5 minutes'
where id = 'a6600000-0000-4000-8000-000000000001';
select ok(
  public.complete_user_password_recovery(
    'a6600000-0000-4000-8000-000000000001'::uuid
  ),
  'el backend cierra la solicitud al cambiar la contraseña'
);
select is(
  (select password_recovery_requested_at is null from public.profiles where id = 'a6600000-0000-4000-8000-000000000001'),
  true,
  'la recuperación completada no deja una solicitud pendiente'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"a6600000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a6600000-0000-4000-8000-000000000002","amr":[{"method":"otp","timestamp":3}]}',
  true
);
set local role authenticated;
select is(
  public.current_user_password_setup_required(),
  false,
  'un enlace recovery ya completado no puede volver a abrir el flujo de contraseña'
);
select is(
  public.current_auth_session_is_active(),
  false,
  'la sesión otp no obtiene acceso a la aplicación después del cambio'
);
select is(
  (select count(*) from public.profiles where id = auth.uid()),
  0::bigint,
  'RLS continúa bloqueando el enlace otp ya utilizado'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"a6600000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a6600000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":3}]}',
  true
);
set local role authenticated;
select is(
  public.current_auth_session_is_active(),
  false,
  'una sesión normal anterior al cambio se bloquea aunque conserve un JWT'
);
select is(
  (select count(*) from public.profiles where id = auth.uid()),
  0::bigint,
  'RLS bloquea el perfil en la sesión anterior al cambio'
);

reset role;
insert into auth.sessions (id, user_id, created_at, updated_at)
values (
  'a6600000-0000-4000-8000-000000000003',
  'a6600000-0000-4000-8000-000000000001',
  clock_timestamp(),
  clock_timestamp()
);
select set_config(
  'request.jwt.claims',
  '{"sub":"a6600000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a6600000-0000-4000-8000-000000000003","amr":[{"method":"password","timestamp":4}]}',
  true
);
set local role authenticated;
select is(
  public.current_auth_session_is_active(),
  true,
  'un inicio de sesión posterior al cambio recupera acceso normal'
);
select is(
  (select count(*) from public.profiles where id = auth.uid()),
  1::bigint,
  'RLS permite el perfil en la sesión nueva'
);

select * from finish();
rollback;
