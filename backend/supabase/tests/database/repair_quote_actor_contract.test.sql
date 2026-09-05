begin;
select no_plan();

create function pg_temp.actor_id(label text) returns uuid
language sql immutable as $$ select md5('p1-15:' || label)::uuid $$;

select ok(not has_function_privilege('service_role', 'public.approve_repair_quote(uuid,uuid,uuid,text,bigint)', 'EXECUTE'),
  'service_role cannot approve quotes');
select ok(not has_function_privilege('service_role', 'public.reject_repair_quote(uuid,uuid,uuid,text,bigint)', 'EXECUTE'),
  'service_role cannot reject quotes');
select ok(has_function_privilege('authenticated', 'public.approve_repair_quote(uuid,uuid,uuid,text,bigint)', 'EXECUTE'),
  'authenticated users retain the approval RPC');
select ok(has_function_privilege('authenticated', 'public.reject_repair_quote(uuid,uuid,uuid,text,bigint)', 'EXECUTE'),
  'authenticated users retain the rejection RPC');
select ok(not has_function_privilege('anon', 'public.approve_repair_quote(uuid,uuid,uuid,text,bigint)', 'EXECUTE'),
  'anonymous users cannot approve quotes');
select ok(not has_function_privilege('anon', 'public.reject_repair_quote(uuid,uuid,uuid,text,bigint)', 'EXECUTE'),
  'anonymous users cannot reject quotes');
select ok(not has_function_privilege('service_role', 'public.approve_repair_quote_unchecked(uuid,uuid,uuid,text)', 'EXECUTE'),
  'service_role cannot bypass approval through the internal function');
select ok(not has_function_privilege('service_role', 'public.reject_repair_quote_unchecked(uuid,uuid,uuid,text)', 'EXECUTE'),
  'service_role cannot bypass rejection through the internal function');

insert into public.organizations (id, name, slug)
values (pg_temp.actor_id('org'), 'Quote actor contract', 'quote-actor-contract');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (pg_temp.actor_id('user'), 'quote-actor@test.local', '{"full_name":"Quote actor"}', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at)
values (pg_temp.actor_id('session'), pg_temp.actor_id('user'), now(), now());
insert into public.organization_memberships (organization_id, user_id)
values (pg_temp.actor_id('org'), pg_temp.actor_id('user'));
insert into public.user_roles (organization_id, user_id, role_code)
values (pg_temp.actor_id('org'), pg_temp.actor_id('user'), 'ADMIN');
insert into public.customers (id, organization_id, document_type, document_number, legal_name)
values (pg_temp.actor_id('customer'), pg_temp.actor_id('org'), 'DNI', '61150001', 'Quote customer');
insert into public.products (id, organization_id, code, description, unit_of_measure, sale_price)
values (pg_temp.actor_id('product'), pg_temp.actor_id('org'), 'QUOTE-ACTOR', 'Quote product', 'UND', 10);
insert into public.repairs (
  id, organization_id, customer_id, product_id, status, problem_description,
  customer_name_snapshot, customer_document_snapshot, product_code_snapshot, product_description_snapshot
)
select pg_temp.actor_id(command), pg_temp.actor_id('org'), pg_temp.actor_id('customer'),
  pg_temp.actor_id('product'), 'waiting_customer_approval', 'No enciende', 'Quote customer',
  'DNI 61150001', 'QUOTE-ACTOR', 'Quote product'
from unnest(array['approve', 'reject']) command;
insert into public.repair_quotes (id, organization_id, repair_id, version_number, status, is_current,
  currency, prices_include_tax, tax_rate, subtotal, tax, total)
select pg_temp.actor_id(command || '-quote'), pg_temp.actor_id('org'), pg_temp.actor_id(command),
  1, 'pending', true, 'PEN', false, 0, 10, 0, 10
from unnest(array['approve', 'reject']) command;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(auth.uid(), null::uuid, 'the integration JWT carries no user identity');
select throws_ok($$
  select public.approve_repair_quote(pg_temp.actor_id('org'), pg_temp.actor_id('approve'),
    pg_temp.actor_id('approve-quote'), 'Aprobado', 1)
$$, '42501', 'permission denied for function approve_repair_quote',
  'service approval fails at authorization rather than a null-actor constraint');
select throws_ok($$
  select public.reject_repair_quote(pg_temp.actor_id('org'), pg_temp.actor_id('reject'),
    pg_temp.actor_id('reject-quote'), 'Rechazado', 1)
$$, '42501', 'permission denied for function reject_repair_quote',
  'service rejection fails at authorization rather than a null-actor constraint');

select set_config('request.jwt.claims', jsonb_build_object('role', 'service_role',
  'sub', pg_temp.actor_id('user'))::text, true);
select throws_ok($$
  select public.approve_repair_quote(pg_temp.actor_id('org'), pg_temp.actor_id('approve'),
    pg_temp.actor_id('approve-quote'), 'Aprobado', 1)
$$, '42501', 'permission denied for function approve_repair_quote',
  'adding a subject to service_role does not restore the unsupported contract');

reset role;
select is((select count(*) from public.repair_quotes where organization_id = pg_temp.actor_id('org')
  and status = 'pending' and approved_by is null and rejected_by is null), 2::bigint,
  'denied calls preserve pending quotes and empty decision actors');
select is((select count(*) from public.repairs where organization_id = pg_temp.actor_id('org')
  and lock_version = 1 and status = 'waiting_customer_approval'), 2::bigint,
  'denied calls preserve repair status and version');
select is((select count(*) from public.repair_events where organization_id = pg_temp.actor_id('org')
  and event_type in ('QUOTE_APPROVED', 'QUOTE_REJECTED')), 0::bigint,
  'denied calls create no decision events');

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated',
  'sub', pg_temp.actor_id('user'))::text, true);
select throws_ok($$
  select public.approve_repair_quote(pg_temp.actor_id('org'), pg_temp.actor_id('approve'),
    pg_temp.actor_id('approve-quote'), 'Aprobado', 1)
$$, '42501', 'AUTH_SESSION_INACTIVE', 'authenticated approval requires a live session');
select throws_ok($$
  select public.reject_repair_quote(pg_temp.actor_id('org'), pg_temp.actor_id('reject'),
    pg_temp.actor_id('reject-quote'), 'Rechazado', 1)
$$, '42501', 'AUTH_SESSION_INACTIVE', 'authenticated rejection requires a live session');
select set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated',
  'sub', pg_temp.actor_id('user'), 'session_id', pg_temp.actor_id('session'))::text, true);
select lives_ok($$
  select public.approve_repair_quote(pg_temp.actor_id('org'), pg_temp.actor_id('approve'),
    pg_temp.actor_id('approve-quote'), 'Aprobado', 1)
$$, 'a permitted authenticated actor can approve');
select lives_ok($$
  select public.reject_repair_quote(pg_temp.actor_id('org'), pg_temp.actor_id('reject'),
    pg_temp.actor_id('reject-quote'), 'Rechazado', 1)
$$, 'a permitted authenticated actor can reject');
select is((select approved_by from public.repair_quotes where id = pg_temp.actor_id('approve-quote')),
  pg_temp.actor_id('user'), 'approval persists the authenticated actor');
select is((select rejected_by from public.repair_quotes where id = pg_temp.actor_id('reject-quote')),
  pg_temp.actor_id('user'), 'rejection persists the authenticated actor');
select is((select count(*) from public.repair_events where organization_id = pg_temp.actor_id('org')
  and event_type in ('QUOTE_APPROVED', 'QUOTE_REJECTED') and actor_user_id = pg_temp.actor_id('user')),
  2::bigint, 'decision events identify the same authenticated actor');

select * from finish();
rollback;
