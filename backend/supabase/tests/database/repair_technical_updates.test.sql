begin;

select plan(92);

-- ------------------------------------------------------------
-- Contract and privileges
-- ------------------------------------------------------------

select has_function(
  'public', 'record_repair_solution', array['jsonb'],
  'record_repair_solution(jsonb) exists'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.record_repair_solution(jsonb)'::regprocedure),
  true,
  'record_repair_solution is security definer'
);
select ok(
  pg_get_functiondef('public.record_repair_solution(jsonb)'::regprocedure)
    ~* $$SET search_path (TO|=) ''$$,
  'record_repair_solution fixes an empty search_path'
);
select is(
  has_function_privilege('authenticated', 'public.record_repair_solution(jsonb)', 'EXECUTE'),
  true,
  'authenticated can execute record_repair_solution'
);
select is(
  has_function_privilege('service_role', 'public.record_repair_solution(jsonb)', 'EXECUTE'),
  true,
  'service_role can execute record_repair_solution'
);
select is(
  has_function_privilege('anon', 'public.record_repair_solution(jsonb)', 'EXECUTE'),
  false,
  'anon cannot execute record_repair_solution'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.update_repair(jsonb)'::regprocedure),
  true,
  'update_repair remains security definer'
);
select ok(
  pg_get_functiondef('public.update_repair(jsonb)'::regprocedure)
    ~* $$SET search_path (TO|=) ''$$,
  'update_repair keeps an empty search_path'
);
select ok(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.repair_events'::regclass
      and conname = 'repair_events_event_type_valid'
  ) like '%SOLUTION_RECORDED%',
  'the repair event constraint accepts the specialized solution event'
);
select is(
  (select count(*) from public.permissions where code like 'REPAIRS_%'),
  8::bigint,
  'the change adds no repair permission'
);
select is(
  (select count(*) from public.roles where code = 'SERVICIO_TECNICO'),
  0::bigint,
  'the change adds no technical role'
);
select is(
  has_table_privilege('service_role', 'public.repairs', 'UPDATE'),
  false,
  'service_role still has no direct repair update privilege'
);
select is(
  has_table_privilege('authenticated', 'public.repairs', 'UPDATE'),
  false,
  'authenticated still has no direct repair update privilege'
);

-- ------------------------------------------------------------
-- Focused multi-tenant fixture
-- ------------------------------------------------------------

insert into public.organizations (id, name, slug)
values
  ('a1030000-0000-4000-8000-000000000001', 'Technical repairs one', 'technical-repairs-one'),
  ('a1030000-0000-4000-8000-000000000002', 'Technical repairs two', 'technical-repairs-two');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('a2030000-0000-4000-8000-000000000001', 'technical.admin@test.local', '{"full_name":"Technical Admin"}', now(), now()),
  ('a2030000-0000-4000-8000-000000000002', 'technical.sales@test.local', '{"full_name":"Technical Sales"}', now(), now()),
  ('a2030000-0000-4000-8000-000000000003', 'technical.worker@test.local', '{"full_name":"Technical Worker"}', now(), now()),
  ('a2030000-0000-4000-8000-000000000004', 'technical.other@test.local', '{"full_name":"Other Admin"}', now(), now()),
  ('a2030000-0000-4000-8000-000000000005', 'technical.second.admin@test.local', '{"full_name":"Second Technical Admin"}', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('a3030000-0000-4000-8000-000000000001', 'a2030000-0000-4000-8000-000000000001', now(), now()),
  ('a3030000-0000-4000-8000-000000000002', 'a2030000-0000-4000-8000-000000000002', now(), now()),
  ('a3030000-0000-4000-8000-000000000003', 'a2030000-0000-4000-8000-000000000003', now(), now()),
  ('a3030000-0000-4000-8000-000000000004', 'a2030000-0000-4000-8000-000000000004', now(), now()),
  ('a3030000-0000-4000-8000-000000000005', 'a2030000-0000-4000-8000-000000000005', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('a1030000-0000-4000-8000-000000000001', 'a2030000-0000-4000-8000-000000000001'),
  ('a1030000-0000-4000-8000-000000000001', 'a2030000-0000-4000-8000-000000000002'),
  ('a1030000-0000-4000-8000-000000000001', 'a2030000-0000-4000-8000-000000000003'),
  ('a1030000-0000-4000-8000-000000000002', 'a2030000-0000-4000-8000-000000000004'),
  ('a1030000-0000-4000-8000-000000000001', 'a2030000-0000-4000-8000-000000000005');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('a1030000-0000-4000-8000-000000000001', 'a2030000-0000-4000-8000-000000000001', 'ADMIN'),
  ('a1030000-0000-4000-8000-000000000001', 'a2030000-0000-4000-8000-000000000002', 'VENTAS'),
  ('a1030000-0000-4000-8000-000000000001', 'a2030000-0000-4000-8000-000000000003', 'CONTABILIDAD'),
  ('a1030000-0000-4000-8000-000000000002', 'a2030000-0000-4000-8000-000000000004', 'ADMIN'),
  ('a1030000-0000-4000-8000-000000000001', 'a2030000-0000-4000-8000-000000000005', 'ADMIN');

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name
)
values (
  'a4030000-0000-4000-8000-000000000001',
  'a1030000-0000-4000-8000-000000000001',
  'DNI', '43000001', 'Technical Repair Customer'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, sale_price,
  batch_control, serial_control, created_by, updated_by
)
values (
  'a5030000-0000-4000-8000-000000000001',
  'a1030000-0000-4000-8000-000000000001',
  'TECH-REPAIR-001', 'Technical repair product', 'UND', 100,
  false, false,
  'a2030000-0000-4000-8000-000000000001',
  'a2030000-0000-4000-8000-000000000001'
);

insert into public.repairs (
  id, organization_id, customer_id, product_id, status, delivered_at,
  problem_description, diagnosis, applied_solution, notes, customer_reference,
  assigned_technician_id, customer_name_snapshot, customer_document_snapshot,
  product_code_snapshot, product_description_snapshot, created_by, updated_by,
  updated_at
)
values
  (
    'a8030000-0000-4000-8000-000000000001',
    'a1030000-0000-4000-8000-000000000001',
    'a4030000-0000-4000-8000-000000000001',
    'a5030000-0000-4000-8000-000000000001',
    'received', null, 'General update case', 'Stored diagnosis', 'Stored solution',
    null, 'TECH-GENERAL', null, 'Technical Repair Customer', 'DNI 43000001',
    'TECH-REPAIR-001', 'Technical repair product',
    'a2030000-0000-4000-8000-000000000001',
    'a2030000-0000-4000-8000-000000000001',
    '2000-01-01 00:00:00+00'
  ),
  (
    'a8030000-0000-4000-8000-000000000002',
    'a1030000-0000-4000-8000-000000000001',
    'a4030000-0000-4000-8000-000000000001',
    'a5030000-0000-4000-8000-000000000001',
    'diagnosis', null, 'Diagnosis and solution case', null, null,
    null, 'TECH-PATHS', 'a2030000-0000-4000-8000-000000000003',
    'Technical Repair Customer', 'DNI 43000001',
    'TECH-REPAIR-001', 'Technical repair product',
    'a2030000-0000-4000-8000-000000000001',
    'a2030000-0000-4000-8000-000000000001',
    '2000-01-01 00:00:00+00'
  ),
  (
    'a8030000-0000-4000-8000-000000000003',
    'a1030000-0000-4000-8000-000000000001',
    'a4030000-0000-4000-8000-000000000001',
    'a5030000-0000-4000-8000-000000000001',
    'in_repair', null, 'Authorization and regression case', null, null,
    null, 'TECH-AUTH', null, 'Technical Repair Customer', 'DNI 43000001',
    'TECH-REPAIR-001', 'Technical repair product',
    'a2030000-0000-4000-8000-000000000001',
    'a2030000-0000-4000-8000-000000000001',
    '2000-01-01 00:00:00+00'
  ),
  (
    'a8030000-0000-4000-8000-000000000004',
    'a1030000-0000-4000-8000-000000000001',
    'a4030000-0000-4000-8000-000000000001',
    'a5030000-0000-4000-8000-000000000001',
    'received', null, 'Service role case', 'Service diagnosis', 'Service old solution',
    null, 'TECH-SERVICE', null, 'Technical Repair Customer', 'DNI 43000001',
    'TECH-REPAIR-001', 'Technical repair product',
    'a2030000-0000-4000-8000-000000000001',
    'a2030000-0000-4000-8000-000000000001',
    '2000-01-01 00:00:00+00'
  ),
  (
    'a8030000-0000-4000-8000-000000000005',
    'a1030000-0000-4000-8000-000000000001',
    'a4030000-0000-4000-8000-000000000001',
    'a5030000-0000-4000-8000-000000000001',
    'delivered', now(), 'Terminal repair case', null, 'Terminal solution',
    null, 'TECH-TERMINAL', null, 'Technical Repair Customer', 'DNI 43000001',
    'TECH-REPAIR-001', 'Technical repair product',
    'a2030000-0000-4000-8000-000000000001',
    'a2030000-0000-4000-8000-000000000001',
    '2000-01-01 00:00:00+00'
  ),
  (
    'a8030000-0000-4000-8000-000000000006',
    'a1030000-0000-4000-8000-000000000001',
    'a4030000-0000-4000-8000-000000000001',
    'a5030000-0000-4000-8000-000000000001',
    'received', null, 'Null compatibility case', null, null,
    null, 'TECH-COMPAT-NULL', null, 'Technical Repair Customer', 'DNI 43000001',
    'TECH-REPAIR-001', 'Technical repair product',
    'a2030000-0000-4000-8000-000000000001',
    'a2030000-0000-4000-8000-000000000001',
    '2000-01-01 00:00:00+00'
  );

-- ------------------------------------------------------------
-- General update and backward-compatible technical keys
-- ------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a2030000-0000-4000-8000-000000000002","role":"authenticated","session_id":"a3030000-0000-4000-8000-000000000002"}',
  true
);

select lives_ok($$
  select public.update_repair(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","id":"a8030000-0000-4000-8000-000000000001","priority":"urgent","notes":"Updated by sales"}'::jsonb
  )
$$, 'VENTAS can still perform a general repair update');
select throws_ok($$
  select public.update_repair(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","id":"a8030000-0000-4000-8000-000000000001","diagnosis":"Sales diagnosis bypass"}'::jsonb
  )
$$, 'P0001', 'REPAIR_DIAGNOSIS_USE_DIAGNOSIS_RPC', 'VENTAS cannot change diagnosis through the generic RPC');
select throws_ok($$
  select public.update_repair(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","id":"a8030000-0000-4000-8000-000000000001","applied_solution":"Sales solution bypass"}'::jsonb
  )
$$, 'P0001', 'REPAIR_APPLIED_SOLUTION_USE_SOLUTION_RPC', 'VENTAS cannot change applied solution through the generic RPC');

select set_config(
  'request.jwt.claims',
  '{"sub":"a2030000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a3030000-0000-4000-8000-000000000001"}',
  true
);

select is(
  (select priority from public.repairs where id = 'a8030000-0000-4000-8000-000000000001'),
  'urgent'::text,
  'the general update keeps its normal fields'
);
select is(
  (select notes from public.repairs where id = 'a8030000-0000-4000-8000-000000000001'),
  'Updated by sales'::text,
  'the general update persists sales notes'
);
select is(
  (select diagnosis from public.repairs where id = 'a8030000-0000-4000-8000-000000000001'),
  'Stored diagnosis'::text,
  'a normal update does not alter diagnosis'
);
select is(
  (select applied_solution from public.repairs where id = 'a8030000-0000-4000-8000-000000000001'),
  'Stored solution'::text,
  'a normal update does not alter applied solution'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000001' and event_type = 'UPDATED'),
  1::bigint,
  'a normal update retains its general event'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000001' and action = 'REPAIR_UPDATED'),
  1::bigint,
  'a normal update retains its general audit'
);

select throws_ok($$
  select public.update_repair(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","id":"a8030000-0000-4000-8000-000000000001","diagnosis":"Different diagnosis","notes":"Must roll back"}'::jsonb
  )
$$, 'P0001', 'REPAIR_DIAGNOSIS_USE_DIAGNOSIS_RPC', 'ADMIN cannot change diagnosis through the generic RPC');
select throws_ok($$
  select public.update_repair(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","id":"a8030000-0000-4000-8000-000000000001","applied_solution":"Different solution","notes":"Must also roll back"}'::jsonb
  )
$$, 'P0001', 'REPAIR_APPLIED_SOLUTION_USE_SOLUTION_RPC', 'ADMIN cannot change applied solution through the generic RPC');
select results_eq(
  $$
    select diagnosis, applied_solution, notes, updated_by
    from public.repairs
    where id = 'a8030000-0000-4000-8000-000000000001'
  $$,
  $$ values (
    'Stored diagnosis'::text,
    'Stored solution'::text,
    'Updated by sales'::text,
    'a2030000-0000-4000-8000-000000000002'::uuid
  ) $$,
  'rejected generic technical changes mutate no repair field or actor'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000001'),
  1::bigint,
  'rejected generic technical changes create no event'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000001'),
  1::bigint,
  'rejected generic technical changes create no audit'
);

select lives_ok($$
  select public.update_repair(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","id":"a8030000-0000-4000-8000-000000000001","diagnosis":"Stored diagnosis","applied_solution":"Stored solution","notes":"Exact old client"}'::jsonb
  )
$$, 'exact equivalent technical keys remain compatible with old clients');
select lives_ok($$
  select public.update_repair(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","id":"a8030000-0000-4000-8000-000000000001","diagnosis":"  Stored diagnosis  ","applied_solution":"  Stored solution  ","notes":"Compatible old client"}'::jsonb
  )
$$, 'normalized equivalent technical keys remain compatible with old clients');
select results_eq(
  $$
    select diagnosis, applied_solution
    from public.repairs
    where id = 'a8030000-0000-4000-8000-000000000001'
  $$,
  $$ values ('Stored diagnosis'::text, 'Stored solution'::text) $$,
  'equivalent old-client keys are not part of the effective update'
);
select is(
  (select notes from public.repairs where id = 'a8030000-0000-4000-8000-000000000001'),
  'Compatible old client'::text,
  'an old-client payload still updates general fields'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000001' and event_type = 'UPDATED'),
  3::bigint,
  'the compatible old-client update keeps general event behavior'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000001' and action = 'REPAIR_UPDATED'),
  3::bigint,
  'the compatible old-client update keeps general audit behavior'
);

select lives_ok($$
  select public.update_repair(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","id":"a8030000-0000-4000-8000-000000000006","diagnosis":null,"applied_solution":"","priority":"high"}'::jsonb
  )
$$, 'null and empty technical values remain equivalent to stored nulls');
select lives_ok($$
  select public.update_repair(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","id":"a8030000-0000-4000-8000-000000000006","diagnosis":"   ","applied_solution":null,"notes":"Null-compatible old client"}'::jsonb
  )
$$, 'spaces-only and null technical values remain equivalent to stored nulls');
select results_eq(
  $$
    select diagnosis, applied_solution, priority, notes
    from public.repairs
    where id = 'a8030000-0000-4000-8000-000000000006'
  $$,
  $$ values (null::text, null::text, 'high'::text, 'Null-compatible old client'::text) $$,
  'null-compatible payloads update only their general values'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000006'),
  2::bigint,
  'null-compatible old-client updates keep general events'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000006'),
  2::bigint,
  'null-compatible old-client updates keep general audits'
);

-- ------------------------------------------------------------
-- Specialized diagnosis and solution paths
-- ------------------------------------------------------------

select lives_ok($$
  select public.record_repair_diagnosis(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","repair_id":"a8030000-0000-4000-8000-000000000002","technician_id":"a2030000-0000-4000-8000-000000000003","symptoms":"Device does not start","cause_found":"Power board damaged","recommended_solution":"Replace power board","notes":"Diagnosis path"}'::jsonb
  )
$$, 'the existing diagnosis RPC still records diagnosis history');
select is(
  (select count(*) from public.repair_diagnostics where repair_id = 'a8030000-0000-4000-8000-000000000002'),
  1::bigint,
  'diagnosis keeps its append-only history row'
);
select is(
  (select diagnosis from public.repairs where id = 'a8030000-0000-4000-8000-000000000002'),
  'Replace power board'::text,
  'diagnosis keeps updating the repair summary'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000002' and event_type = 'DIAGNOSIS_CREATED'),
  1::bigint,
  'diagnosis keeps its specialized event'
);
select is(
  (
    select event.metadata ->> 'diagnosis_id'
    from public.repair_events event
    where event.repair_id = 'a8030000-0000-4000-8000-000000000002'
      and event.event_type = 'DIAGNOSIS_CREATED'
  ),
  (select id::text from public.repair_diagnostics where repair_id = 'a8030000-0000-4000-8000-000000000002'),
  'the diagnosis event references its history row'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000002' and action = 'REPAIR_DIAGNOSIS_CREATED'),
  1::bigint,
  'diagnosis keeps its specialized audit'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000002'),
  1::bigint,
  'diagnosis creates exactly one event'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000002'),
  1::bigint,
  'diagnosis creates exactly one audit'
);

select throws_ok($$
  select public.record_repair_solution('[]'::jsonb)
$$, '22023', 'REPAIR_PAYLOAD_INVALID', 'the solution RPC validates object payloads');
select throws_ok($$
  select public.record_repair_solution(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","repair_id":"a8030000-0000-4000-8000-000000000002","applied_solution":"   "}'::jsonb
  )
$$, 'P0001', 'REPAIR_APPLIED_SOLUTION_REQUIRED', 'the solution RPC requires a nonempty applied solution');
select set_config(
  'request.jwt.claims',
  '{"sub":"a2030000-0000-4000-8000-000000000005","role":"authenticated","session_id":"a3030000-0000-4000-8000-000000000005"}',
  true
);
select lives_ok($$
  select public.record_repair_solution(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","repair_id":"a8030000-0000-4000-8000-000000000002","applied_solution":"  Power board replaced  "}'::jsonb
  )
$$, 'ADMIN can call the solution RPC directly');
select is(
  (select applied_solution from public.repairs where id = 'a8030000-0000-4000-8000-000000000002'),
  'Power board replaced'::text,
  'the solution RPC normalizes and persists only the applied solution'
);
select is(
  (select updated_by from public.repairs where id = 'a8030000-0000-4000-8000-000000000002'),
  'a2030000-0000-4000-8000-000000000005'::uuid,
  'the solution RPC records its actor'
);
select results_eq(
  $$
    select diagnosis, status, assigned_technician_id, problem_description
    from public.repairs
    where id = 'a8030000-0000-4000-8000-000000000002'
  $$,
  $$ values (
    'Replace power board'::text,
    'diagnosis'::text,
    'a2030000-0000-4000-8000-000000000003'::uuid,
    'Diagnosis and solution case'::text
  ) $$,
  'the solution RPC does not modify diagnosis, status, technician, or general data'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000002' and event_type = 'SOLUTION_RECORDED'),
  1::bigint,
  'solution success creates a specialized event'
);
select is(
  (
    select event.metadata ->> 'applied_solution_after'
    from public.repair_events event
    where event.repair_id = 'a8030000-0000-4000-8000-000000000002'
      and event.event_type = 'SOLUTION_RECORDED'
  ),
  'Power board replaced'::text,
  'the solution event captures its resulting value'
);
select is(
  (
    select actor_user_id
    from public.repair_events
    where repair_id = 'a8030000-0000-4000-8000-000000000002'
      and event_type = 'SOLUTION_RECORDED'
  ),
  'a2030000-0000-4000-8000-000000000005'::uuid,
  'the solution event records its actor'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000002' and action = 'REPAIR_SOLUTION_RECORDED'),
  1::bigint,
  'solution success creates a specialized audit'
);
select is(
  (
    select actor_user_id
    from public.audit_events
    where entity_id = 'a8030000-0000-4000-8000-000000000002'
      and action = 'REPAIR_SOLUTION_RECORDED'
  ),
  'a2030000-0000-4000-8000-000000000005'::uuid,
  'the solution audit records its actor'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000002'),
  2::bigint,
  'diagnosis and solution create exactly one event each'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000002'),
  2::bigint,
  'diagnosis and solution create exactly one audit each'
);
select is(
  (
    select audit.metadata ->> 'repair_event_id'
    from public.audit_events audit
    where audit.entity_id = 'a8030000-0000-4000-8000-000000000002'
      and audit.action = 'REPAIR_SOLUTION_RECORDED'
  ),
  (
    select event.id::text
    from public.repair_events event
    where event.repair_id = 'a8030000-0000-4000-8000-000000000002'
      and event.event_type = 'SOLUTION_RECORDED'
  ),
  'the solution audit references its specialized event'
);

-- ------------------------------------------------------------
-- Authorization and tenant isolation
-- ------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"a2030000-0000-4000-8000-000000000002","role":"authenticated","session_id":"a3030000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok($$
  select public.record_repair_solution(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","repair_id":"a8030000-0000-4000-8000-000000000003","applied_solution":"Unauthorized sales solution"}'::jsonb
  )
$$, '42501', 'REPAIR_FORBIDDEN', 'VENTAS cannot use the status-level solution path');

select set_config(
  'request.jwt.claims',
  '{"sub":"a2030000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a3030000-0000-4000-8000-000000000001"}',
  true
);
select results_eq(
  $$
    select applied_solution, updated_by, updated_at
    from public.repairs
    where id = 'a8030000-0000-4000-8000-000000000003'
  $$,
  $$ values (
    null::text,
    'a2030000-0000-4000-8000-000000000001'::uuid,
    '2000-01-01 00:00:00+00'::timestamptz
  ) $$,
  'an unauthorized solution attempt does not mutate value, actor, or timestamp'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000003'),
  0::bigint,
  'an unauthorized solution attempt creates no event'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000003'),
  0::bigint,
  'an unauthorized solution attempt creates no audit'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2030000-0000-4000-8000-000000000004","role":"authenticated","session_id":"a3030000-0000-4000-8000-000000000004"}',
  true
);
select throws_ok($$
  select public.record_repair_solution(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","repair_id":"a8030000-0000-4000-8000-000000000003","applied_solution":"Cross-tenant solution"}'::jsonb
  )
$$, '42501', 'REPAIR_FORBIDDEN', 'an ADMIN from another tenant cannot use the solution RPC');

select set_config(
  'request.jwt.claims',
  '{"sub":"a2030000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a3030000-0000-4000-8000-000000000001"}',
  true
);
select results_eq(
  $$
    select applied_solution, updated_by, updated_at
    from public.repairs
    where id = 'a8030000-0000-4000-8000-000000000003'
  $$,
  $$ values (
    null::text,
    'a2030000-0000-4000-8000-000000000001'::uuid,
    '2000-01-01 00:00:00+00'::timestamptz
  ) $$,
  'the cross-tenant attempt leaves value, actor, and timestamp unchanged'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000003'),
  0::bigint,
  'the cross-tenant attempt creates no event'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000003'),
  0::bigint,
  'the cross-tenant attempt creates no audit'
);

-- ------------------------------------------------------------
-- service_role and final general regression
-- ------------------------------------------------------------

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_ok($$
  select public.update_repair(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","id":"a8030000-0000-4000-8000-000000000004","diagnosis":"Service changed diagnosis"}'::jsonb
  )
$$, 'P0001', 'REPAIR_DIAGNOSIS_USE_DIAGNOSIS_RPC', 'service_role cannot change diagnosis through the generic RPC');
select throws_ok($$
  select public.update_repair(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","id":"a8030000-0000-4000-8000-000000000004","applied_solution":"Service changed solution"}'::jsonb
  )
$$, 'P0001', 'REPAIR_APPLIED_SOLUTION_USE_SOLUTION_RPC', 'service_role cannot change solution through the generic RPC');

reset role;
select results_eq(
  $$
    select diagnosis, applied_solution, updated_by, updated_at
    from public.repairs
    where id = 'a8030000-0000-4000-8000-000000000004'
  $$,
  $$ values (
    'Service diagnosis'::text,
    'Service old solution'::text,
    'a2030000-0000-4000-8000-000000000001'::uuid,
    '2000-01-01 00:00:00+00'::timestamptz
  ) $$,
  'rejected service_role generic changes mutate no technical or traceability field'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000004'),
  0::bigint,
  'rejected service_role generic changes create no event'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000004'),
  0::bigint,
  'rejected service_role generic changes create no audit'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$
  select public.record_repair_solution(
    '{"organization_id":"a1030000-0000-4000-8000-000000000002","repair_id":"a8030000-0000-4000-8000-000000000004","applied_solution":"Wrong tenant key"}'::jsonb
  )
$$, 'P0001', 'REPAIR_NOT_FOUND', 'even service_role must match organization and repair');
reset role;
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000004'),
  0::bigint,
  'the rejected service_role tenant mismatch creates no event'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000004'),
  0::bigint,
  'the rejected service_role tenant mismatch creates no audit'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$
  select public.record_repair_solution(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","repair_id":"a8030000-0000-4000-8000-000000000004","applied_solution":"Service specialized solution"}'::jsonb
  )
$$, 'service_role can use the specialized RPC in a generic-editable received state');

reset role;
select is(
  (select applied_solution from public.repairs where id = 'a8030000-0000-4000-8000-000000000004'),
  'Service specialized solution'::text,
  'the service_role specialized path persists the solution'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000004' and event_type = 'SOLUTION_RECORDED'),
  1::bigint,
  'the service_role specialized path creates its event'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000004' and action = 'REPAIR_SOLUTION_RECORDED'),
  1::bigint,
  'the service_role specialized path creates its audit'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000004'),
  1::bigint,
  'the service_role specialized path creates exactly one event'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000004'),
  1::bigint,
  'the service_role specialized path creates exactly one audit'
);
select ok(
  (select updated_at > '2000-01-01 00:00:00+00'::timestamptz from public.repairs where id = 'a8030000-0000-4000-8000-000000000004'),
  'the specialized path updates the repair timestamp'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a2030000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a3030000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok($$
  select public.record_repair_solution(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","repair_id":"a8030000-0000-4000-8000-000000000005","applied_solution":"Cannot change terminal repair"}'::jsonb
  )
$$, 'P0001', 'REPAIR_NOT_EDITABLE', 'the specialized path keeps the generic terminal-state boundary');
select results_eq(
  $$
    select applied_solution, updated_by, updated_at
    from public.repairs
    where id = 'a8030000-0000-4000-8000-000000000005'
  $$,
  $$ values (
    'Terminal solution'::text,
    'a2030000-0000-4000-8000-000000000001'::uuid,
    '2000-01-01 00:00:00+00'::timestamptz
  ) $$,
  'a terminal rejection leaves value, actor, and timestamp unchanged'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000005'),
  0::bigint,
  'a terminal rejection creates no event'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000005'),
  0::bigint,
  'a terminal rejection creates no audit'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2030000-0000-4000-8000-000000000002","role":"authenticated","session_id":"a3030000-0000-4000-8000-000000000002"}',
  true
);
select lives_ok($$
  select public.update_repair(
    '{"organization_id":"a1030000-0000-4000-8000-000000000001","id":"a8030000-0000-4000-8000-000000000003","problem_description":"General updates still work after specialized changes"}'::jsonb
  )
$$, 'the nontechnical generic update path has no regression');

select set_config(
  'request.jwt.claims',
  '{"sub":"a2030000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a3030000-0000-4000-8000-000000000001"}',
  true
);
select is(
  (select problem_description from public.repairs where id = 'a8030000-0000-4000-8000-000000000003'),
  'General updates still work after specialized changes'::text,
  'the final generic update persists its nontechnical value'
);
select is(
  (select applied_solution from public.repairs where id = 'a8030000-0000-4000-8000-000000000003'),
  null::text,
  'the final generic update does not touch applied solution'
);
select is(
  (select count(*) from public.repair_events where repair_id = 'a8030000-0000-4000-8000-000000000003' and event_type = 'UPDATED'),
  1::bigint,
  'the final generic update records its usual event'
);
select is(
  (select count(*) from public.audit_events where entity_id = 'a8030000-0000-4000-8000-000000000003' and action = 'REPAIR_UPDATED'),
  1::bigint,
  'the final generic update records its usual audit'
);

select * from finish();
rollback;
