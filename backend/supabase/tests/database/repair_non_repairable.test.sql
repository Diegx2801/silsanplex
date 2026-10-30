begin;
select no_plan();
create temporary table b1_ids(label text primary key,id uuid default gen_random_uuid());
insert into b1_ids(label) values('org'),('foreign-org'),('admin'),('tech'),('other-tech'),('delivery'),('viewer'),('foreign');
create function pg_temp.b1_id(text) returns uuid language sql as $$select id from b1_ids where label=$1$$;
insert into organizations(id,name,slug) select id,'B1 fixture','b1-'||id from b1_ids where label in ('org','foreign-org');
insert into auth.users(id,email,raw_user_meta_data)
select id,id||'@example.invalid',jsonb_build_object('full_name',label) from b1_ids where label not in ('org','foreign-org');
insert into auth.sessions(id,user_id,created_at,updated_at)
select id,id,now(),now() from b1_ids where label not in ('org','foreign-org');
insert into organization_memberships(organization_id,user_id)
select pg_temp.b1_id(case when label='foreign' then 'foreign-org' else 'org' end),id
from b1_ids where label not in ('org','foreign-org');
insert into roles(code,name) values('B1_DELIVERY','B1 delivery'),('B1_VIEWER','B1 viewer');
insert into role_permissions(role_code,permission_code) values('B1_DELIVERY','REPAIRS_VIEW'),('B1_DELIVERY','REPAIRS_DELIVER'),('B1_VIEWER','REPAIRS_VIEW');
insert into user_roles(organization_id,user_id,role_code)
select pg_temp.b1_id(case when label='foreign' then 'foreign-org' else 'org' end),id,
case when label in ('admin','foreign') then 'ADMIN' when label in ('tech','other-tech') then 'TECNICO_REPARACIONES'
when label='delivery' then 'B1_DELIVERY' else 'B1_VIEWER' end
from b1_ids where label not in ('org','foreign-org');
create function pg_temp.b1_claim(who text) returns text language sql as $$
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.b1_id(who),'session_id',pg_temp.b1_id(who))::text,true)
$$;
create temporary table b1_f(label text primary key,repair uuid,diagnosis uuid);
grant select on b1_ids,b1_f to authenticated;
create function pg_temp.b1_fixture(label text,accessories jsonb default '[]') returns void language plpgsql as $$
declare repair uuid; diagnosis uuid;
begin
 perform pg_temp.b1_claim('admin');
 repair:=create_repair(jsonb_build_object('organization_id',pg_temp.b1_id('org'),'operation_key',gen_random_uuid(),
 'requester_type','internal','requesting_area','Laboratorio','equipment_type','external','external_equipment_description','Equipo B1',
 'problem_description','No enciende','notes','Historia original','accessories',accessories));
 perform assign_repair(pg_temp.b1_id('org'),repair,pg_temp.b1_id('tech'),1);
 perform change_repair_status(pg_temp.b1_id('org'),repair,'diagnosis',null,2);
 diagnosis:=record_repair_diagnosis(jsonb_build_object('organization_id',pg_temp.b1_id('org'),'repair_id',repair,
 'expected_lock_version',3,'technician_id',pg_temp.b1_id('tech'),'symptoms','Placa dañada','cause_found','Daño irreversible'));
 insert into b1_f values(label,repair,diagnosis);
end $$;
create function pg_temp.b1_payload(label text,extra jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_object('organization_id',pg_temp.b1_id('org'),'repair_id',f.repair,'diagnosis_id',f.diagnosis,
 'expected_lock_version',r.lock_version,'operation_key',gen_random_uuid(),'reason','Daño irreversible confirmado',
 'decision_event_id',r.non_repairable_decision_event_id::text) || extra
 from b1_f f join repairs r on r.id=f.repair where f.label=$1
$$;
create function pg_temp.b1_command(command text,label text,extra jsonb default '{}') returns uuid language plpgsql as $$
declare result uuid; begin execute format('select public.%I($1)',command) into result using pg_temp.b1_payload(label,extra); return result; end $$;

select has_column('public','repairs','returned_unrepaired_at','separate physical return timestamp');
select is(has_function_privilege('anon','declare_repair_non_repairable(jsonb)','EXECUTE'),false,'anon denied');
select is(has_function_privilege('service_role','return_unrepaired_repair(jsonb)','EXECUTE'),false,'service role cannot invent return actor');
select is(has_table_privilege('authenticated','repairs','UPDATE'),false,'no direct writes');
select pg_temp.b1_fixture('main','[{"name":"Cable","quantity_received":2}]');
select pg_temp.b1_fixture('reopen');
select pg_temp.b1_fixture('external');
select pg_temp.b1_fixture('parts');
select pg_temp.b1_fixture('consumed');
select pg_temp.b1_fixture('ordinary');

set local role authenticated;
select pg_temp.b1_claim('viewer');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main')$$,'42501','REPAIR_FORBIDDEN','viewer cannot declare');
select pg_temp.b1_claim('delivery');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main')$$,'42501','REPAIR_FORBIDDEN','delivery capability is not technical');
select pg_temp.b1_claim('admin');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main')$$,'42501','REPAIR_NON_REPAIRABLE_ASSIGNED_TECHNICIAN_REQUIRED','ADMIN has no assigned-technician bypass');
select pg_temp.b1_claim('other-tech');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main')$$,'42501','REPAIR_NON_REPAIRABLE_ASSIGNED_TECHNICIAN_REQUIRED','unassigned technician denied');
select pg_temp.b1_claim('foreign');
select throws_ok($$select declare_repair_non_repairable(jsonb_build_object('organization_id',pg_temp.b1_id('org')))$$,'42501','REPAIR_FORBIDDEN','foreign organization denied');
select is((select count(*) from repairs where organization_id=pg_temp.b1_id('org')),0::bigint,'RLS hides other organization');
select pg_temp.b1_claim('tech');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main','{"reason":" "}')$$,'22023','REPAIR_NON_REPAIRABLE_REASON_REQUIRED','blank reason denied');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main','{"diagnosis_id":null}')$$,'P0001','REPAIR_NON_REPAIRABLE_DIAGNOSIS_INVALID','diagnosis required');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main',jsonb_build_object('diagnosis_id',(select diagnosis from b1_f where label='reopen')))$$,'P0001','REPAIR_NON_REPAIRABLE_DIAGNOSIS_INVALID','diagnosis of another repair denied');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main','{"actor_id":"spoof"}')$$,'22023','REPAIR_NON_REPAIRABLE_SERVER_FIELDS','actor cannot be provided');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main','{"decided_at":"2020-01-01"}')$$,'22023','REPAIR_NON_REPAIRABLE_SERVER_FIELDS','date cannot be provided');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main','{"expected_lock_version":1}')$$,'P0001','REPAIR_VERSION_CONFLICT','stale version denied');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main','{"operation_key":null}')$$,'22023','REPAIR_OPERATION_KEY_REQUIRED','operation key required');
select throws_ok($$select change_repair_status(pg_temp.b1_id('org'),(select repair from b1_f where label='main'),'non_repairable',null,4)$$,'P0001','REPAIR_SPECIALIZED_STATUS_REQUIRED','old generic RPC cannot enter new state');

reset role;
update profiles set is_active=false,deactivated_at=now() where id=pg_temp.b1_id('tech');
set local role authenticated;
select throws_ok($$select declare_repair_non_repairable(jsonb_build_object('organization_id',pg_temp.b1_id('org'),
 'repair_id',(select repair from b1_f where label='main'),'diagnosis_id',(select diagnosis from b1_f where label='main'),
 'expected_lock_version',4,'operation_key',gen_random_uuid(),'reason','Daño irreversible'))$$,'42501',null,'inactive technician denied');
reset role;
update profiles set is_active=true,deactivated_at=null where id=pg_temp.b1_id('tech');
set local role authenticated;
select lives_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main','{"operation_key":"b1280000-0000-4000-8000-000000000001"}')$$,'assigned technician declares');
select is((select status from repairs where id=(select repair from b1_f where label='main')),'non_repairable','decision is not delivered');
select is((select lock_version from repairs where id=(select repair from b1_f where label='main')),5::bigint,'one version advance');
select lives_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main','{"operation_key":"b1280000-0000-4000-8000-000000000001","expected_lock_version":4,"decision_event_id":null}')$$,'replay precedes stale version/state');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','main','{"operation_key":"b1280000-0000-4000-8000-000000000001","reason":"Changed"}')$$,'P0001','REPAIR_OPERATION_KEY_REUSED','same key cannot change intent');
select is((select count(*) from repair_events where repair_id=(select repair from b1_f where label='main') and event_type='NON_REPAIRABLE_DECLARED'),1::bigint,'one immutable decision');
select is((select actor_user_id from repair_events where repair_id=(select repair from b1_f where label='main') and event_type='NON_REPAIRABLE_DECLARED'),pg_temp.b1_id('tech'),'decision actor from session');
select ok((select metadata->'diagnosis_snapshot'->>'symptoms'='Placa dañada' and created_at=now() from repair_events where repair_id=(select repair from b1_f where label='main') and event_type='NON_REPAIRABLE_DECLARED'),'snapshot and server date retained');
reset role;
select is((select count(*) from audit_events where entity_id=(select repair::text from b1_f where label='main') and action='REPAIR_NON_REPAIRABLE_DECLARED'),1::bigint,'decision audited once');
set local role authenticated;
select throws_ok($$select record_repair_solution(jsonb_build_object('organization_id',pg_temp.b1_id('org'),'repair_id',(select repair from b1_f where label='main'),'expected_lock_version',5,'applied_solution','Bypass'))$$,'P0001','REPAIR_NON_REPAIRABLE_ACTIVE','old solution RPC cannot mutate decision');
select throws_ok($$select pg_temp.b1_command('return_unrepaired_repair','main')$$,'42501','REPAIR_FORBIDDEN','technician cannot authorize physical return');
select pg_temp.b1_claim('delivery');
select throws_ok($$select pg_temp.b1_command('return_unrepaired_repair','main','{"decision_event_id":null}')$$,'P0001','REPAIR_NON_REPAIRABLE_DECISION_INVALID','current decision required');
select throws_ok($$select pg_temp.b1_command('return_unrepaired_repair','main')$$,'P0001','REPAIR_ACCESSORIES_PENDING','accessories block ordinary return');
select throws_ok($$select pg_temp.b1_command('return_unrepaired_repair','main','{"authorize_exception":true,"exception_reason":"Pending"}')$$,'42501','REPAIR_FORBIDDEN','delivery user cannot authorize exception');
select throws_ok($$select deliver_repair(pg_temp.b1_id('org'),(select repair from b1_f where label='main'),null,5)$$,'P0001','REPAIR_ACCESSORIES_PENDING','old delivery cannot bypass accessories');
select pg_temp.b1_claim('admin');
select throws_ok($$select pg_temp.b1_command('return_unrepaired_repair','main','{"authorize_exception":true,"exception_reason":" "}')$$,'22023','REPAIR_ACCESSORY_REASON_REQUIRED','exception needs reason');
select lives_ok($$select pg_temp.b1_command('return_unrepaired_repair','main','{"authorize_exception":true,"exception_reason":"Cliente recogerá cable","operation_key":"b1280000-0000-4000-8000-000000000002"}')$$,'exception returns equipment without pretending successful repair');
select is((select status from repairs where id=(select repair from b1_f where label='main')),'returned_unrepaired','physical return has separate state');
select ok((select delivered_at is null and returned_unrepaired_at=now() and non_repairable_decision_event_id is not null from repairs where id=(select repair from b1_f where label='main')),'decision survives and ordinary delivery timestamp remains null');
select lives_ok($$select pg_temp.b1_command('return_unrepaired_repair','main','{"authorize_exception":true,"exception_reason":"Cliente recogerá cable","operation_key":"b1280000-0000-4000-8000-000000000002","expected_lock_version":5}')$$,'physical return replay creates no duplicate');
select is((select count(*) from repair_tests where repair_id=(select repair from b1_f where label='main')),0::bigint,'no successful test invented');
select is((select quantity_pending from jsonb_to_recordset(get_repair_accessories(pg_temp.b1_id('org'),(select repair from b1_f where label='main'))->'accessories') as a(quantity_pending bigint)),2::bigint,'exception does not pretend accessory return');
select lives_ok($$select record_repair_accessory_return(jsonb_build_object('organization_id',pg_temp.b1_id('org'),'repair_id',(select repair from b1_f where label='main'),'expected_lock_version',6,'operation_key',gen_random_uuid(),'returns',jsonb_build_array(jsonb_build_object('accessory_id',(select id from repair_accessories where repair_id=(select repair from b1_f where label='main')),'quantity',2))))$$,'accessories regularize after physical return');
select is((select status from repairs where id=(select repair from b1_f where label='main')),'returned_unrepaired','regularization never reopens order');
select is((select actor_user_id from repair_events where repair_id=(select repair from b1_f where label='main') and event_type='RETURNED_UNREPAIRED'),pg_temp.b1_id('admin'),'physical return records actor');
select throws_ok($$select configure_repair_service_warranty(pg_temp.b1_payload('main','{"warranty_days":90,"coverage":"Wrong warranty"}'))$$,'P0001','REPAIR_SERVICE_WARRANTY_STATE_INVALID','unrepaired return cannot create successful-service warranty');
select throws_ok($$select update_repair(jsonb_build_object('organization_id',pg_temp.b1_id('org'),'id',(select repair from b1_f where label='main'),'expected_lock_version',7,'notes','Bypass'))$$,'P0001','REPAIR_NOT_EDITABLE','old update cannot edit returned order');
select pg_temp.b1_claim('tech');
select throws_ok($$select pg_temp.b1_command('reopen_repair_non_repairable_assessment','main')$$,'P0001','REPAIR_NON_REPAIRABLE_STATE_INVALID','returned order cannot reopen');
select lives_ok($$select pg_temp.b1_command('declare_repair_non_repairable','reopen')$$,'second repair declared');
select throws_ok($$select pg_temp.b1_command('reopen_repair_non_repairable_assessment','reopen','{"reason":""}')$$,'22023','REPAIR_NON_REPAIRABLE_REASON_REQUIRED','reassessment needs reason');
select throws_ok($$select pg_temp.b1_command('reopen_repair_non_repairable_assessment','reopen','{"decision_event_id":"1"}')$$,'P0001','REPAIR_NON_REPAIRABLE_DECISION_INVALID','wrong decision cannot revoke');
select lives_ok($$select pg_temp.b1_command('reopen_repair_non_repairable_assessment','reopen','{"reason":"Segunda evaluación solicitada","operation_key":"b1280000-0000-4000-8000-000000000003"}')$$,'explicit reassessment returns to diagnosis');
select lives_ok($$select pg_temp.b1_command('reopen_repair_non_repairable_assessment','reopen',jsonb_build_object('reason','Segunda evaluación solicitada','operation_key','b1280000-0000-4000-8000-000000000003','expected_lock_version',5,
 'decision_event_id',(select id::text from repair_events where repair_id=(select repair from b1_f where label='reopen') and event_type='NON_REPAIRABLE_DECLARED')))$$,'reassessment replay preserves revoked decision history');
select ok((select status='diagnosis' and non_repairable_decision_event_id is null from repairs where id=(select repair from b1_f where label='reopen')),'only current decision reference cleared');
select is((select count(*) from repair_events where repair_id=(select repair from b1_f where label='reopen') and event_type in ('NON_REPAIRABLE_DECLARED','NON_REPAIRABLE_REOPENED')),2::bigint,'decision and revocation both retained');
select is((select count(*) from repair_diagnostics where repair_id=(select repair from b1_f where label='reopen')),1::bigint,'diagnosis not deleted');

-- Supplier custody can coexist with the conclusion, never with physical return.
reset role;
insert into suppliers(id,organization_id,code,document_type,document_number,business_name)
values(pg_temp.b1_id('foreign'),pg_temp.b1_id('org'),'B1-SUPPLIER','otro','B1-SUPPLIER','Proveedor B1');
set local role authenticated;
select pg_temp.b1_claim('admin');
select lives_ok($$select send_repair_external_service(pg_temp.b1_payload('external',jsonb_build_object('supplier_id',pg_temp.b1_id('foreign'),'description','Evaluar placa')))$$,'existing supplier send used');
select pg_temp.b1_claim('tech');
select lives_ok($$select pg_temp.b1_command('declare_repair_non_repairable','external')$$,'internal technician can confirm while equipment at supplier');
select pg_temp.b1_claim('admin');
select throws_ok($$select pg_temp.b1_command('return_unrepaired_repair','external')$$,'P0001','REPAIR_EXTERNAL_SERVICE_OUTSTANDING','absent equipment cannot return to customer');
select lives_ok($$select receive_repair_external_service(pg_temp.b1_payload('external',jsonb_build_object('external_service_id',(select id from repair_external_services where repair_id=(select repair from b1_f where label='external')),'cost_amount',45,'currency','PEN')))$$,'existing supplier return still works');
select is((select status from repairs where id=(select repair from b1_f where label='external')),'non_repairable','supplier return preserves conclusion');
select lives_ok($$select pg_temp.b1_command('return_unrepaired_repair','external')$$,'ordinary unrepaired return after custody ends');
select is((select cost_amount from repair_external_services where repair_id=(select repair from b1_f where label='external')),45::numeric,'incurred external cost preserved');
select throws_ok($$select pg_temp.b1_command('return_unrepaired_repair','external')$$,'P0001','REPAIR_NON_REPAIRABLE_STATE_INVALID','new intent cannot return twice');
select is((select count(*) from inventory_movements where organization_id=pg_temp.b1_id('org')),0::bigint,'customer equipment and accessories never create stock');

-- Real inventory commands: B1 must neither release reservations nor replenish consumptions.
reset role;
insert into b1_ids(label) values('product');
insert into products(id,organization_id,code,description,unit_of_measure,cost,sale_price,batch_control,expiration_control)
values(pg_temp.b1_id('product'),pg_temp.b1_id('org'),'B1-PART','Repuesto B1','UND',5,10,false,false);
select pg_temp.b1_claim('admin');
insert into b1_ids(label,id) select 'warehouse',save_warehouse(jsonb_build_object('organization_id',pg_temp.b1_id('org'),
 'operation_key',gen_random_uuid(),'code','B1-WH','name','B1 warehouse','address','Fixture'));
set local role authenticated;
select lives_ok($$select record_inventory_movement(jsonb_build_object('organization_id',pg_temp.b1_id('org'),
 'product_id',pg_temp.b1_id('product'),'warehouse_id',pg_temp.b1_id('warehouse'),'location_id',(select id from warehouse_locations where warehouse_id=pg_temp.b1_id('warehouse') and code='GENERAL'),
 'movement_type','entrada','quantity',10,'unit_cost',5,'stock_status','available','operation_date',current_date,'reason','Stock B1','document_reference','B1-STOCK'))$$,'real disposable stock prepared');
select change_repair_status(pg_temp.b1_id('org'),(select repair from b1_f where label='parts'),'in_repair',null,4);
select change_repair_status(pg_temp.b1_id('org'),(select repair from b1_f where label='consumed'),'in_repair',null,4);
select reserve_repair_part(pg_temp.b1_payload('parts',jsonb_build_object('product_id',pg_temp.b1_id('product'),
 'warehouse_id',pg_temp.b1_id('warehouse'),'location_id',(select id from warehouse_locations where warehouse_id=pg_temp.b1_id('warehouse') and code='GENERAL'),
 'stock_status','available','quantity_requested',2)));
select reserve_repair_part(pg_temp.b1_payload('consumed',jsonb_build_object('product_id',pg_temp.b1_id('product'),
 'warehouse_id',pg_temp.b1_id('warehouse'),'location_id',(select id from warehouse_locations where warehouse_id=pg_temp.b1_id('warehouse') and code='GENERAL'),
 'stock_status','available','quantity_requested',2)));
select pg_temp.b1_claim('tech');
select throws_ok($$select pg_temp.b1_command('declare_repair_non_repairable','parts')$$,'P0001','REPAIR_PENDING_PARTS','pending reservation blocks decision');
select is((select status from repair_parts where repair_id=(select repair from b1_f where label='parts')),'reserved','decision never releases reservation automatically');
select pg_temp.b1_claim('admin');
select consume_repair_part(pg_temp.b1_payload('consumed',jsonb_build_object('repair_part_id',(select id from repair_parts where repair_id=(select repair from b1_f where label='consumed')),'quantity',1)));
select cancel_repair_part(pg_temp.b1_id('org'),(select id from repair_parts where repair_id=(select repair from b1_f where label='parts')),'Saldo no requerido',6);
select cancel_repair_part(pg_temp.b1_id('org'),(select id from repair_parts where repair_id=(select repair from b1_f where label='consumed')),'Liberar solo saldo',7);
select pg_temp.b1_claim('tech');
select lives_ok($$select pg_temp.b1_command('declare_repair_non_repairable','parts')$$,'decision after authorized release');
select lives_ok($$select pg_temp.b1_command('declare_repair_non_repairable','consumed')$$,'previous consumed parts do not imply successful repair');
select pg_temp.b1_claim('admin');
select lives_ok($$select pg_temp.b1_command('return_unrepaired_repair','consumed')$$,'consumed repair returned without replenishing stock');
select is((select count(*) from repair_part_consumptions where organization_id=pg_temp.b1_id('org')),1::bigint,'consumption retained');
select is((select count(*) from inventory_movements where organization_id=pg_temp.b1_id('org') and source_type='repair-consumption'),1::bigint,'historical consumption movement retained');
select is((select sum(case when movement_type='entrada' then quantity else -quantity end) from inventory_movements where organization_id=pg_temp.b1_id('org')),9::numeric,'physical stock remains 9, not automatically replenished');
select is((select unit_cost from repair_part_consumptions where organization_id=pg_temp.b1_id('org')),5::numeric,'incurred consumption cost retained');

-- A pre-existing warranty promise remains stored but never starts on unrepaired return.
reset role;
insert into repair_service_warranties(organization_id,repair_id,warranty_days,coverage)
select pg_temp.b1_id('org'),repair,90,'Promesa previa' from b1_f where label='parts';
set local role authenticated;
select lives_ok($$select pg_temp.b1_command('return_unrepaired_repair','parts')$$,'return with prior warranty promise');
select ok((select starts_at is null and ends_at is null from repair_service_warranty_details where repair_id=(select repair from b1_f where label='parts')),'no warranty dates invented');
select is((select coverage from repair_service_warranties where repair_id=(select repair from b1_f where label='parts')),'Promesa previa','warranty promise not deleted');
select throws_ok($$select assign_repair(pg_temp.b1_id('org'),(select repair from b1_f where label='parts'),pg_temp.b1_id('other-tech'),(select lock_version from repairs where id=(select repair from b1_f where label='parts')))$$,'P0001','REPAIR_NOT_EDITABLE','old assignment cannot mutate returned repair');
select throws_ok($$select update_repair(jsonb_build_object('organization_id',pg_temp.b1_id('org'),'id',(select repair from b1_f where label='parts'),'expected_lock_version',(select lock_version from repairs where id=(select repair from b1_f where label='parts'))))$$,
 'P0001','REPAIR_NOT_EDITABLE','even no-op legacy updates cannot advance closed order');

reset role;

-- Fingerprint every domain effect, including audit/ledger rows not visible to
-- the technical actor. This test-only helper reads, never bypasses a command.
create function pg_temp.b1_snapshot(label text) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('repair',to_jsonb(r),
   'events',(select count(*) from public.repair_events where organization_id=r.organization_id and repair_id=r.id),
   'audits',(select count(*) from public.audit_events where organization_id=r.organization_id and entity_id=r.id::text),
   'commands',(select count(*) from public.repair_command_operations where organization_id=r.organization_id and result_id=r.id),
   'returns',(select count(*) from public.repair_accessory_returns where organization_id=r.organization_id and repair_id=r.id))
 from public.repairs r join pg_temp.b1_f f on f.repair=r.id where f.label=$1
$$;
select pg_temp.b1_fixture('blank-declare');
select pg_temp.b1_fixture('blank-reopen');
select pg_temp.b1_fixture('blank-exception','[{"name":"Cable","quantity_received":2}]');
select pg_temp.b1_claim('tech');
select pg_temp.b1_command('declare_repair_non_repairable','blank-reopen');
select pg_temp.b1_command('declare_repair_non_repairable','blank-exception');

create function pg_temp.b1_invalid_reasons() returns setof text language plpgsql as $$
declare command text; label text; field text; message text; raw text; baseline jsonb; extra jsonb; i integer;
begin
 foreach command in array array['declare_repair_non_repairable','reopen_repair_non_repairable_assessment','return_unrepaired_repair'] loop
   label:=case command when 'declare_repair_non_repairable' then 'blank-declare'
     when 'reopen_repair_non_repairable_assessment' then 'blank-reopen' else 'blank-exception' end;
   field:=case when command='return_unrepaired_repair' then 'exception_reason' else 'reason' end;
   message:=case when command='return_unrepaired_repair' then 'REPAIR_ACCESSORY_REASON_REQUIRED' else 'REPAIR_NON_REPAIRABLE_REASON_REQUIRED' end;
   perform pg_temp.b1_claim(case when command='return_unrepaired_repair' then 'admin' else 'tech' end);
   baseline:=pg_temp.b1_snapshot(label); i:=0;
   foreach raw in array array['','   ',E'\t',E'\n',E'\r\n',E' \t\n ',U&'\00A0\FEFF',U&'\2028\2029',repeat('x',2001)] loop
     i:=i+1;
     extra:=jsonb_build_object(field,raw);
     if command='return_unrepaired_repair' then extra:=extra||'{"authorize_exception":true}'::jsonb; end if;
     return next throws_ok(format('select pg_temp.b1_command(%L,%L,%L::jsonb)',command,label,extra),
       '22023',message,command||': rejects empty/whitespace/overlength vector '||i);
     return next is(pg_temp.b1_snapshot(label),baseline,command||': rejection leaves repair, audit, events, ledger and returns unchanged '||i);
   end loop;
 end loop;
end $$;
set local role authenticated;
select * from pg_temp.b1_invalid_reasons();
reset role;

-- Positive vectors exercise the public RPC, not merely the normalizer. Only
-- boundary whitespace is trimmed; internal tabs/newlines remain meaningful.
create function pg_temp.b1_valid_reasons() returns setof text language plpgsql as $$
#variable_conflict use_variable
declare command text; label text; raw text; expected text; actual text; i integer; j integer; event_type text;
  raws text[]:=array['Motivo válido',E' \tMotivo\tinterno\nválido\r\n ',repeat('x',2000),U&'\00A0Motivo Unicode\FEFF'];
  normalized text[]:=array['Motivo válido',E'Motivo\tinterno\nválido',repeat('x',2000),'Motivo Unicode'];
begin
 j:=0;
 foreach command in array array['declare_repair_non_repairable','reopen_repair_non_repairable_assessment','return_unrepaired_repair'] loop
   j:=j+1;
   for i in 1..array_length(raws,1) loop
     label:='valid-reason-'||j||'-'||i; raw:=raws[i]; expected:=normalized[i];
     perform pg_temp.b1_fixture(label,case when command='return_unrepaired_repair' then '[{"name":"Cable","quantity_received":2}]'::jsonb else '[]'::jsonb end);
     perform pg_temp.b1_claim('tech');
     if command<>'declare_repair_non_repairable' then perform pg_temp.b1_command('declare_repair_non_repairable',label); end if;
     if command='return_unrepaired_repair' then perform pg_temp.b1_claim('admin'); end if;
     return next lives_ok(format('select pg_temp.b1_command(%L,%L,%L::jsonb)',command,label,
       case when command='return_unrepaired_repair' then jsonb_build_object('authorize_exception',true,'exception_reason',raw) else jsonb_build_object('reason',raw) end),command||': valid reason '||i);
     event_type:=case command when 'declare_repair_non_repairable' then 'NON_REPAIRABLE_DECLARED'
       when 'reopen_repair_non_repairable_assessment' then 'NON_REPAIRABLE_REOPENED' else 'ACCESSORY_DELIVERY_EXCEPTION' end;
     select e.observation into actual from repair_events e join b1_f f on e.repair_id=f.repair where f.label=label and e.event_type=event_type;
     return next is(actual,expected,command||': keeps legitimate internal formatting and existing length limit '||i);
   end loop;
 end loop;
end $$;
select * from pg_temp.b1_valid_reasons();

-- Real legacy state gate, not the earlier accessories gate, and partial-return rollback.
select pg_temp.b1_fixture('legacy-gate');
select pg_temp.b1_fixture('atomic-return','[{"name":"Cable","quantity_received":2},{"name":"Sensor","quantity_received":1}]');
select pg_temp.b1_claim('tech');
select pg_temp.b1_command('declare_repair_non_repairable','legacy-gate');
select pg_temp.b1_command('declare_repair_non_repairable','atomic-return');
select pg_temp.b1_claim('admin');
set local role authenticated;
select throws_ok($$select deliver_repair_with_accessories(pg_temp.b1_payload('legacy-gate','{"returns":[]}'))$$,
 'P0001','REPAIR_DELIVERY_STATE_REQUIRED','old JSON delivery reaches and rejects its ordinary state gate without accessories');
select throws_ok($$select deliver_repair(pg_temp.b1_id('org'),(select repair from b1_f where label='legacy-gate'),null,
 (select lock_version from repairs where id=(select repair from b1_f where label='legacy-gate')))$$,
 'P0001','REPAIR_DELIVERY_STATE_REQUIRED','old positional delivery also rejects ordinary state gate');
reset role;
create temporary table b1_before_atomic as select pg_temp.b1_snapshot('atomic-return') as snapshot;
grant select on b1_before_atomic to authenticated;
set local role authenticated;
select throws_ok($$select pg_temp.b1_command('return_unrepaired_repair','atomic-return',jsonb_build_object('returns',jsonb_build_array(
 jsonb_build_object('accessory_id',(select a.id from repair_accessories a join b1_f f on f.repair=a.repair_id where f.label='atomic-return' and a.name='Cable'),'quantity',1))))$$,
 'P0001','REPAIR_ACCESSORIES_PENDING','partial accessory return without exception rejects entire physical return');
select is(pg_temp.b1_snapshot('atomic-return'),(select snapshot from b1_before_atomic),'partial return leaves no physical, accessory, ledger or audit effect');
reset role;

create function pg_temp.b1_reassigned_replay() returns setof text language plpgsql as $$
declare p jsonb; repair uuid;
begin
 perform pg_temp.b1_fixture('reassigned-replay');
 select f.repair into repair from b1_f f where label='reassigned-replay';
 perform pg_temp.b1_claim('tech'); p:=pg_temp.b1_payload('reassigned-replay');
 perform declare_repair_non_repairable(p);
 perform pg_temp.b1_claim('admin'); perform assign_repair(pg_temp.b1_id('org'),repair,pg_temp.b1_id('other-tech'),5);
 perform pg_temp.b1_claim('tech');
 return next lives_ok(format('select declare_repair_non_repairable(%L::jsonb)',p),'original committed command can replay after reassignment');
 return next throws_ok($test$select pg_temp.b1_command('declare_repair_non_repairable','reassigned-replay')$test$,
   '42501','REPAIR_NON_REPAIRABLE_ASSIGNED_TECHNICIAN_REQUIRED','old technician cannot create a new decision after reassignment');
 return next is((select lock_version from repairs where id=repair),6::bigint,'reassigned replay advances no version');
 return next is((select count(*) from repair_events where repair_id=repair and event_type='NON_REPAIRABLE_DECLARED'),1::bigint,'reassigned replay creates no second event');
end $$;
select * from pg_temp.b1_reassigned_replay();

create function pg_temp.b1_reassessment_test_cycle() returns setof text language plpgsql as $$
declare repair uuid; version bigint;
begin
 perform pg_temp.b1_fixture('previous-passed-cycle');
 select f.repair into repair from b1_f f where label='previous-passed-cycle';
 perform pg_temp.b1_claim('tech');
 perform change_repair_status(pg_temp.b1_id('org'),repair,'in_repair',null,4);
 perform change_repair_status(pg_temp.b1_id('org'),repair,'testing',null,5);
 perform record_repair_test(pg_temp.b1_payload('previous-passed-cycle','{"test_type":"Encendido","result":"Aprobada en ciclo anterior","passed":true}'));
 perform pg_temp.b1_command('declare_repair_non_repairable','previous-passed-cycle');
 perform pg_temp.b1_command('reopen_repair_non_repairable_assessment','previous-passed-cycle','{"reason":"Nueva evaluación técnica"}');
 select lock_version into version from repairs where id=repair;
 perform change_repair_status(pg_temp.b1_id('org'),repair,'in_repair',null,version);
 perform change_repair_status(pg_temp.b1_id('org'),repair,'testing',null,version+1);
 return next is((select current_test_cycle_number from repairs where id=repair),2,'reevaluation starts a new explicit testing cycle');
 return next is((select count(*) from repair_tests where repair_id=repair and test_cycle_number=1 and passed),1::bigint,'previous successful result remains historical');
 return next is((select count(*) from repair_tests where repair_id=repair and test_cycle_number=2),0::bigint,'new cycle does not inherit approval');
 return next throws_ok(format('select change_repair_status(%L::uuid,%L::uuid,''ready_for_delivery'',null,%s)',pg_temp.b1_id('org'),repair,version+2),
   'P0001','REPAIR_APPROVED_TEST_REQUIRED','ordinary delivery-ready gate requires a new successful test');
end $$;
select * from pg_temp.b1_reassessment_test_cycle();
reset role;
select * from finish();
rollback;
