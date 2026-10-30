import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]

/** Read-only public cost RPCs, active user and RLS; fixtures live only in a rollback. */
export function benchmarkActualCost({sql,evidence}) {
 const org=randomUUID(),actor=randomUUID()
 const output=sql(`begin; set local statement_timeout='60s';
  insert into organizations(id,name,slug) values('${org}','R14 cost benchmark','r14-cost-bench-${org}');
  insert into auth.users(id,email) values('${actor}','${actor}@example.invalid');
  insert into auth.sessions(id,user_id,created_at,updated_at) values('${actor}','${actor}',now(),now());
  insert into organization_memberships(organization_id,user_id) values('${org}','${actor}');
  insert into user_roles(organization_id,user_id,role_code) values('${org}','${actor}','ADMIN');
  insert into repairs(organization_id,requester_type,requesting_area,equipment_type,external_equipment_description,
   problem_description,customer_name_snapshot,customer_document_snapshot,product_code_snapshot,product_description_snapshot)
   select '${org}','internal','R14 benchmark','external','Benchmark equipment','Benchmark problem','Benchmark','INTERNO','EXTERNO','Benchmark equipment' from generate_series(1,1200);
  create temporary table r14_bench_top as select id from repairs where organization_id='${org}' order by received_at desc,id desc limit 20;
  grant select on r14_bench_top to authenticated;
  create function pg_temp.r14_add_lines(n integer) returns void language sql as $fn$
   with generated as materialized(select gen_random_uuid() id,t.id repair from r14_bench_top t cross join generate_series(1,n))
   insert into public.repair_actual_cost_entries(id,organization_id,repair_id,root_id,category,description,amount,currency,cost_basis,incurred_on,evidence_reference,reason,recorded_by,recorded_by_name)
   select id,'${org}',repair,id,'labor','Documented benchmark labor',0.01,'PEN','not_applicable',(now() at time zone 'America/Lima')::date,
    'Benchmark document-line '||id,'Synthetic benchmark evidence','${actor}','Benchmark actor' from generated;
  $fn$;
  select pg_temp.r14_add_lines(5);
  create function pg_temp.r14_measure(stage text,kind text,iteration integer,q text) returns jsonb language plpgsql as $fn$
  declare p jsonb; begin execute 'explain (analyze,buffers,format json) '||q into p;
   return jsonb_build_object('stage',stage,'kind',kind,'iteration',iteration,'plan',p); end $fn$;
  create function pg_temp.r14_phase(stage text) returns setof jsonb language plpgsql as $fn$
  declare i integer; q text; result jsonb; ids uuid[]; expected integer; begin
   select array_agg(p.id) into ids from (select id from public.repair_list where organization_id='${org}' order by received_at desc,id desc limit 10 offset 10) p;
   result:=public.get_repair_actual_cost_summaries('${org}',ids);
   expected:=(case stage when '5' then 5 when '100' then 100 else 500 end);
   if jsonb_array_length(result)<>10 or exists(select 1 from jsonb_array_elements(result) s where (s->>'item_count')::integer<>expected
    or (s->'subtotals'->0->>'amount')::numeric<>expected*0.01::numeric or s->'total'<>'null'::jsonb) then raise exception 'R14_BENCHMARK_SUM_OR_PAGE_INVALID'; end if;
   for i in 1..3 loop
    q:=format('select count(*) from repair_list where organization_id=%L::uuid','${org}');
    return next pg_temp.r14_measure(stage,'count',i,q);
    q:=format('select id from repair_list where organization_id=%L::uuid order by received_at desc,id desc limit 10 offset 10','${org}');
    return next pg_temp.r14_measure(stage,'page_without_cost',i,q);
    q:=format('select get_repair_actual_cost_summaries(%L::uuid,array(select id from repair_list where organization_id=%L::uuid order by received_at desc,id desc limit 10 offset 10))','${org}','${org}');
    return next pg_temp.r14_measure(stage,'page_with_batch_cost',i,q);
    q:=format('select get_repair_actual_cost_detail(%L::uuid,(select id from r14_bench_top order by id limit 1),0,25)','${org}');
    return next pg_temp.r14_measure(stage,'detail',i,q);
   end loop;
  end $fn$;
  analyze repairs; analyze repair_actual_cost_entries;
  select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','${actor}','session_id','${actor}')::text,true);
  set local role authenticated;
  select * from pg_temp.r14_phase('5');
  reset role; select pg_temp.r14_add_lines(95); analyze repair_actual_cost_entries;
  set local role authenticated; select * from pg_temp.r14_phase('100');
  reset role; select pg_temp.r14_add_lines(400); analyze repair_actual_cost_entries;
  set local role authenticated; select * from pg_temp.r14_phase('500');
  reset role;
  create temporary table r14_bench_before as select public.get_repair_actual_cost_summaries('${org}',array(select id from r14_bench_top)) result;
  insert into repair_events(organization_id,repair_id,event_type,from_status,to_status)
   select '${org}',id,'UPDATED','received','received' from r14_bench_top cross join generate_series(1,500);
  analyze repair_events;
  do $do$ begin
   if (select result from r14_bench_before) is distinct from public.get_repair_actual_cost_summaries('${org}',array(select id from r14_bench_top)) then
    raise exception 'R14_BENCHMARK_NON_ECONOMIC_EVENTS_CHANGED_COST'; end if;
  end $do$;
  set local role authenticated; select * from pg_temp.r14_phase('500_plus_unrelated_events');
  rollback;`)
 const mixedOutput=sql(mixedBenchmarkSQL(randomUUID(),randomUUID(),randomUUID()))
 const records=(output+'\n'+mixedOutput).split(/\r?\n/).filter(s=>s.startsWith('{')).map(s=>JSON.parse(s))
 const samples=records.filter(s=>s.plan)
 assert.equal(samples.length,108,'48 original plans plus 60 mixed page/count/detail/verification plans execute')
 for(const sample of samples.filter(s=>s.kind==='count')) assert.ok(!JSON.stringify(sample.plan).includes('actual_cost'),'Count must not calculate costs')
 const groups=new Map()
 for(const sample of samples){const key=`${sample.stage}:${sample.kind}`,values=groups.get(key)||[];values.push(sample.plan[0]);groups.set(key,values)}
 const summary=[...groups].map(([key,values])=>({key,samples:values.length,planningMs:median(values.map(p=>p['Planning Time'])),executionMs:median(values.map(p=>p['Execution Time'])),
  hitBlocks:median(values.map(p=>p.Plan['Shared Hit Blocks']||0)),readBlocks:median(values.map(p=>p.Plan['Shared Read Blocks']||0))}))
 fs.writeFileSync(path.join(evidence,'actual-cost-benchmark-plans.json'),JSON.stringify(samples,null,2))
 fs.writeFileSync(path.join(evidence,'actual-cost-benchmark-summary.json'),JSON.stringify(summary,null,2))
 fs.writeFileSync(path.join(evidence,'actual-cost-benchmark-fixtures.json'),JSON.stringify(records.filter(s=>s.fixture),null,2))
 assert.equal(sql("select count(*) from organizations where slug like 'r14-cost-bench-%'"),'0','Cost benchmark leaves no synthetic organizations')
 console.log('R14_BENCHMARK_MEDIANS',JSON.stringify(summary))
 return summary
}

// Separate rollback keeps the original 48-plan workload intact. Mixed workload:
// 1,200 orders, 20 with 5 real sources; ONE order in the requested 10-row page
// grows to 100/500 sources (roughly 1/4 each category). Every inventory source is
// created by purchase/stock/reserve/consume RPCs, never a fabricated movement.
function mixedBenchmarkSQL(org,admin,finance) {
 const columns='id,organization_id,lock_version,repair_code,customer_id,product_id,serial_number,received_at,estimated_delivery_date,delivered_at,status,priority,problem_description,diagnosis,applied_solution,notes,customer_reference,sale_document_id,warranty_reference,assigned_technician_id,customer_name_snapshot,customer_document_snapshot,product_code_snapshot,product_description_snapshot,created_by,updated_by,created_at,updated_at,serial_control_snapshot,requester_type,requesting_area,equipment_type,external_equipment_description,external_service_pending,non_repairable_decision,returned_unrepaired_at,technical_completion'
 return `begin; set local statement_timeout='300s';
  insert into organizations(id,name,slug) values('${org}','R14 mixed benchmark','r14-cost-bench-${org}');
  insert into auth.users(id,email,raw_user_meta_data) values('${admin}','${admin}@example.invalid','{"full_name":"Benchmark admin"}'),('${finance}','${finance}@example.invalid','{"full_name":"Benchmark finance"}');
  insert into auth.sessions(id,user_id,created_at,updated_at) values('${admin}','${admin}',now(),now()),('${finance}','${finance}',now(),now());
  insert into organization_memberships(organization_id,user_id) values('${org}','${admin}');
  insert into user_roles(organization_id,user_id,role_code) values('${org}','${admin}','ADMIN');
  select set_config('request.jwt.claims','{"role":"authenticated","sub":"${admin}","session_id":"${admin}"}',true);
  select admin_create_user_membership('${admin}','${finance}',false,array['REPAIRS_MANAGE_ACTUAL_COST','REPAIRS_CONFIRM_ACTUAL_COST']);
  insert into repairs(organization_id,requester_type,requesting_area,equipment_type,external_equipment_description,problem_description,
   customer_name_snapshot,customer_document_snapshot,product_code_snapshot,product_description_snapshot)
   select '${org}','internal','Mixed benchmark','external','Mixed equipment','Mixed fault','Mixed','INTERNO','EXTERNO','Mixed equipment' from generate_series(1,1200);
  create temporary table r14_mixed_orders as select id,0::integer n from repairs where organization_id='${org}' order by received_at desc,id desc limit 20;
  create temporary table r14_mixed_context(p uuid,q uuid,supplier uuid,warehouse uuid,location uuid,target uuid);
  create temporary table r14_mixed_expected(repair uuid,currency text,amount numeric);
  grant select on r14_mixed_orders,r14_mixed_context,r14_mixed_expected to authenticated;
  do $seed$ declare p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); w uuid; l uuid; po uuid; item uuid; r record; begin
   insert into products(id,organization_id,code,description,unit_of_measure,product_type,tax_affectation,batch_control,expiration_control,created_by,updated_by)
    values(p,'${org}','R14-MIX-P','Mixed purchased part','UND','good','gravado',false,false,'${admin}','${admin}'),
      (q,'${org}','R14-MIX-Q','Mixed unknown origin','UND','good','gravado',false,false,'${admin}','${admin}');
   insert into suppliers(id,organization_id,document_type,document_number,business_name,created_by,updated_by)
    values(s,'${org}','otro','R14-MIX','Mixed provider','${admin}','${admin}');
   w:=save_warehouse(jsonb_build_object('organization_id','${org}','operation_key',gen_random_uuid(),'code','R14-MIX','name','Mixed warehouse','address','Disposable'));
   select id into l from warehouse_locations where warehouse_id=w and code='GENERAL';
   po:=save_purchase_order(jsonb_build_object('organization_id','${org}','supplier_id',s,'document_type','factura','series','MIX','document_number','1',
    'issue_date',current_date,'warehouse_id',w,'warehouse','Mixed warehouse','currency','PEN','prices_include_tax',false,
    'items',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',10000,'unit_cost',5))));
   perform issue_purchase_order('${org}',po); select id into item from purchase_order_items where purchase_order_id=po;
   perform receive_purchase_order_partial_inspected(jsonb_build_object('organization_id','${org}','purchase_order_id',po,'operation_key',gen_random_uuid(),
    'items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',item,'quantity',10000,'location_id',l,'fulfillment_mode','physical'))));
   perform record_inventory_movement(jsonb_build_object('organization_id','${org}','product_id',q,'warehouse_id',w,'location_id',l,'movement_type','entrada',
    'quantity',10000,'unit_cost',5,'stock_status','available','operation_date',current_date,'reason','Unknown monetary origin benchmark','document_reference','MIX manual'));
   insert into r14_mixed_context select p,q,s,w,l,id from repairs where organization_id='${org}' order by received_at desc,id desc offset 10 limit 1;
   for r in select id from r14_mixed_orders loop
    perform assign_repair('${org}',r.id,'${admin}',1); perform change_repair_status('${org}',r.id,'diagnosis',null,2);
    perform change_repair_status('${org}',r.id,'in_repair',null,3);
   end loop;
  end $seed$;
  create function pg_temp.r14_mixed_payload(r uuid,extra jsonb) returns jsonb language sql as $p$
   select jsonb_build_object('organization_id','${org}','repair_id',r,'expected_lock_version',lock_version,'operation_key',gen_random_uuid(),
    'reason','Documented synthetic benchmark','evidence_reference','Mixed line '||gen_random_uuid())||extra from public.repairs where id=r;
  $p$;
  create function pg_temp.r14_mixed_grow(target_n integer,only_target boolean) returns void language plpgsql as $grow$
  #variable_conflict use_column
  declare c record; r record; i integer; id uuid; part uuid; source uuid; amount numeric; currency_value text; known boolean; begin
   select * into c from r14_mixed_context;
   for r in select * from r14_mixed_orders where not only_target or id=c.target loop
    for i in r.n+1..target_n loop
     amount:=null; currency_value:='PEN';
     if i%4 in (1,2) then
      perform set_config('request.jwt.claims','{"role":"authenticated","sub":"${finance}","session_id":"${finance}"}',true);
      amount:=case when i%4=1 then 0.01 else 0.02 end; currency_value:=case when i%4=2 then 'USD' else 'PEN' end;
      id:=record_repair_actual_cost(pg_temp.r14_mixed_payload(r.id,jsonb_build_object('category',case when i%4=1 then 'labor' else 'other' end,
       'description','Mixed incurred work','amount',amount::text,'currency',currency_value,'cost_basis','not_applicable','incurred_on',current_date)));
      if i%16=1 then
       id:=revise_repair_actual_cost(pg_temp.r14_mixed_payload(r.id,jsonb_build_object('entry_id',id,'description','First correction','amount','0.03',
        'currency',currency_value,'cost_basis','not_applicable','incurred_on',current_date)));
       perform revise_repair_actual_cost(pg_temp.r14_mixed_payload(r.id,jsonb_build_object('entry_id',id,'description','Second correction','amount','0.04',
        'currency',currency_value,'cost_basis','not_applicable','incurred_on',current_date))); amount:=0.04;
      end if;
     elsif i%4=3 then
      perform set_config('request.jwt.claims','{"role":"authenticated","sub":"${admin}","session_id":"${admin}"}',true);
      part:=reserve_repair_part(jsonb_build_object('organization_id','${org}','repair_id',r.id,'expected_lock_version',(select lock_version from repairs where id=r.id),
       'operation_key',gen_random_uuid(),'product_id',case when i%16=11 then c.q else c.p end,'warehouse_id',c.warehouse,'location_id',c.location,'quantity_requested',1,'stock_status','available'));
      source:=consume_repair_part(jsonb_build_object('organization_id','${org}','repair_part_id',part,'expected_lock_version',(select lock_version from repairs where id=r.id),'operation_key',gen_random_uuid(),'quantity',1));
      known:=i%16 not in (11,15);
      if known then
       perform set_config('request.jwt.claims','{"role":"authenticated","sub":"${finance}","session_id":"${finance}"}',true);
       perform verify_repair_cost_source(pg_temp.r14_mixed_payload(r.id,jsonb_build_object('source_kind','consumption','source_id',source,'currency','PEN','cost_basis','tax_exclusive')));
       amount:=5;
      end if;
     else
      perform set_config('request.jwt.claims','{"role":"authenticated","sub":"${admin}","session_id":"${admin}"}',true);
      source:=send_repair_external_service(jsonb_build_object('organization_id','${org}','repair_id',r.id,'expected_lock_version',(select lock_version from repairs where id=r.id),
       'operation_key',gen_random_uuid(),'supplier_id',c.supplier,'description','Mixed external service'));
      currency_value:=case when i%16=8 then 'USD' else 'PEN' end;
      perform receive_repair_external_service(jsonb_build_object('organization_id','${org}','repair_id',r.id,'expected_lock_version',(select lock_version from repairs where id=r.id),
       'operation_key',gen_random_uuid(),'external_service_id',source,'cost_amount',2,'currency',currency_value));
      if i%16<>4 then
       perform set_config('request.jwt.claims','{"role":"authenticated","sub":"${finance}","session_id":"${finance}"}',true);
       perform verify_repair_cost_source(pg_temp.r14_mixed_payload(r.id,jsonb_build_object('source_kind','external','source_id',source,'currency',currency_value,'cost_basis','tax_exclusive')));
       amount:=2;
       if i%16=8 then
        perform revise_repair_external_cost(pg_temp.r14_mixed_payload(r.id,jsonb_build_object('source_id',source,'amount','2.25','currency',currency_value,'cost_basis','tax_exclusive')));
        perform revise_repair_external_cost(pg_temp.r14_mixed_payload(r.id,jsonb_build_object('source_id',source,'amount','2.50','currency',currency_value,'cost_basis','tax_exclusive'))); amount:=2.50;
       end if;
      end if;
     end if;
     if amount is not null then insert into r14_mixed_expected values(r.id,currency_value,amount); end if;
    end loop;
    update r14_mixed_orders set n=target_n where id=r.id;
   end loop;
   perform set_config('request.jwt.claims','{"role":"authenticated","sub":"${finance}","session_id":"${finance}"}',true);
  end $grow$;
  create function pg_temp.r14_mixed_measure(stage text,kind text,iteration integer,q text) returns jsonb language plpgsql as $measure$
  declare p jsonb; begin execute 'explain (analyze,buffers,format json) '||q into p;
   return jsonb_build_object('stage',stage,'kind',kind,'iteration',iteration,'plan',p); end $measure$;
  create function pg_temp.r14_mixed_phase(stage text) returns setof jsonb language plpgsql as $phase$
  declare ids uuid[]; result jsonb; s jsonb; expected jsonb; target uuid; source uuid; i integer; page_query text; begin
   select c.target into target from r14_mixed_context c;
   select array_agg(p.id) into ids from (select id from repair_list where organization_id='${org}' order by received_at desc,id desc limit 10 offset 10) p;
   result:=get_repair_actual_cost_summaries('${org}',ids);
   if jsonb_array_length(result)<>10 or not target=any(ids) then raise exception 'R14_MIXED_PAGE_INVALID'; end if;
   for s in select value from jsonb_array_elements(result) loop
    select jsonb_agg(jsonb_build_object('currency',currency,'cost_basis','tax_exclusive','amount',amount) order by currency) into expected
     from (select currency,sum(amount) amount from r14_mixed_expected where repair=(s->>'repair_id')::uuid group by currency) e;
    if (s->>'item_count')::integer<>(select n from r14_mixed_orders where id=(s->>'repair_id')::uuid)
      or s->'total'<>'null'::jsonb or s->>'state'<>'partial'
      or (select jsonb_agg(jsonb_build_object('currency',v->>'currency','cost_basis',v->>'cost_basis','amount',(v->>'amount')::numeric) order by v->>'currency') from jsonb_array_elements(s->'subtotals') v) is distinct from expected
    then raise exception 'R14_MIXED_EXACT_SUM_INVALID: %',s; end if;
   end loop;
   select (v->>'source_id')::uuid into source from jsonb_array_elements(get_repair_actual_cost_detail('${org}',target,0,50)->'items') v
     where v->>'source_kind'='consumption' and (v->>'is_verified')::boolean limit 1;
   if source is null then raise exception 'R14_MIXED_VALID_PURCHASE_SOURCE_REQUIRED'; end if;
   page_query:='select ${columns} from repair_list where organization_id=''${org}'' order by received_at desc,id desc limit 10 offset 10';
   for i in 1..3 loop
    return next pg_temp.r14_mixed_measure(stage,'count',i,'select count(*) from repair_list where organization_id=''${org}''');
    return next pg_temp.r14_mixed_measure(stage,'page_without_cost',i,page_query);
    return next pg_temp.r14_mixed_measure(stage,'page_with_batch_cost',i,'with page as materialized ('||page_query||') select jsonb_agg(to_jsonb(page)),get_repair_actual_cost_summaries(''${org}'',array_agg(page.id)) from page');
    return next pg_temp.r14_mixed_measure(stage,'detail',i,format('select get_repair_actual_cost_detail(%L,%L,0,25)','${org}',target));
    return next pg_temp.r14_mixed_measure(stage,'verify_purchase_source',i,format('select verify_repair_cost_source(pg_temp.r14_mixed_payload(%L,%L::jsonb))',target,
     jsonb_build_object('source_kind','consumption','source_id',source,'currency','PEN','cost_basis','tax_exclusive')));
   end loop;
   return next jsonb_build_object('fixture',stage,'page_ids',ids,'orders',1200,'heavy_order_sources',(select n from r14_mixed_orders where id=target),
    'other_active_orders_sources',5,'components',get_repair_actual_cost_summaries('${org}',array[target])->0->'components',
    'pending_count',jsonb_array_length(get_repair_actual_cost_summaries('${org}',array[target])->0->'pending'));
  end $phase$;
  select pg_temp.r14_mixed_grow(5,false); analyze repairs; analyze repair_part_consumptions; analyze repair_actual_cost_entries; analyze inventory_movements;
  set local role authenticated; select * from pg_temp.r14_mixed_phase('mixed_5'); reset role;
  select pg_temp.r14_mixed_grow(100,true); analyze repair_part_consumptions; analyze repair_actual_cost_entries; analyze inventory_movements;
  set local role authenticated; select * from pg_temp.r14_mixed_phase('mixed_100'); reset role;
  select pg_temp.r14_mixed_grow(500,true); analyze repair_part_consumptions; analyze repair_actual_cost_entries; analyze inventory_movements;
  set local role authenticated; select * from pg_temp.r14_mixed_phase('mixed_500'); reset role;
  create temporary table r14_mixed_before as select get_repair_actual_cost_summaries('${org}',array(select id from r14_mixed_orders)) data;
  insert into repair_events(organization_id,repair_id,event_type,from_status,to_status)
   select '${org}',id,'UPDATED','in_repair','in_repair' from r14_mixed_orders cross join generate_series(1,500);
  analyze repair_events;
  do $noise$ begin if (select data from r14_mixed_before) is distinct from get_repair_actual_cost_summaries('${org}',array(select id from r14_mixed_orders)) then raise exception 'R14_MIXED_NOISE_CHANGED_COST'; end if; end $noise$;
  set local role authenticated; select * from pg_temp.r14_mixed_phase('mixed_500_plus_unrelated_events');
  rollback;`
}
