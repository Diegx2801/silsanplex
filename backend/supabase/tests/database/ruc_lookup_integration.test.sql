begin;

select plan(18);

select has_table('public', 'ruc_lookup_cache', 'existe caché RUC');
select has_table('public', 'ruc_lookup_rate_limits', 'existe límite de consultas');
select has_function(
  'public',
  'resolve_edge_user_organization_permission',
  array['uuid', 'text'],
  'existe resolución segura de organización'
);
select has_function(
  'public',
  'consume_ruc_lookup_rate_limit',
  array['uuid', 'uuid', 'integer', 'integer'],
  'existe cuota atómica'
);
select has_function(
  'public',
  'record_ruc_lookup_audit',
  array['uuid', 'uuid', 'text', 'text', 'boolean', 'boolean'],
  'existe auditoría de consultas'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.ruc_lookup_cache'::regclass),
  true,
  'la caché tiene RLS'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.ruc_lookup_rate_limits'::regclass),
  true,
  'la cuota tiene RLS'
);
select is(has_table_privilege('authenticated', 'public.ruc_lookup_cache', 'SELECT'), false, 'el navegador no lee la caché');
select is(has_table_privilege('authenticated', 'public.ruc_lookup_cache', 'INSERT'), false, 'el navegador no escribe la caché');
select is(has_table_privilege('service_role', 'public.ruc_lookup_cache', 'SELECT'), true, 'la función puede leer la caché');
select is(has_table_privilege('service_role', 'public.ruc_lookup_cache', 'INSERT'), true, 'la función puede escribir la caché');
select is(has_function_privilege('authenticated', 'public.resolve_edge_user_organization_permission(uuid,text)', 'EXECUTE'), false, 'la resolución no se expone al navegador');
select is(has_function_privilege('service_role', 'public.resolve_edge_user_organization_permission(uuid,text)', 'EXECUTE'), true, 'service_role resuelve permisos');

select throws_ok(
  $$ insert into public.ruc_lookup_cache (
       ruc, legal_name, source, source_checked_at, expires_at
     ) values (
       '123', 'Empresa inválida', 'APISPERU', now(), now() + interval '1 hour'
     ) $$,
  '23514', null, 'la caché rechaza un RUC inválido'
);

select lives_ok(
  $$ insert into public.ruc_lookup_cache (
       ruc, legal_name, taxpayer_status, domicile_condition, ubigeo_code,
       fiscal_address, source, source_checked_at, expires_at
     ) values (
       '20550154065', 'Empresa de prueba S.A.C.', 'ACTIVO', 'HABIDO', '150140',
       'Av. Prueba 123', 'APISPERU', now(), now() + interval '24 hours'
     ) $$,
  'la caché admite un resultado normalizado'
);

select is(
  (select count(*) from public.ruc_lookup_cache where ruc = '20550154065'),
  1::bigint,
  'almacena una sola entrada para el RUC consultado'
);
select is((select source from public.ruc_lookup_cache where ruc = '20550154065'), 'APISPERU', 'conserva la procedencia');
select is((select ubigeo_code from public.ruc_lookup_cache where ruc = '20550154065'), '150140', 'conserva el ubigeo');

select * from finish();
rollback;
