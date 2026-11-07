-- Deterministic real RPCs. The test clock changes only clock expressions and
-- evidence defaults inside this rolled-back transaction, never the OS clock.
begin;
select no_plan();
set local timezone='UTC';
select set_config('d06.test_instant','2026-11-06T18:00:00Z',true);
\ir repair_calendar_clock.sql.fixture
\ir repair_calendar_domain.sql.fixture

select pg_temp.d06_purchase('TODAY','2026-11-06',1000);
select pg_temp.d06_purchase('LATER','2026-11-07',1000);
select pg_temp.d06_purchase('UNDATED',null,100,6.25,'undated-product');
create temporary table d06_cases as
select row_number() over(order by instant,zone)::integer n,instant,zone
from unnest(array['2026-11-06T23:59:00Z'::timestamptz,'2026-11-07T00:01:00Z','2026-11-07T00:30:00Z',
 '2026-11-07T04:59:59Z','2026-11-07T05:00:00Z','2026-11-07T05:30:00Z']) instant
cross join unnest(array['UTC','Pacific/Honolulu','Pacific/Kiritimati']) zone;
grant select on d06_cases to authenticated;
select pg_temp.d06_repair('existing-'||n) from d06_cases;
select pg_temp.d06_reserve('existing-'||n,'TODAY','2026-11-06',2) from d06_cases;
reset role;

create function pg_temp.d06_snapshot(label text) returns jsonb language sql stable security definer
set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('repair',to_jsonb(r),
 'parts',(select jsonb_agg(to_jsonb(p) order by id) from public.repair_parts p where p.repair_id=r.id),
 'consumptions',(select jsonb_agg(to_jsonb(c) order by c.id) from public.repair_part_consumptions c join public.repair_parts p on p.id=c.repair_part_id where p.repair_id=r.id),
 'movements',(select jsonb_agg(to_jsonb(m) order by id) from public.inventory_movements m where m.organization_id=r.organization_id),
 'events',(select jsonb_agg(to_jsonb(e) order by id) from public.repair_events e where e.repair_id=r.id),
 'audits',(select jsonb_agg(to_jsonb(a) order by id) from public.audit_events a where a.entity_id=r.id::text),
 'ledger',(select jsonb_agg(to_jsonb(o) order by operation_key) from public.repair_command_operations o where o.request_payload->>'repair_id'=r.id::text))
 from pg_temp.d06_orders d join public.repairs r on r.id=d.repair where d.label=$1;
$$;
create temporary table d06_saved(label text primary key,payload jsonb,id uuid);
grant select,insert,update on d06_saved to authenticated;

create function pg_temp.d06_case(n integer,instant timestamptz,zone text) returns setof text language plpgsql as $$
declare expected_day date:=($2 at time zone 'America/Lima')::date; valid boolean; label text:='new-'||n;
 existing text:='existing-'||n; r uuid; part uuid; result uuid; payload jsonb; before jsonb; stored jsonb;
 physical numeric; reserved numeric; version bigint; events bigint; audits bigint; active_lot text; expiry date;
begin
 perform set_config('TimeZone',zone,true);
 perform set_config('d06.test_instant',instant::text,true);
 perform pg_temp.d06_claim('admin');
 valid:='2026-11-06'::date>=expected_day;
 active_lot:=case when valid then 'TODAY' else 'LATER' end;
 expiry:=case when valid then '2026-11-06'::date else '2026-11-07'::date end;
 return next is((select days_until_expiration from inventory_expiration_alerts where product_id=pg_temp.d06_id('product') and lot='TODAY'),
  '2026-11-06'::date-expected_day,n||': existing expiry alert agrees with the authoritative business calendar');
 return next is((select count(*) from inventory_fefo_candidates where product_id=pg_temp.d06_id('product') and lot='TODAY'),
  case when valid then 1 else 0 end::bigint,n||': last-day candidate eligibility ignores caller timezone');
 return next is((select lot from plan_inventory_fefo(pg_temp.d06_id('org'),pg_temp.d06_id('product'),(select warehouse from d06_context),1,null) limit 1),
  active_lot,n||': actual FEFO planner selects the first valid lot');
 return next is((select assignable_quantity from inventory_bucket_availability where product_id=pg_temp.d06_id('product') and lot='TODAY'),
  case when valid then (select greatest(physical_quantity-reserved_quantity,0) from inventory_bucket_availability where product_id=pg_temp.d06_id('product') and lot='TODAY') else 0 end,
  n||': availability and reservation state agree on expiry');
 select d.part,rp.lock_version into part,version from d06_orders d join repairs rp on rp.id=d.repair where d.label=existing;
 payload:=jsonb_build_object('organization_id',pg_temp.d06_id('org'),'repair_part_id',part,'operation_key',gen_random_uuid(),'expected_lock_version',version,'quantity',1.234);
 before:=pg_temp.d06_snapshot(existing);
 if valid then
  result:=consume_repair_part(payload);
  return next ok(result is not null,n||': existing last-day reservation can be consumed');
  return next is((select m.operation_date from repair_part_consumptions c join inventory_movements m on m.id=c.inventory_movement_id where c.id=result),expected_day,n||': existing reservation movement uses Lima date');
 else
  return next throws_ok(format('select consume_repair_part(%L::jsonb)',payload::text),'P0001','REPAIR_PART_EXPIRED',n||': expired existing reservation cannot be consumed');
  return next is(pg_temp.d06_snapshot(existing),before,n||': expired consumption has no partial effects');
 end if;
 r:=pg_temp.d06_repair(label);
 if valid then
  before:=pg_temp.d06_snapshot(label);
  return next throws_ok(format('select pg_temp.d06_reserve(%L,%L,%L::date)',label,'LATER','2026-11-07'),
   'P0001','INVENTORY_FEFO_VIOLATION',n||': later lot cannot bypass available last-day stock');
  return next is(pg_temp.d06_snapshot(label),before,n||': rejected FEFO reservation is atomic');
 else
  before:=pg_temp.d06_snapshot(label);
  return next throws_ok(format('select pg_temp.d06_reserve(%L,%L,%L::date)',label,'TODAY','2026-11-06'),
   'P0001','REPAIR_PART_EXPIRED',n||': new expired reservation is rejected even in Honolulu');
  return next is(pg_temp.d06_snapshot(label),before,n||': rejected expired reservation is atomic');
 end if;
 part:=pg_temp.d06_reserve(label,active_lot,expiry,2);
 select physical_quantity,reserved_quantity into physical,reserved from inventory_bucket_availability
  where product_id=pg_temp.d06_id('product') and lot=active_lot;
 select lock_version into version from repairs where id=r;
 select count(*) into events from repair_events where repair_id=r;
 select count(*) into audits from audit_events where entity_id=r::text;
 payload:=jsonb_build_object('organization_id',pg_temp.d06_id('org'),'repair_part_id',part,'operation_key',gen_random_uuid(),
  'expected_lock_version',version,'quantity',1.234,'operation_date','2099-01-01');
 result:=consume_repair_part(payload);
 insert into d06_saved values(label,payload,result);
 return next is((select quantity from repair_part_consumptions where id=result),1.234::numeric,n||': partial consumption quantity is exact');
 return next is((select unit_cost from repair_part_consumptions where id=result),7.1234::numeric,n||': historical purchase cost is preserved');
 return next is((select quantity*unit_cost from repair_part_consumptions where id=result),8.7902756::numeric,n||': R14 source product keeps all seven decimals');
 return next is((select consumed_at from repair_part_consumptions where id=result),instant,n||': consumption timestamp stays an absolute transaction instant');
 return next is((select m.created_at from repair_part_consumptions c join inventory_movements m on m.id=c.inventory_movement_id where c.id=result),instant,n||': movement timestamp uses the same instant');
 return next is((select m.operation_date from repair_part_consumptions c join inventory_movements m on m.id=c.inventory_movement_id where c.id=result),expected_day,n||': arbitrary payload date cannot choose consumption day');
 return next is((select physical_quantity from inventory_bucket_availability where product_id=pg_temp.d06_id('product') and lot=active_lot),physical-1.234,n||': physical stock decreases exactly once');
 return next is((select reserved_quantity from inventory_bucket_availability where product_id=pg_temp.d06_id('product') and lot=active_lot),reserved-1.234,n||': owned reservation decreases with consumption');
 return next is((select quantity_consumed from repair_parts where id=part),1.234::numeric,n||': reservation projection stays consistent');
 return next is((select status from repair_parts where id=part),'reserved',n||': unconsumed remainder stays reserved');
 return next is((select lock_version from repairs where id=r),version+1,n||': exactly one aggregate version advance');
 return next is((select count(*) from repair_events where repair_id=r),events+1,n||': exactly one consumption event');
 return next is((select count(*) from audit_events where entity_id=r::text),audits+1,n||': exactly one consumption audit');
 before:=pg_temp.d06_snapshot(label);
 perform set_config('d06.test_instant',(instant+interval '3 days')::text,true);
 return next is(consume_repair_part(payload),result,n||': exact replay after expiry returns the original identity');
 return next is(pg_temp.d06_snapshot(label),before,n||': replay preserves original dates, costs, version, ledger and audit');
 return next throws_ok(format('select consume_repair_part(%L::jsonb)',(payload||'{"quantity":1.235}'::jsonb)::text),
  'P0001','REPAIR_OPERATION_KEY_REUSED',n||': same key with another quantity conflicts');
 return next is(pg_temp.d06_snapshot(label),before,n||': conflicting key has no partial effects');
 perform set_config('d06.test_instant',instant::text,true);
 return next is(current_setting('TimeZone'),zone,n||': operation does not rewrite caller timezone');
end $$;

set local role authenticated;
select result.* from d06_cases c cross join lateral pg_temp.d06_case(c.n,c.instant,c.zone) result;
reset role;
set local timezone='UTC';
select set_config('d06.test_instant','2026-11-07T00:30:00Z',true);
select pg_temp.d06_claim('admin');
set local role authenticated;
select pg_temp.d06_repair('insufficient');
select throws_ok($$select pg_temp.d06_reserve('insufficient','TODAY','2026-11-06',1000000)$$,
 'P0001','REPAIR_INSUFFICIENT_STOCK','insufficient assignable stock is still rejected');
select pg_temp.d06_repair('undated');
select lives_ok($$select pg_temp.d06_reserve('undated','UNDATED',null,2,'undated-product')$$,'lot without expiry remains valid when the product contract permits it');
select lives_ok($$select pg_temp.d06_consume('undated',1)$$,'undated reservation can still be consumed');
create temporary table d06_failed_quantity as select pg_temp.d06_snapshot('undated') value;
select throws_ok($$select pg_temp.d06_consume('undated',2)$$,'P0001','REPAIR_CONSUMPTION_QUANTITY_EXCEEDED','calendar correction does not permit overconsumption');
select is(pg_temp.d06_snapshot('undated'),(select value from d06_failed_quantity),'overconsumption has no partial effects');
select pg_temp.d06_claim('finance');
select throws_ok($$select pg_temp.d06_consume('undated',0.5)$$,'42501','REPAIR_FORBIDDEN','economic capability does not grant physical consumption');
select pg_temp.d06_claim('foreign');
select is((select count(*) from inventory_fefo_candidates where organization_id=pg_temp.d06_id('org')),0::bigint,'other company cannot see the corrected FEFO projection');
select throws_ok($$select consume_repair_part(jsonb_build_object('organization_id',pg_temp.d06_id('foreign-org'),
 'repair_part_id',(select part from d06_orders where label='undated'),'operation_key',gen_random_uuid(),'expected_lock_version',1,'quantity',1))$$,
 'P0001','REPAIR_NOT_FOUND','foreign actor cannot consume another organization reservation');

-- Monetary accreditation follows the real purchase, never a guessed currency.
select pg_temp.d06_claim('finance');
select is((get_repair_actual_cost_detail(pg_temp.d06_id('org'),(select repair from d06_orders where label='new-1'))->'summary'->>'state'),
 'undetermined','calendar correction does not certify an unreviewed monetary source');
select is((get_repair_actual_cost_detail(pg_temp.d06_id('org'),(select repair from d06_orders where label='new-1'))->'items'->0->>'currency'),
 null::text,'unaccredited inventory currency remains unknown');
select is((get_repair_actual_cost_detail(pg_temp.d06_id('org'),(select repair from d06_orders where label='new-1'))->'items'->0->>'is_verified')::boolean,
 false,'the original physical source is not automatically financially verified');
select lives_ok($$select verify_repair_cost_source(jsonb_build_object('organization_id',pg_temp.d06_id('org'),
 'repair_id',(select repair from d06_orders where label='new-1'),'operation_key',gen_random_uuid(),
 'expected_lock_version',(select lock_version from repairs where id=(select repair from d06_orders where label='new-1')),
 'source_kind','consumption','source_id',(select id from d06_saved where label='new-1'),
 'currency','USD','cost_basis','tax_exclusive','evidence_reference','D06 purchase source','reason','D06 source verification'))$$,
 'R14 accreditation still follows homogeneous documentary purchase provenance');
select is((get_repair_actual_cost_detail(pg_temp.d06_id('org'),(select repair from d06_orders where label='new-1'))->'summary'->'subtotals'->0->>'currency'),
 'USD','D06 does not reassign currency to a documented source');
select is((get_repair_actual_cost_detail(pg_temp.d06_id('org'),(select repair from d06_orders where label='new-1'))->'summary'->'subtotals'->0->>'amount')::numeric,
 8.7902756::numeric,'R14 aggregate remains exact after calendar correction');
reset role;
select ok(not has_function_privilege('authenticated','public.inventory_bucket_state(uuid,uuid,uuid,uuid,text,text,date)','EXECUTE'),'private stock state helper remains private');
select ok(not has_function_privilege('anon','public.consume_repair_part(jsonb)','EXECUTE'),'anonymous consumption stays forbidden');
select ok((select reloptions @> array['security_invoker=true'] from pg_class where oid='inventory_fefo_candidates'::regclass),'shared FEFO keeps invoker RLS');
select ok(not exists(select 1 from inventory_bucket_availability where organization_id=pg_temp.d06_id('org') and physical_quantity<0),'no synthetic bucket becomes negative');
select * from finish();
rollback;
