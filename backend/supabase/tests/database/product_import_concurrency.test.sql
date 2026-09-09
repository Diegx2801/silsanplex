create temporary table c2_import_extension_state (was_installed boolean not null);
insert into c2_import_extension_state
select exists (select 1 from pg_catalog.pg_extension where extname = 'dblink');

create extension if not exists dblink with schema extensions;

select no_plan();

begin;
insert into public.organizations (id, name, slug) values
  ('c2300000-0000-4000-8000-000000000001', 'C2 concurrencia uno', 'c2-concurrencia-uno'),
  ('c2300000-0000-4000-8000-000000000002', 'C2 concurrencia dos', 'c2-concurrencia-dos');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('c2400000-0000-4000-8000-000000000001', 'c2.concurrency.one@test.local', '{}', now(), now()),
  ('c2400000-0000-4000-8000-000000000002', 'c2.concurrency.two@test.local', '{}', now(), now());
insert into public.organization_memberships (organization_id, user_id) values
  ('c2300000-0000-4000-8000-000000000001', 'c2400000-0000-4000-8000-000000000001'),
  ('c2300000-0000-4000-8000-000000000002', 'c2400000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('c2300000-0000-4000-8000-000000000001', 'c2400000-0000-4000-8000-000000000001', 'LOGISTICA'),
  ('c2300000-0000-4000-8000-000000000002', 'c2400000-0000-4000-8000-000000000002', 'LOGISTICA');
commit;

create schema c2_import_concurrency_test;
create function c2_import_concurrency_test.run_import(
  requested_organization_id uuid,
  requested_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  import_result jsonb;
  actor_id uuid := case
    when requested_organization_id = 'c2300000-0000-4000-8000-000000000001'
      then 'c2400000-0000-4000-8000-000000000001'::uuid
    else 'c2400000-0000-4000-8000-000000000002'::uuid
  end;
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', actor_id,
      'role', 'authenticated'
    )::text,
    true
  );
  import_result := public.import_products(
    requested_organization_id,
    jsonb_build_object(
      'productos', jsonb_build_array(jsonb_build_object(
        'fila', 2,
        'codigo', requested_code,
        'descripcion', 'Producto concurrente ' || requested_code
      )),
      'precios', '[]'::jsonb
    )
  );
  return import_result ->> 'id_lote';
exception when others then
  return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;
revoke all on function c2_import_concurrency_test.run_import(uuid, text) from public;

select is(
  extensions.dblink_connect(
    'c2_import_same_a',
    'host=supabase_db_backend dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'abre sesion concurrente A para la misma organizacion'
);
select is(
  extensions.dblink_connect(
    'c2_import_same_b',
    'host=supabase_db_backend dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'abre sesion concurrente B para la misma organizacion'
);
select is(
  extensions.dblink_send_query(
    'c2_import_same_a',
    $$select c2_import_concurrency_test.run_import(
      'c2300000-0000-4000-8000-000000000001', 'C2-CONCURRENT'
    )$$
  ),
  1,
  'inicia importacion concurrente A del mismo SKU'
);
select is(
  extensions.dblink_send_query(
    'c2_import_same_b',
    $$select c2_import_concurrency_test.run_import(
      'c2300000-0000-4000-8000-000000000001', 'C2-CONCURRENT'
    )$$
  ),
  1,
  'inicia importacion concurrente B del mismo SKU'
);

create temporary table c2_same_results(result text);
insert into c2_same_results
select result from extensions.dblink_get_result('c2_import_same_a') response(result text);
insert into c2_same_results
select result from extensions.dblink_get_result('c2_import_same_b') response(result text);

select is(
  (select count(*) from c2_same_results where result not like 'error:%'),
  2::bigint,
  'ambas importaciones concurrentes terminan correctamente'
);
select is(
  (select min(result) from c2_same_results),
  (select max(result) from c2_same_results),
  'la misma organizacion y payload convergen al mismo lote idempotente'
);
select is(
  (select count(*) from public.products where organization_id = 'c2300000-0000-4000-8000-000000000001' and code = 'C2-CONCURRENT'),
  1::bigint,
  'la carrera del mismo SKU crea un solo producto'
);
select is(
  (select count(*) from public.product_import_batches where organization_id = 'c2300000-0000-4000-8000-000000000001'),
  1::bigint,
  'la carrera del mismo payload crea un solo lote'
);

select extensions.dblink_disconnect('c2_import_same_a');
select extensions.dblink_disconnect('c2_import_same_b');

select extensions.dblink_connect('c2_import_org_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('c2_import_org_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');
select is(
  extensions.dblink_send_query(
    'c2_import_org_a',
    $$select c2_import_concurrency_test.run_import(
      'c2300000-0000-4000-8000-000000000001', 'C2-ORG-SHARED'
    )$$
  ),
  1,
  'inicia importacion en organizacion A'
);
select is(
  extensions.dblink_send_query(
    'c2_import_org_b',
    $$select c2_import_concurrency_test.run_import(
      'c2300000-0000-4000-8000-000000000002', 'C2-ORG-SHARED'
    )$$
  ),
  1,
  'inicia importacion en organizacion B'
);

create temporary table c2_org_results(result text);
insert into c2_org_results
select result from extensions.dblink_get_result('c2_import_org_a') response(result text);
insert into c2_org_results
select result from extensions.dblink_get_result('c2_import_org_b') response(result text);

select is(
  (select count(*) from c2_org_results where result not like 'error:%'),
  2::bigint,
  'organizaciones distintas importan concurrentemente sin conflicto'
);
select is(
  (select count(*) from public.products where code = 'C2-ORG-SHARED' and organization_id in (
    'c2300000-0000-4000-8000-000000000001',
    'c2300000-0000-4000-8000-000000000002'
  )),
  2::bigint,
  'el mismo SKU queda aislado una vez por organizacion'
);

select extensions.dblink_disconnect('c2_import_org_a');
select extensions.dblink_disconnect('c2_import_org_b');

begin;
drop schema c2_import_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id in (
  'c2300000-0000-4000-8000-000000000001',
  'c2300000-0000-4000-8000-000000000002'
);
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id in (
  'c2300000-0000-4000-8000-000000000001',
  'c2300000-0000-4000-8000-000000000002'
);
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.product_import_batches where organization_id in (
  'c2300000-0000-4000-8000-000000000001',
  'c2300000-0000-4000-8000-000000000002'
);
delete from public.products where organization_id in (
  'c2300000-0000-4000-8000-000000000001',
  'c2300000-0000-4000-8000-000000000002'
);
delete from public.user_roles where organization_id in (
  'c2300000-0000-4000-8000-000000000001',
  'c2300000-0000-4000-8000-000000000002'
);
delete from public.organization_memberships where organization_id in (
  'c2300000-0000-4000-8000-000000000001',
  'c2300000-0000-4000-8000-000000000002'
);
delete from public.organizations where id in (
  'c2300000-0000-4000-8000-000000000001',
  'c2300000-0000-4000-8000-000000000002'
);
delete from auth.users where id in (
  'c2400000-0000-4000-8000-000000000001',
  'c2400000-0000-4000-8000-000000000002'
);
commit;

select * from finish();

do $$
begin
  if not (select was_installed from c2_import_extension_state) then
    drop extension dblink;
  end if;
end;
$$;
