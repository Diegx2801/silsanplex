-- D01: database authorization must outlive neither the Auth session nor admin access.
begin;
select no_plan();

create temporary table d01_ids(label text primary key, id uuid not null default gen_random_uuid());
insert into d01_ids(label) values
  ('org'), ('other-org'), ('admin'), ('ordinary'), ('foreign-admin'),
  ('unknown-session'), ('fresh-session'), ('absent-delivery');
create function pg_temp.d01_id(label text) returns uuid language sql stable as $$
  select id from d01_ids where d01_ids.label = $1;
$$;
create function pg_temp.d01_claim(actor text, session_label text) returns text language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', pg_temp.d01_id(actor),
    'session_id', pg_temp.d01_id(session_label),
    'exp', extract(epoch from now() + interval '1 hour')::bigint
  )::text, true);
$$;
grant select on d01_ids to authenticated;

insert into public.organizations(id, name, slug)
select id, 'D01 disposable tenant', 'd01-' || id from d01_ids where label in ('org', 'other-org');
insert into auth.users(id, email, raw_user_meta_data)
select id, id || '@example.invalid', jsonb_build_object('full_name', 'D01 ' || label)
from d01_ids where label in ('admin', 'ordinary', 'foreign-admin');
insert into auth.sessions(id, user_id, created_at, updated_at)
select id, id, now(), now() from d01_ids where label in ('admin', 'ordinary', 'foreign-admin');
insert into public.organization_memberships(organization_id, user_id)
select pg_temp.d01_id(case when label = 'foreign-admin' then 'other-org' else 'org' end), id
from d01_ids where label in ('admin', 'ordinary', 'foreign-admin');
insert into public.user_roles(organization_id, user_id, role_code)
select pg_temp.d01_id(case when label = 'foreign-admin' then 'other-org' else 'org' end), id,
  case when label = 'ordinary' then 'VENTAS' else 'ADMIN' end
from d01_ids where label in ('admin', 'ordinary', 'foreign-admin');

-- The shared table must protect every module, not just repair events.
insert into public.audit_events(organization_id, actor_user_id, action, entity_type, entity_id)
select pg_temp.d01_id('org'), pg_temp.d01_id('admin'), 'D01_FIXTURE', entity, gen_random_uuid()::text
from unnest(array['ORGANIZATION_MEMBERSHIP', 'customer', 'inventory_movement', 'purchase_order', 'sale']) entity;
insert into public.audit_events(organization_id, actor_user_id, action, entity_type)
values (pg_temp.d01_id('other-org'), pg_temp.d01_id('foreign-admin'), 'D01_FIXTURE', 'customer'),
  (null, pg_temp.d01_id('admin'), 'D01_UNSCOPED_FIXTURE', 'system');

select pg_temp.d01_claim('admin', 'admin');
set local role authenticated;
select public.create_repair(jsonb_build_object(
  'organization_id', pg_temp.d01_id('org'), 'operation_key', gen_random_uuid(),
  'requester_type', 'internal', 'requesting_area', 'D01 laboratory',
  'equipment_type', 'external', 'external_equipment_description', 'D01 equipment',
  'problem_description', 'D01 session authorization fixture'
));
reset role;
create temporary table d01_before as select
  (select count(*) from public.audit_events where organization_id = pg_temp.d01_id('org')) as own_count,
  (select jsonb_agg(to_jsonb(e) order by e.id) from public.audit_events e
    where e.organization_id in (pg_temp.d01_id('org'), pg_temp.d01_id('other-org'))) as audit_rows;
grant select on d01_before to authenticated;

set local role authenticated;
select ok(public.current_auth_session_is_active(), 'active admin uses the existing Auth session helper');
select is((select count(*) from public.audit_events), (select own_count from d01_before),
  'active admin reads every module audit in their tenant, excluding foreign and unscoped events');
select is((select count(*) from public.repair_list where organization_id = pg_temp.d01_id('org')), 1::bigint,
  'active admin retains the protected repair read');
select is((select count(*) from public.audit_events where organization_id = pg_temp.d01_id('other-org')), 0::bigint,
  'explicit foreign organization filters do not cross RLS');
select lives_ok($$select * from public.list_distribution_inventory_movements(pg_temp.d01_id('org'), null)$$,
  'active authorized movement projection keeps its existing contract');
select lives_ok($$select * from public.list_distribution_delivery_inventory_trace(pg_temp.d01_id('org'))$$,
  'active authorized trace projection keeps its existing contract');
select throws_ok($$select * from public.list_distribution_delivery_status_history(pg_temp.d01_id('org'), pg_temp.d01_id('absent-delivery'))$$,
  'P0001', 'DISTRIBUTION_NOT_FOUND', 'active history reader still receives the existing not-found result');

select pg_temp.d01_claim('foreign-admin', 'foreign-admin');
select is((select count(*) from public.audit_events), 1::bigint, 'foreign administrator sees only their own event');
select is((select count(*) from public.audit_events where organization_id = pg_temp.d01_id('org')), 0::bigint,
  'foreign administrator cannot read the target tenant');
select throws_ok($$select * from public.list_distribution_delivery_status_history(pg_temp.d01_id('org'), pg_temp.d01_id('absent-delivery'))$$,
  '42501', 'DISTRIBUTION_FORBIDDEN', 'projected history preserves tenant authorization');
select pg_temp.d01_claim('ordinary', 'ordinary');
select ok(public.current_auth_session_is_active(), 'ordinary user has a real active session');
select is((select count(*) from public.audit_events), 0::bigint, 'active ordinary user is not promoted to audit administrator');

reset role;
delete from public.user_roles where organization_id = pg_temp.d01_id('org')
  and user_id = pg_temp.d01_id('admin') and role_code = 'ADMIN';
select pg_temp.d01_claim('admin', 'admin');
set local role authenticated;
select ok(public.current_auth_session_is_active(), 'administrative authority can be revoked while the session remains active');
select is((select count(*) from public.audit_events), 0::bigint, 'revoked administrative authority is checked at query time');
reset role;
insert into public.user_roles(organization_id, user_id, role_code)
values (pg_temp.d01_id('org'), pg_temp.d01_id('admin'), 'ADMIN');

select pg_temp.d01_claim('admin', 'unknown-session');
set local role authenticated;
select is(public.current_auth_session_is_active(), false, 'unknown session is inactive');
select is((select count(*) from public.audit_events), 0::bigint, 'unknown session cannot read audit');
select pg_temp.d01_claim('admin', null);
select is((select count(*) from public.audit_events), 0::bigint, 'missing session claim cannot read audit');
select pg_temp.d01_claim('admin', 'ordinary');
select is((select count(*) from public.audit_events), 0::bigint, 'another user session cannot authenticate an administrator');

reset role;
delete from auth.sessions where id = pg_temp.d01_id('admin');
select pg_temp.d01_claim('admin', 'admin');
set local role authenticated;
select ok((auth.jwt() ->> 'exp')::bigint > extract(epoch from now()), 'revoked-session claims are still unexpired');
select ok(public.is_organization_admin(pg_temp.d01_id('org')), 'admin role remains active: denial is specifically session-based');
select is(public.current_auth_session_is_active(), false, 'deleted Auth session is inactive');
select is((select count(*) from public.audit_events), 0::bigint, 'D01: revoked administrator cannot read global audit');
select is((select count(*) from public.repair_list where organization_id = pg_temp.d01_id('org')), 0::bigint,
  'audit and repair reads agree after revocation');
select is((select count(*) from public.audit_events where organization_id = pg_temp.d01_id('org')), 0::bigint,
  'retrying the same scoped audit read cannot recover revoked access');
select throws_ok($$select * from public.list_distribution_delivery_status_history(pg_temp.d01_id('org'), pg_temp.d01_id('absent-delivery'))$$,
  '42501', 'DISTRIBUTION_FORBIDDEN', 'SECURITY DEFINER history cannot bypass revoked-session protection');
select throws_ok($$select * from public.list_distribution_inventory_movements(pg_temp.d01_id('org'), null)$$,
  '42501', 'DISTRIBUTION_FORBIDDEN', 'movement projection cannot expose audit correlation after revocation');
select throws_ok($$select * from public.list_distribution_delivery_inventory_trace(pg_temp.d01_id('org'))$$,
  '42501', 'DISTRIBUTION_FORBIDDEN', 'trace projection cannot expose audit correlation after revocation');

reset role;
insert into auth.sessions(id, user_id, created_at, updated_at)
values (pg_temp.d01_id('fresh-session'), pg_temp.d01_id('admin'), now(), now());
set local role authenticated;
select is((select count(*) from public.audit_events), 0::bigint, 'a new session does not revive the old session claims');
select pg_temp.d01_claim('admin', 'fresh-session');
select is((select count(*) from public.audit_events), (select own_count from d01_before),
  'a fresh active admin session can read the unchanged history');
reset role;

select is((select jsonb_agg(to_jsonb(e) order by e.id) from public.audit_events e
    where e.organization_id in (pg_temp.d01_id('org'), pg_temp.d01_id('other-org'))),
  (select audit_rows from d01_before), 'all query, role and session changes leave historical audit rows unchanged');
select is((select count(*) from pg_catalog.pg_policy where polrelid = 'public.audit_events'::regclass), 1::bigint,
  'D01 changes the existing policy without a permissive OR alternative');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass), 'audit RLS stays enabled');
select ok(has_table_privilege('authenticated', 'public.audit_events', 'SELECT'), 'authenticated keeps SELECT subject to RLS');
select ok(not has_table_privilege('anon', 'public.audit_events', 'SELECT'), 'anon gains no direct audit SELECT');
select ok(not has_table_privilege('service_role', 'public.audit_events', 'SELECT'), 'service_role gains no direct audit SELECT');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'INSERT,UPDATE,DELETE'), 'authenticated gains no audit DML');
select ok(not has_table_privilege('service_role', 'public.audit_events', 'INSERT,UPDATE,DELETE'), 'service_role gains no audit DML');
select ok(not exists (
  select 1 from pg_proc p where p.oid in (
    'public.list_distribution_delivery_status_history(uuid,uuid)'::regprocedure,
    'public.list_distribution_inventory_movements(uuid,uuid,uuid)'::regprocedure,
    'public.list_distribution_delivery_inventory_trace(uuid,uuid)'::regprocedure
  ) and (not has_function_privilege('authenticated', p.oid, 'EXECUTE')
    or has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('service_role', p.oid, 'EXECUTE')
    or not p.prosecdef or not p.proconfig @> array['search_path=""'])
), 'projected audit RPCs retain their exact public privilege boundary and pinned search_path');
select ok(not exists (
  select 1 from pg_depend d join pg_rewrite r on r.oid = d.objid join pg_class c on c.oid = r.ev_class
  where d.refobjid = 'public.audit_events'::regclass and c.relkind in ('v', 'm')
    and has_table_privilege('authenticated', c.oid, 'SELECT')
    and not coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']
), 'no publicly readable owner-rights view exposes global audit outside its RLS');

select * from finish();
rollback;
