begin;
select no_plan();
create temporary table r14_ids(label text primary key,id uuid default gen_random_uuid());
insert into r14_ids(label) values('org'),('foreign-org'),('admin'),('finance'),('manager'),('reviewer'),('reader'),('tech'),('foreign'),('supplier'),('warehouse'),('location');
create function pg_temp.r14_id(text) returns uuid language sql as $$select id from r14_ids where label=$1$$;
insert into organizations(id,name,slug) select id,'R14 fixtures','r14-'||id from r14_ids where label in ('org','foreign-org');
insert into auth.users(id,email,raw_user_meta_data) select id,id||'@example.invalid',jsonb_build_object('full_name','R14 '||label)
 from r14_ids where label in ('admin','finance','manager','reviewer','reader','tech','foreign');
insert into auth.sessions(id,user_id,created_at,updated_at) select id,id,now(),now() from r14_ids where label in ('admin','finance','manager','reviewer','reader','tech','foreign');
insert into organization_memberships(organization_id,user_id) select pg_temp.r14_id(case when label='foreign' then 'foreign-org' else 'org' end),id
 from r14_ids where label in ('admin','finance','manager','reviewer','reader','tech','foreign');
insert into user_roles(organization_id,user_id,role_code) select pg_temp.r14_id(case when label='foreign' then 'foreign-org' else 'org' end),id,
 case when label in ('admin','foreign') then 'ADMIN' when label='tech' then 'TECNICO_REPARACIONES' else 'VENTAS' end
 from r14_ids where label in ('admin','finance','manager','reviewer','reader','tech','foreign');
insert into organization_user_permissions(organization_id,user_id,permission_code)
 select pg_temp.r14_id('org'),pg_temp.r14_id(who),cap from (values('finance','REPAIRS_MANAGE_ACTUAL_COST'),('finance','REPAIRS_CONFIRM_ACTUAL_COST'),
 ('manager','REPAIRS_MANAGE_ACTUAL_COST'),('reviewer','REPAIRS_CONFIRM_ACTUAL_COST')) t(who,cap);
create function pg_temp.r14_claim(who text) returns text language sql as $$select set_config('request.jwt.claims',jsonb_build_object(
 'role','authenticated','sub',pg_temp.r14_id(who),'session_id',pg_temp.r14_id(who))::text,true)$$;
create temporary table r14_f(label text primary key,repair uuid,diagnosis uuid,part uuid);
create temporary table r14_saved(label text primary key,payload jsonb,value jsonb,id uuid);
grant select,insert,update on r14_ids,r14_f,r14_saved to authenticated;
select pg_temp.r14_claim('admin');
insert into suppliers(id,organization_id,document_type,document_number,business_name,created_by,updated_by)
values(pg_temp.r14_id('supplier'),pg_temp.r14_id('org'),'ruc','20999999993','R14 supplier',pg_temp.r14_id('admin'),pg_temp.r14_id('admin'));
update r14_ids set id=save_warehouse(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'operation_key',gen_random_uuid(),
 'code','R14-WH','name','R14 warehouse','address','Disposable R14')) where label='warehouse';
update r14_ids set id=(select id from warehouse_locations where warehouse_id=pg_temp.r14_id('warehouse') and code='GENERAL') where label='location';
create function pg_temp.r14_fixture(label text,initial_warranty boolean default false) returns void language plpgsql as $$declare r uuid; d uuid; begin
 perform pg_temp.r14_claim('admin');
 r:=create_repair(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'operation_key',gen_random_uuid(),'requester_type','internal','requesting_area','R14 lab',
 'equipment_type','external','external_equipment_description','R14 equipment','problem_description','No enciende','accessories','[]'::jsonb,
 'status',case when initial_warranty then 'warranty' else 'received' end));
 if initial_warranty then insert into r14_f values(label,r,null,null); perform pg_temp.r14_claim('finance'); return; end if;
 perform assign_repair(pg_temp.r14_id('org'),r,pg_temp.r14_id('tech'),1);
 perform change_repair_status(pg_temp.r14_id('org'),r,'diagnosis',null,2);
 d:=record_repair_diagnosis(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'repair_id',r,'expected_lock_version',3,'symptoms','R14 diagnosis'));
 perform change_repair_status(pg_temp.r14_id('org'),r,'in_repair',null,4);
 insert into r14_f values(label,r,d,null); perform pg_temp.r14_claim('finance');
end $$;
create function pg_temp.r14_payload(label text,extra jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_object('organization_id',pg_temp.r14_id('org'),'repair_id',r.id,'expected_lock_version',r.lock_version,'operation_key',gen_random_uuid(),
 'evidence_reference','Documento '||gen_random_uuid(),'reason','Registro real documentado')||extra
 from r14_f f join repairs r on r.id=f.repair where f.label=$1
$$;
create function pg_temp.r14_summary(label text) returns jsonb language sql as $$
 select get_repair_actual_cost_summaries(pg_temp.r14_id('org'),array[(select repair from r14_f where label=$1)])->0
$$;
create function pg_temp.r14_item(label text,kind text) returns jsonb language sql as $$
 select value from jsonb_array_elements(get_repair_actual_cost_detail(pg_temp.r14_id('org'),(select repair from r14_f where label=$1),0,50)->'items')
 where value->>'source_kind'=$2 limit 1
$$;
create function pg_temp.r14_record(label text,amount text default '12.50',currency text default 'PEN',basis text default 'not_applicable',category text default 'labor') returns uuid language sql as $$
 select record_repair_actual_cost(pg_temp.r14_payload($1,jsonb_build_object('category',$5,'description','Trabajo efectivamente realizado','amount',$2,
 'currency',$3,'cost_basis',$4,'incurred_on',(now() at time zone 'America/Lima')::date)))
$$;
create function pg_temp.r14_scope(label text) returns jsonb language sql as $$
 select jsonb_object_agg(kind,case when exists(select 1 from jsonb_array_elements(pg_temp.r14_summary($1)->'components') c where c->>'component'=kind)
 then 'complete' else 'not_applicable' end) from unnest(array['consumption','external','labor','other']) kind
$$;
create function pg_temp.r14_confirm(label text) returns uuid language sql as $$
 select confirm_repair_actual_cost_review(pg_temp.r14_payload($1,jsonb_build_object('source_fingerprint',pg_temp.r14_summary($1)->>'source_fingerprint',
 'scope',pg_temp.r14_scope($1),'empty_currency','PEN')))
$$;
create function pg_temp.r14_snapshot(label text) returns jsonb language sql security definer as $$
 select jsonb_build_object('repair',to_jsonb(r),'entries',(select jsonb_agg(to_jsonb(e) order by sequence_number) from repair_actual_cost_entries e where e.repair_id=r.id),
 'sources',(select jsonb_agg(to_jsonb(e) order by sequence_number) from repair_cost_source_reviews e where e.repair_id=r.id),
 'reviews',(select jsonb_agg(to_jsonb(e) order by sequence_number) from repair_actual_cost_reviews e where e.repair_id=r.id),
 'events',(select jsonb_agg(to_jsonb(e) order by id) from repair_events e where e.repair_id=r.id),
 'audits',(select jsonb_agg(to_jsonb(e) order by id) from audit_events e where e.entity_id=r.id::text),
 'ledger',(select jsonb_agg(to_jsonb(e) order by operation_key) from repair_command_operations e where e.request_payload->>'repair_id'=r.id::text))
 from r14_f f join repairs r on r.id=f.repair where f.label=$1
$$;
create function pg_temp.r14_purchase(currency text default 'PEN',cost numeric default 5,product uuid default null,
 includes_tax boolean default false,lot text default null,expiry date default null,tax text default 'gravado') returns uuid language plpgsql as $$
declare p uuid:=coalesce(product,gen_random_uuid()); po uuid; ri uuid; ref text:=gen_random_uuid()::text;
begin
 perform pg_temp.r14_claim('admin');
 if product is null then insert into products(id,organization_id,code,description,unit_of_measure,product_type,tax_affectation,batch_control,expiration_control,created_by,updated_by)
  values(p,pg_temp.r14_id('org'),'R14-'||upper(substr(p::text,1,8)),'R14 purchased part','UND','good',tax,false,false,pg_temp.r14_id('admin'),pg_temp.r14_id('admin')); end if;
 po:=save_purchase_order(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'supplier_id',pg_temp.r14_id('supplier'),'document_type','factura',
 'series','R14','document_number',substr(ref,1,8),'issue_date',(now() at time zone 'America/Lima')::date,'warehouse_id',pg_temp.r14_id('warehouse'),
  'warehouse','R14 warehouse','currency',currency,'prices_include_tax',includes_tax,'items',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',10,'unit_cost',cost))));
 perform issue_purchase_order(pg_temp.r14_id('org'),po);
 select id into ri from purchase_order_items where purchase_order_id=po;
 perform receive_purchase_order_partial_inspected(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'purchase_order_id',po,'operation_key',gen_random_uuid(),
  'items',jsonb_build_array(jsonb_build_object('purchase_order_item_id',ri,'quantity',10,'location_id',pg_temp.r14_id('location'),
    'fulfillment_mode','physical','lot',lot,'expiration_date',expiry))));
 perform pg_temp.r14_claim('finance'); return p;
end $$;
create function pg_temp.r14_reserve(label text,product uuid,requested numeric default 2,lot text default null,
 expiry date default null,location uuid default null) returns uuid language plpgsql as $$declare p uuid; r uuid; version bigint; begin
 perform pg_temp.r14_claim('admin'); select f.repair into r from r14_f f where f.label=$1; select lock_version into version from repairs where id=r;
 p:=reserve_repair_part(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'repair_id',r,'expected_lock_version',version,'operation_key',gen_random_uuid(),
  'product_id',product,'warehouse_id',pg_temp.r14_id('warehouse'),'location_id',coalesce(location,pg_temp.r14_id('location')),
  'stock_status','available','quantity_requested',requested,'lot',lot,'expiration_date',expiry));
 update r14_f set part=p where r14_f.label=$1; perform pg_temp.r14_claim('finance'); return p;
end $$;
create function pg_temp.r14_consume(label text,quantity numeric) returns uuid language plpgsql as $$declare result uuid; begin
 perform pg_temp.r14_claim('admin');
 select consume_repair_part(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'repair_part_id',f.part,'quantity',$2,'operation_key',gen_random_uuid(),
 'expected_lock_version',r.lock_version)) into result from r14_f f join repairs r on r.id=f.repair where f.label=$1;
 perform pg_temp.r14_claim('finance'); return result;
end $$;
create function pg_temp.r14_verify(label text,kind text,currency text default 'PEN',basis text default 'tax_exclusive') returns uuid language sql as $$
 select verify_repair_cost_source(pg_temp.r14_payload($1,jsonb_build_object('source_kind',$2,'source_id',pg_temp.r14_item($1,$2)->>'source_id','currency',$3,'cost_basis',$4)))
$$;
create function pg_temp.r14_external(label text,amount numeric default null,currency text default 'PEN') returns uuid language plpgsql as $$declare r uuid; version bigint; s uuid; begin
 perform pg_temp.r14_claim('admin'); select f.repair into r from r14_f f where f.label=$1; select lock_version into version from repairs where id=r;
 s:=send_repair_external_service(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'repair_id',r,'expected_lock_version',version,'operation_key',gen_random_uuid(),
 'supplier_id',pg_temp.r14_id('supplier'),'description','Servicio R14 real'));
 if amount is not null then select lock_version into version from repairs where id=r;
 perform receive_repair_external_service(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'repair_id',r,'expected_lock_version',version,'operation_key',gen_random_uuid(),
 'external_service_id',s,'cost_amount',amount,'currency',currency)); end if;
 perform pg_temp.r14_claim('finance'); return s;
end $$;

select has_table('public','repair_actual_cost_entries','manual cost evidence exists');
select has_table('public','repair_cost_source_reviews','source evidence exists');
select has_table('public','repair_actual_cost_reviews','scope review exists');
select is((select count(*) from role_permissions where permission_code in ('REPAIRS_MANAGE_ACTUAL_COST','REPAIRS_CONFIRM_ACTUAL_COST')),0::bigint,'no automatic role grant, including ADMIN');
select is((select normalize_operational_permission_codes(array['REPAIRS_MANAGE_ACTUAL_COST'])),array['REPAIRS_MANAGE_ACTUAL_COST','REPAIRS_VIEW']::text[],'new capability is explicitly assignable with view dependency');
select is(has_table_privilege('authenticated','repair_actual_cost_entries','INSERT'),false,'direct economic insert denied');
select is(has_function_privilege('authenticated','repair_actual_cost_items(uuid,uuid[])','EXECUTE'),false,'source helper is private');
select is(has_function_privilege('service_role','record_repair_actual_cost(jsonb)','EXECUTE'),false,'no delegated financial actor');
select pg_temp.r14_fixture('main'); select pg_temp.r14_fixture('empty'); select pg_temp.r14_fixture('mixed'); select pg_temp.r14_fixture('basis');
select pg_temp.r14_fixture('parts'); select pg_temp.r14_fixture('manual-stock'); select pg_temp.r14_fixture('zero-stock'); select pg_temp.r14_fixture('mixed-stock');
select pg_temp.r14_fixture('external'); select pg_temp.r14_fixture('many-external'); select pg_temp.r14_fixture('terminal'); select pg_temp.r14_fixture('precision');
select pg_temp.r14_fixture('cancelled'); select pg_temp.r14_fixture('delivered'); select pg_temp.r14_fixture('warranty',true);
set local role authenticated;
select pg_temp.r14_claim('admin');
select throws_ok($$select pg_temp.r14_record('main')$$,'42501','REPAIR_FORBIDDEN','ADMIN does not inherit financial management');
select pg_temp.r14_claim('tech');
select throws_ok($$select pg_temp.r14_record('main')$$,'42501','REPAIR_FORBIDDEN','technical capability is not economic');
select pg_temp.r14_claim('reader');
select is(pg_temp.r14_summary('main')->>'state','undetermined','reader can see unknown cost, never default zero');
select pg_temp.r14_claim('manager');
select throws_ok($$select pg_temp.r14_confirm('empty')$$,'42501','REPAIR_FORBIDDEN','management and confirmation are separate');
select pg_temp.r14_claim('reviewer');
select throws_ok($$select pg_temp.r14_record('main')$$,'42501','REPAIR_FORBIDDEN','confirmation does not grant editing');
select pg_temp.r14_claim('finance');
insert into r14_saved(label,value) values('before-invalid',pg_temp.r14_snapshot('main'));
create function pg_temp.r14_invalid_amounts() returns setof text language plpgsql as $$declare a text; begin
 foreach a in array array['-1','1.001','NaN','Infinity','-Infinity','1e3','',' ','99999999999999999.99'] loop
 return next throws_ok(format('select pg_temp.r14_record(''main'',%L)',a),'22023','REPAIR_COST_AMOUNT_INVALID','invalid money '||a);
 end loop;
end $$;
select * from pg_temp.r14_invalid_amounts();
select is(pg_temp.r14_snapshot('main'),(select value from r14_saved where label='before-invalid'),'invalid amounts leave no event/audit/ledger/version change');
select throws_ok($$select record_repair_actual_cost(pg_temp.r14_payload('main','{"actor_id":"spoof"}'))$$,'22023','REPAIR_COST_SERVER_FIELDS','actor spoof denied');
select throws_ok($$select record_repair_actual_cost(pg_temp.r14_payload('main','{"recorded_at":"2000-01-01"}'))$$,'22023','REPAIR_COST_SERVER_FIELDS','server date spoof denied');
select throws_ok($$select record_repair_actual_cost(pg_temp.r14_payload('main',jsonb_build_object('evidence_reference',U&'\00A0\2003\3000')))$$,
 '22023','REPAIR_COST_TEXT_REQUIRED','Unicode-only evidence is not documentation');
select lives_ok($$select pg_temp.r14_record('main')$$,'actual labor recorded');
select is(pg_temp.r14_summary('main')->>'state','partial','labor without scope review remains partial');
select is(pg_temp.r14_summary('main')->'subtotals'->0->>'amount','12.50','money is exact text');
select is(pg_temp.r14_summary('main')->'total','null'::jsonb,'no definitive total before review');
select ok((select recorded_by=pg_temp.r14_id('finance') and recorded_by_name='R14 finance' and recorded_at=now()
 from repair_actual_cost_entries where id=(pg_temp.r14_item('main','labor')->>'revision_id')::uuid),'financial actor/name/time come from server');
select throws_ok($$select record_repair_actual_cost(pg_temp.r14_payload('main',jsonb_build_object('category','labor','description','Future work','amount','1.00','currency','PEN',
 'cost_basis','not_applicable','incurred_on',(now() at time zone 'America/Lima')::date+1)))$$,'22023','REPAIR_COST_DATE_INVALID','future declared incurrence rejected');
select pg_temp.r14_record('main','2.00','PEN','not_applicable','other');
insert into r14_saved(label,value) values('cutoff-start',to_jsonb(clock_timestamp()));
select pg_temp.r14_confirm('main');
select is(pg_temp.r14_summary('main')->>'state','confirmed','explicit complete scope confirms');
select ok((pg_temp.r14_summary('main')->'latest_review'->>'cutoff_at')::timestamptz >=
 (select (value#>>'{}')::timestamptz from r14_saved where label='cutoff-start'),'review cutoff is actual server time, not an earlier transaction start');
select is(pg_temp.r14_summary('main')->'total'->>'amount','14.50','labor plus other exactly');
insert into r14_saved(label,value) values('confirmed-main',pg_temp.r14_summary('main'));
select pg_temp.r14_claim('admin');
select assign_repair(pg_temp.r14_id('org'),r.id,pg_temp.r14_id('admin'),r.lock_version) from r14_f f join repairs r on r.id=f.repair where f.label='main';
select pg_temp.r14_claim('finance');
select is(pg_temp.r14_summary('main')->>'state','confirmed','non-economic reassignment does not stale financial review');
insert into r14_saved(label,payload) select 'record-replay',pg_temp.r14_payload('main',jsonb_build_object('category','labor','description','Trabajo adicional','amount','3.10',
 'currency','PEN','cost_basis','not_applicable','incurred_on',(now() at time zone 'America/Lima')::date,'evidence_reference','REPLAY-R14'));
select record_repair_actual_cost(payload) from r14_saved where label='record-replay';
select is(pg_temp.r14_summary('main')->>'state','partial','new economic source stales previous review');
insert into r14_saved(label,value) values('before-replay',pg_temp.r14_snapshot('main'));
select lives_ok($$select record_repair_actual_cost(payload) from r14_saved where label='record-replay'$$,'exact replay with stale version succeeds');
select is(pg_temp.r14_snapshot('main'),(select value from r14_saved where label='before-replay'),'replay preserves event/date/audit/version/ledger');
reset role;
delete from organization_user_permissions where organization_id=pg_temp.r14_id('org') and user_id=pg_temp.r14_id('finance') and permission_code='REPAIRS_MANAGE_ACTUAL_COST';
set local role authenticated;
select throws_ok($$select record_repair_actual_cost(payload) from r14_saved where label='record-replay'$$,'42501','REPAIR_FORBIDDEN','permissions revalidated on exact replay');
reset role;
insert into organization_user_permissions(organization_id,user_id,permission_code) values(pg_temp.r14_id('org'),pg_temp.r14_id('finance'),'REPAIRS_MANAGE_ACTUAL_COST');
delete from auth.sessions where id=pg_temp.r14_id('finance');
set local role authenticated;
select throws_ok($$select record_repair_actual_cost(payload) from r14_saved where label='record-replay'$$,'42501','AUTH_SESSION_INACTIVE','session revalidated on replay');
reset role;
insert into auth.sessions(id,user_id,created_at,updated_at) values(pg_temp.r14_id('finance'),pg_temp.r14_id('finance'),now(),now());
set local role authenticated;
select throws_ok($$select record_repair_actual_cost(payload||'{"amount":"3.11"}') from r14_saved where label='record-replay'$$,'P0001','REPAIR_OPERATION_KEY_REUSED','changed intent cannot reuse key');
select throws_ok($$select record_repair_actual_cost(payload||jsonb_build_object('operation_key',gen_random_uuid())) from r14_saved where label='record-replay'$$,'P0001','REPAIR_VERSION_CONFLICT','distinct stale key conflicts');
select throws_ok($$select record_repair_actual_cost(pg_temp.r14_payload('main',jsonb_build_object('category','other','description','Duplicado','amount','3.10','currency','PEN',
 'cost_basis','not_applicable','incurred_on',(now() at time zone 'America/Lima')::date,'evidence_reference','REPLAY-R14')))$$,'P0001','REPAIR_COST_DUPLICATE_REFERENCE','same document-line reference cannot create another root');
insert into r14_saved(label,id) select 'line-main',(pg_temp.r14_item('main','labor')->>'revision_id')::uuid;
select revise_repair_actual_cost(pg_temp.r14_payload('main',jsonb_build_object('entry_id',id,'description','Trabajo corregido','amount','10.00','currency','PEN','cost_basis','not_applicable',
 'incurred_on',(now() at time zone 'America/Lima')::date))) from r14_saved where label='line-main';
select ok((select count(*) from repair_actual_cost_entries where supersedes_id=(select id from r14_saved where label='line-main'))=1,'correction appends successor');
select pg_temp.r14_confirm('main');
select revise_repair_actual_cost(pg_temp.r14_payload('main',jsonb_build_object('entry_id',pg_temp.r14_item('main','other')->>'revision_id','void',true)));
select is(pg_temp.r14_summary('main')->>'state','partial','explicit void also stales review');
select is((select count(*) from repair_actual_cost_entries where repair_id=(select repair from r14_f where label='main') and is_void),1::bigint,'void remains historical');
select lives_ok($$select pg_temp.r14_confirm('empty')$$,'explicit no-applicable scope may confirm documented zero');
select is(pg_temp.r14_summary('empty')->'total'->>'amount','0','zero exists only after explicit scoped review');
select pg_temp.r14_record('empty','0');
select is(pg_temp.r14_summary('empty')->>'state','partial','explicit zero labor changes economic sources');
select revise_repair_actual_cost(pg_temp.r14_payload('empty',jsonb_build_object('entry_id',pg_temp.r14_item('empty','labor')->>'revision_id','void',true)));
select is(pg_temp.r14_summary('empty')->>'state','undetermined','add then void cannot reactivate the old zero confirmation');
select pg_temp.r14_record('mixed','1.25','PEN'); select pg_temp.r14_record('mixed','2.50','USD'); select pg_temp.r14_confirm('mixed');
select is(jsonb_array_length(pg_temp.r14_summary('mixed')->'subtotals'),2,'PEN/USD are separate');
select is(pg_temp.r14_summary('mixed')->'total','null'::jsonb,'mixed currencies have no scalar total');
select is(pg_temp.r14_summary('mixed')->>'state','confirmed','documented complete costs can be confirmed per currency');
select pg_temp.r14_record('basis','1','PEN','tax_inclusive'); select pg_temp.r14_record('basis','2','PEN','tax_exclusive');
select throws_ok($$select pg_temp.r14_confirm('basis')$$,'P0001','REPAIR_COST_SOURCES_PENDING','incompatible tax bases cannot be confirmed');
select is(jsonb_array_length(pg_temp.r14_summary('basis')->'subtotals'),2,'incompatible bases never combine');
select pg_temp.r14_record('precision','9999999999999999.99'); select pg_temp.r14_record('precision','0.01'); select pg_temp.r14_confirm('precision');
select is(pg_temp.r14_summary('precision')->'total'->>'amount','10000000000000000.00','sum beyond JS safe integer stays exact text');
select lives_ok($$select record_repair_actual_cost(pg_temp.r14_payload('precision',jsonb_build_object('category','other','description','Long exact document','amount',' 0.01 ',
 'currency','PEN','cost_basis','not_applicable','incurred_on',(now() at time zone 'America/Lima')::date,'evidence_reference',repeat('漢',1900))))$$,
 'long UTF8 evidence and trimmed monetary text do not overflow the duplicate-reference index');

-- Real purchases and repair consumption use existing business RPCs.
insert into r14_saved(label,id) select 'purchased-product',pg_temp.r14_purchase();
select pg_temp.r14_reserve('parts',id) from r14_saved where label='purchased-product';
select is(pg_temp.r14_summary('parts')->>'item_count','0','reservation alone is not incurred cost');
select pg_temp.r14_consume('parts',0.125);
select is(pg_temp.r14_item('parts','consumption')->>'currency',null::text,'consumption never defaults to PEN');
select throws_ok($$select pg_temp.r14_confirm('parts')$$,'P0001','REPAIR_COST_SOURCES_PENDING','unknown inventory money blocks confirmation');
select lives_ok($$select pg_temp.r14_verify('parts','consumption')$$,'homogeneous documented purchase provenance verified');
select is(pg_temp.r14_summary('parts')->'subtotals'->0->>'amount','0.6250000','snapshot quantity times unit cost, no intermediate rounding');
select pg_temp.r14_confirm('parts');
select pg_temp.r14_consume('parts',0.375);
select is(pg_temp.r14_summary('parts')->>'state','partial','new partial consumption requires a new source review');
select pg_temp.r14_claim('admin');
select cancel_repair_part(pg_temp.r14_id('org'),f.part,'Saldo liberado',r.lock_version) from r14_f f join repairs r on r.id=f.repair where f.label='parts';
select pg_temp.r14_claim('finance');
select is(pg_temp.r14_summary('parts')->>'item_count','2','consumptions survive cancelled reservation');
select verify_repair_cost_source(pg_temp.r14_payload('parts',jsonb_build_object('source_kind','consumption','source_id',i.value->>'source_id','currency','PEN','cost_basis','tax_exclusive')))
from jsonb_array_elements(get_repair_actual_cost_detail(pg_temp.r14_id('org'),(select repair from r14_f where label='parts'))->'items') i where not (i.value->>'is_verified')::boolean;
select pg_temp.r14_confirm('parts');
select is(pg_temp.r14_summary('parts')->'total'->>'amount','2.5000000','partial costs counted once, not consumption plus movement');
select pg_temp.r14_claim('admin');
select record_inventory_movement(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'product_id',id,'warehouse_id',pg_temp.r14_id('warehouse'),'location_id',pg_temp.r14_id('location'),
 'movement_type','entrada','quantity',1,'unit_cost',5,'stock_status','available','operation_date',(now() at time zone 'America/Lima')::date,'reason','Manual unrelated future entry','document_reference','R14 manual'))
from r14_saved where label='purchased-product';
select pg_temp.r14_claim('finance');
select is(pg_temp.r14_summary('parts')->>'state','confirmed','later bucket entries do not rewrite prior verified valuation');
-- Privileged fixture corruption tests only: clients cannot mutate these rows.
-- Restore the precise snapshots and immutable guard before continuing.
reset role;
alter table repair_part_consumptions disable trigger repair_part_consumptions_immutable;
update repair_part_consumptions set unit_cost=unit_cost+1 where repair_part_id=(select part from r14_f where label='parts');
set local role authenticated;
select is(pg_temp.r14_item('parts','consumption')->>'pending_reason','consumption_movement_inconsistent','tampered snapshot disagrees with immutable movement');
select throws_ok($$select pg_temp.r14_confirm('parts')$$,'P0001','REPAIR_COST_SOURCES_PENDING','movement inconsistency cannot be confirmed');
reset role;
update repair_part_consumptions set unit_cost=unit_cost-1,quantity=quantity+0.001 where repair_part_id=(select part from r14_f where label='parts');
set local role authenticated;
select is(pg_temp.r14_item('parts','inconsistent_parts')->>'pending_reason','consumption_ledger_inconsistent','missing quantity reconciliation creates an explicit pending source');
select throws_ok($$select pg_temp.r14_confirm('parts')$$,'P0001','REPAIR_COST_SOURCES_PENDING','quantity ledger inconsistency cannot be confirmed');
reset role;
update repair_part_consumptions set quantity=quantity-0.001 where repair_part_id=(select part from r14_f where label='parts');
alter table repair_part_consumptions enable trigger repair_part_consumptions_immutable;
set local role authenticated;
select pg_temp.r14_reserve('manual-stock',id) from r14_saved where label='purchased-product'; select pg_temp.r14_consume('manual-stock',1);
select throws_ok($$select pg_temp.r14_verify('manual-stock','consumption')$$,'P0001','REPAIR_COST_PROVENANCE_UNVERIFIABLE','a currency label and note cannot certify untraceable manual inflow');
insert into r14_saved(label,id) select 'mixed-product',pg_temp.r14_purchase('PEN',5);
select pg_temp.r14_purchase('USD',5,id) from r14_saved where label='mixed-product';
select pg_temp.r14_reserve('mixed-stock',id) from r14_saved where label='mixed-product'; select pg_temp.r14_consume('mixed-stock',1);
select throws_ok($$select pg_temp.r14_verify('mixed-stock','consumption')$$,'P0001','REPAIR_COST_PROVENANCE_UNVERIFIABLE','mixed purchase currencies cannot be repaired with a manual PEN label');
-- Explicitly seed a real zero-valued manual inventory receipt. R14 must not
-- reinterpret its zero as proven gratuity or assign a monetary unit to it.
select pg_temp.r14_claim('admin');
reset role;
insert into r14_ids(label) values('zero-product');
insert into products(id,organization_id,code,description,unit_of_measure,product_type,tax_affectation,batch_control,expiration_control,created_by,updated_by)
values(pg_temp.r14_id('zero-product'),pg_temp.r14_id('org'),'R14-ZERO','R14 zero stock','UND','good','inafecto',false,false,pg_temp.r14_id('admin'),pg_temp.r14_id('admin'));
set local role authenticated;
select record_inventory_movement(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'product_id',pg_temp.r14_id('zero-product'),'warehouse_id',pg_temp.r14_id('warehouse'),
 'location_id',pg_temp.r14_id('location'),'movement_type','entrada','quantity',10,'unit_cost',0,'stock_status','available',
 'operation_date',(now() at time zone 'America/Lima')::date,'reason','Historical zero-valued stock','document_reference','R14-ZERO'));
select pg_temp.r14_reserve('zero-stock',pg_temp.r14_id('zero-product')); select pg_temp.r14_consume('zero-stock',1);
select is(pg_temp.r14_item('zero-stock','consumption')->>'pending_reason','historical_zero_unverified','historical zero remains unknown');
select throws_ok($$select pg_temp.r14_verify('zero-stock','consumption')$$,'P0001','REPAIR_COST_PROVENANCE_UNVERIFIABLE','zero does not become free through a manual label');
select is(pg_temp.r14_summary('zero-stock')->'total','null'::jsonb,'unverified zero never confirms a total');

select pg_temp.r14_external('external');
select is(pg_temp.r14_summary('external')->>'state','undetermined','pending supplier cost is unknown');
select throws_ok($$select pg_temp.r14_verify('external','external')$$,'P0001','REPAIR_COST_EXTERNAL_PENDING','cannot certify pending custody');
select pg_temp.r14_claim('admin');
select receive_repair_external_service(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'repair_id',r.id,'expected_lock_version',r.lock_version,'operation_key',gen_random_uuid(),
 'external_service_id',pg_temp.r14_item('external','external')->>'source_id','cost_amount',45,'currency','USD')) from r14_f f join repairs r on r.id=f.repair where f.label='external';
select pg_temp.r14_claim('finance');
select is(pg_temp.r14_item('external','external')->>'is_verified','false','recorded external currency does not invent tax basis');
select pg_temp.r14_verify('external','external','USD','tax_exclusive'); select pg_temp.r14_confirm('external');
insert into r14_saved(label,value) select 'external-original',to_jsonb(s) from repair_external_services s where s.repair_id=(select repair from r14_f where label='external');
select revise_repair_external_cost(pg_temp.r14_payload('external',jsonb_build_object('source_id',pg_temp.r14_item('external','external')->>'source_id','amount','40.10','currency','PEN','cost_basis','tax_exclusive')));
select pg_temp.r14_confirm('external');
select is(pg_temp.r14_summary('external')->'total'->>'amount','40.10','external correction replaces, never adds to original');
select is((select to_jsonb(s) from repair_external_services s where s.repair_id=(select repair from r14_f where label='external')),
 (select value from r14_saved where label='external-original'),'supplier, original amount, currency and custody dates unchanged');
select is((select (h.value->>'previous_amount')||'/'||(h.value->>'previous_currency')||'/'||(h.value->>'previous_cost_basis')
 from jsonb_array_elements(get_repair_actual_cost_detail(pg_temp.r14_id('org'),(select repair from r14_f where label='external'))->'history') h
 where h.value->>'kind'='source_review' and h.value->>'amount'='40.10'),'45.00/USD/tax_exclusive','history exposes exact prior amount/currency/basis from predecessor');
select pg_temp.r14_confirm('external');
select is((select count(*) from jsonb_array_elements(get_repair_actual_cost_detail(pg_temp.r14_id('org'),(select repair from r14_f where label='external'))->'history') h
 where h.value->>'kind'='confirmation' and (h.value->>'is_current')::boolean),1::bigint,'only the latest confirmation is current even when two fingerprints match');
create function pg_temp.r14_many_external() returns setof text language plpgsql as $$declare i integer; s uuid; begin
 for i in 1..101 loop
  s:=pg_temp.r14_external('many-external',1,'PEN');
  perform verify_repair_cost_source(pg_temp.r14_payload('many-external',jsonb_build_object('source_kind','external','source_id',s,'currency','PEN','cost_basis','not_applicable')));
 end loop;
 return next is(pg_temp.r14_summary('many-external')->>'item_count','101','all 101 historical services count');
 perform pg_temp.r14_confirm('many-external');
 return next is(pg_temp.r14_summary('many-external')->'total'->>'amount','101.00','summary is not truncated at frontend limit 100');
 return next is(jsonb_array_length(get_repair_actual_cost_detail(pg_temp.r14_id('org'),(select repair from r14_f where label='many-external'),100,25)->'items'),1,'breakdown is paginated independently from total');
end $$;
select * from pg_temp.r14_many_external();

-- A1/M1: valid RPC documents, plus privileged inconsistent-history fixtures.
-- No production trigger is disabled. Every negative case traverses verification
-- and confirmation and checks the complete economic/event/audit/version snapshot.
reset role;
create function pg_temp.r14_provenance_cases() returns setof text language plpgsql as $$
<<r14_provenance_cases>>
declare kind text; label text; p uuid; po uuid; poi uuid; receipt uuid; ri uuid;
  loc uuid; lot_value text; expiry date:=current_date+180; basis text; positive boolean; contradiction boolean;
  before_economic jsonb; before_sources jsonb; after_sources jsonb; version bigint; events bigint; audits bigint;
begin
 foreach kind in array array['valid-excluded','valid-included','valid-not-applicable','canonical-lot',
   'cross-order','lot-mismatch','expiry-mismatch','quantity-mismatch','cost-mismatch','wrong-source',
   'unknown-tax','mixed-bases','mixed-currencies','manual-mix','transfer','reclassification','incomplete-history'] loop
  label:='prov-'||kind; perform pg_temp.r14_fixture(label);
  positive:=kind in ('valid-excluded','valid-included','valid-not-applicable','canonical-lot');
  contradiction:=kind in ('cross-order','lot-mismatch','expiry-mismatch','quantity-mismatch','cost-mismatch');
  basis:=case when kind='valid-included' then 'tax_inclusive' when kind='valid-not-applicable' then 'not_applicable' else 'tax_exclusive' end;
  p:=pg_temp.r14_purchase('PEN',5,null,kind='valid-included','PROV',expiry,
    case when kind='valid-not-applicable' then 'exonerado' else 'gravado' end);
  select r.id,i.purchase_order_item_id,i.receipt_id,i.id into po,poi,receipt,ri
    from purchase_receipt_items i join purchase_orders r on r.id=(select purchase_order_id from purchase_receipts where id=i.receipt_id)
    where i.product_id=p;
  loc:=pg_temp.r14_id('location'); lot_value:=case when positive and kind='canonical-lot' then 'prov' else 'PROV' end;
  if kind in ('mixed-bases','mixed-currencies') then
   perform pg_temp.r14_purchase(case when kind='mixed-currencies' then 'USD' else 'PEN' end,5,p,kind='mixed-bases','PROV',expiry);
  end if;
  perform pg_temp.r14_claim('admin');
  if kind='manual-mix' then
   perform record_inventory_movement(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'product_id',p,'warehouse_id',pg_temp.r14_id('warehouse'),
    'location_id',loc,'movement_type','entrada','quantity',1,'unit_cost',5,'stock_status','available','lot','PROV','expiration_date',expiry,
    'operation_date',current_date,'reason','Manual plus documented stock','document_reference','R14-M1'));
  elsif kind='transfer' then
   insert into warehouse_locations(organization_id,warehouse_id,code,name,created_by,updated_by)
    values(pg_temp.r14_id('org'),pg_temp.r14_id('warehouse'),'M1-'||upper(substr(p::text,1,8)),'M1 transfer target',pg_temp.r14_id('admin'),pg_temp.r14_id('admin')) returning id into loc;
   perform transfer_inventory_position(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'product_id',p,'source_warehouse_id',pg_temp.r14_id('warehouse'),
    'destination_warehouse_id',pg_temp.r14_id('warehouse'),'source_location_id',pg_temp.r14_id('location'),'destination_location_id',loc,
    'stock_status','available','quantity',2,'lot','PROV','expiration_date',expiry,'operation_key',gen_random_uuid()));
  elsif kind='reclassification' then
   perform reclassify_inventory(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'product_id',p,'warehouse_id',pg_temp.r14_id('warehouse'),
    'location_id',loc,'source_status','available','destination_status','quarantine','quantity',2,'lot','PROV','expiration_date',expiry,'reason','M1 quarantine','operation_key',gen_random_uuid()));
   perform reclassify_inventory(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'product_id',p,'warehouse_id',pg_temp.r14_id('warehouse'),
    'location_id',loc,'source_status','quarantine','destination_status','available','quantity',2,'lot','PROV','expiration_date',expiry,'reason','M1 release','operation_key',gen_random_uuid()));
  elsif contradiction or kind in ('wrong-source','unknown-tax','incomplete-history') then
   lot_value:='HISTORY';
   if kind='cross-order' then
    perform pg_temp.r14_purchase('USD',5,p,false,'OTHER',expiry);
    select pr.id into receipt from purchase_receipts pr join purchase_orders x on x.id=pr.purchase_order_id where x.currency='USD' and exists(
     select 1 from purchase_order_items i where i.purchase_order_id=x.id and i.product_id=p);
   elsif kind='unknown-tax' then
    -- Pending tax classification represents incomplete legacy evidence. The
    -- snapshot triggers run normally; no guessed tax or disabled guard.
    update products set tax_affectation='por-definir' where id=p;
    po:=save_purchase_order(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'supplier_id',pg_temp.r14_id('supplier'),'document_type','factura',
     'series','M1','document_number',substr(p::text,1,8),'issue_date',current_date,'warehouse_id',pg_temp.r14_id('warehouse'),'warehouse','R14 warehouse',
     'currency','PEN','prices_include_tax',false,'items',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',10,'unit_cost',5))));
    update purchase_orders set status='received',issued_at=now(),received_at=now(),received_by=pg_temp.r14_id('admin') where id=po;
    select id into poi from purchase_order_items where purchase_order_id=po;
    insert into purchase_receipts(organization_id,purchase_order_id,warehouse_id,operation_key,received_by)
     values(pg_temp.r14_id('org'),po,pg_temp.r14_id('warehouse'),gen_random_uuid(),pg_temp.r14_id('admin')) returning id into receipt;
   end if;
   insert into purchase_receipt_items(organization_id,receipt_id,purchase_order_item_id,product_id,warehouse_id,location_id,quantity,unit_cost,lot,expiration_date,fulfillment_mode)
    values(pg_temp.r14_id('org'),receipt,poi,p,pg_temp.r14_id('warehouse'),loc,case when kind='quantity-mismatch' then 1 else 10 end,5,
     case when kind='lot-mismatch' then 'OTHER-DOCUMENT-LOT' else lot_value end,case when kind='expiry-mismatch' then expiry+1 else expiry end,'physical') returning id into ri;
   begin
   insert into inventory_movements(organization_id,product_id,product_code,product_description,unit_of_measure,movement_type,quantity,warehouse,warehouse_id,
    location_id,stock_status,unit_cost,lot,expiration_date,operation_date,reason,source_type,source_id,created_by)
    select pg_temp.r14_id('org'),p,code,description,unit_of_measure,'entrada',2,'R14 warehouse',pg_temp.r14_id('warehouse'),loc,'available',
     case when kind='cost-mismatch' then 7 else 5 end,lot_value,expiry,current_date,'Privileged inconsistent historical fixture','purchase-receipt',
     case when kind='wrong-source' then poi when kind='incomplete-history' then gen_random_uuid() else ri end,pg_temp.r14_id('admin') from products where id=p;
   if kind in ('wrong-source','incomplete-history') then return next fail(kind||': inventory must reject a forged/missing receipt reference'); end if;
   exception when sqlstate 'P0001' then
    if kind not in ('wrong-source','incomplete-history') then raise; end if;
    return next is(sqlerrm,'INVENTORY_PURCHASE_RECEIPT_SOURCE_INVALID',kind||': existing inventory guard rejects invalid source, without disabling it');
    -- Incomplete legacy stock remains representable as uncredited manual stock;
    -- it must not acquire a purchase currency merely from matching its number.
    perform record_inventory_movement(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'product_id',p,'warehouse_id',pg_temp.r14_id('warehouse'),
     'location_id',loc,'movement_type','entrada','quantity',2,'unit_cost',5,'stock_status','available','lot',lot_value,'expiration_date',expiry,
     'operation_date',current_date,'reason','Legacy stock without receipt evidence','document_reference','M1 legacy unknown'));
   end;
  end if;
  perform pg_temp.r14_reserve(label,p,1,lot_value,expiry,loc); perform pg_temp.r14_consume(label,1); perform pg_temp.r14_record(label,'1.25');
  select jsonb_build_object('movements',(select jsonb_agg(to_jsonb(m) order by ledger_sequence) from inventory_movements m where m.product_id=p),
   'receipts',(select jsonb_agg(to_jsonb(i) order by id) from purchase_receipt_items i where i.product_id=p)) into before_sources;
  before_economic:=pg_temp.r14_snapshot(label);
  select r.lock_version,(select count(*) from repair_events e where e.repair_id=r.id),(select count(*) from audit_events a where a.entity_id=r.id::text)
    into version,events,audits from repairs r where r.id=(select repair from r14_f f where f.label=r14_provenance_cases.label);
  return next is(pg_temp.r14_item(label,'consumption')->>'is_verified','false',kind||': starts unaccredited');
  if positive then
   return next lives_ok(format('select pg_temp.r14_verify(%L,''consumption'',''PEN'',%L)',label,basis),kind||': coherent document chain verifies');
   return next is((select lock_version from repairs where id=(select repair from r14_f f where f.label=r14_provenance_cases.label)),version+1,kind||': verification advances once');
   return next is((select count(*) from repair_events where repair_id=(select repair from r14_f f where f.label=r14_provenance_cases.label)),events+1,kind||': verification has one event');
   return next is((select count(*) from audit_events where entity_id=(select repair::text from r14_f f where f.label=r14_provenance_cases.label)),audits+1,kind||': verification has one audit');
   perform pg_temp.r14_confirm(label);
   return next is(pg_temp.r14_summary(label)->>'state','confirmed',kind||': complete valid cost confirms');
   return next is((pg_temp.r14_summary(label)->'total'->>'amount')::numeric,6.25::numeric,kind||': consumption plus independent labor exactly once');
  else
   return next is(pg_temp.r14_item(label,'consumption')->>'pending_reason',case when contradiction then 'inventory_documentary_inconsistent' else 'inventory_currency_basis_unverified' end,kind||': explicit pending integrity');
   return next ok(exists(select 1 from jsonb_array_elements(pg_temp.r14_summary(label)->'pending') v where v->>'source_kind'='consumption'
     and v->>'reason'=case when contradiction then 'inventory_documentary_inconsistent' else 'inventory_currency_basis_unverified' end),kind||': batch summary retains pending source and reason');
   return next throws_ok(format('select pg_temp.r14_verify(%L,''consumption'',''PEN'',''tax_exclusive'')',label),'P0001',
    case when contradiction then 'REPAIR_COST_DOCUMENTARY_INCONSISTENT' else 'REPAIR_COST_PROVENANCE_UNVERIFIABLE' end,kind||': verification rejected');
   if kind='cross-order' then
    return next throws_ok(format('select pg_temp.r14_verify(%L,''consumption'',''USD'',''tax_exclusive'')',label),'P0001','REPAIR_COST_DOCUMENTARY_INCONSISTENT',kind||': neither PEN nor USD invents a valid chain');
   end if;
   return next is(pg_temp.r14_snapshot(label),before_economic,kind||': rejected verification leaves rows/events/audits/ledger/version intact');
   return next is(pg_temp.r14_summary(label)->>'state','partial',kind||': independent subtotal is retained');
   return next is(pg_temp.r14_summary(label)->'subtotals'->0->>'amount','1.25',kind||': only independently documented labor is included');
   return next throws_ok(format('select pg_temp.r14_confirm(%L)',label),'P0001','REPAIR_COST_SOURCES_PENDING',kind||': cannot confirm complete cost');
   return next is(pg_temp.r14_snapshot(label),before_economic,kind||': confirmation failure is atomic');
  end if;
  select jsonb_build_object('movements',(select jsonb_agg(to_jsonb(m) order by ledger_sequence) from inventory_movements m where m.product_id=p),
   'receipts',(select jsonb_agg(to_jsonb(i) order by id) from purchase_receipt_items i where i.product_id=p)) into after_sources;
  return next is(after_sources,before_sources,kind||': no revaluation, stock restitution or document mutation');
 end loop;
end $$;
select * from pg_temp.r14_provenance_cases();
set local role authenticated;

-- Economic-only writes remain possible after technical closure without weakening B1.
select pg_temp.r14_record('terminal','7');
select pg_temp.r14_claim('tech');
select declare_repair_non_repairable(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'repair_id',r.id,'diagnosis_id',f.diagnosis,
 'expected_lock_version',r.lock_version,'operation_key',gen_random_uuid(),'reason','Daño irreversible')) from r14_f f join repairs r on r.id=f.repair where f.label='terminal';
select pg_temp.r14_claim('admin');
select return_unrepaired_repair(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'repair_id',r.id,'decision_event_id',r.non_repairable_decision_event_id::text,
 'expected_lock_version',r.lock_version,'operation_key',gen_random_uuid(),'returns','[]'::jsonb)) from r14_f f join repairs r on r.id=f.repair where f.label='terminal';
insert into r14_saved(label,value) select 'terminal-before',to_jsonb(r)-array['lock_version','updated_by','updated_at'] from repairs r where id=(select repair from r14_f where label='terminal');
select pg_temp.r14_claim('finance'); select pg_temp.r14_record('terminal','2','PEN','not_applicable','other'); select pg_temp.r14_confirm('terminal');
select is(pg_temp.r14_summary('terminal')->'total'->>'amount','9.00','unrepaired return is not cost zero');
select is((select to_jsonb(r)-array['lock_version','updated_by','updated_at'] from repairs r where id=(select repair from r14_f where label='terminal')),
 (select value from r14_saved where label='terminal-before'),'financial writes do not alter B1 technical fields or return dates');
select is((select technical_completion from repair_list where id=(select repair from r14_f where label='terminal')),null::jsonb,'economic confirmation does not create technical completion');
select is((select count(*) from repair_service_warranties where repair_id=(select repair from r14_f where label='terminal')),0::bigint,'no automatic warranty');
select pg_temp.r14_record('cancelled','6'); select pg_temp.r14_confirm('cancelled');
select pg_temp.r14_claim('admin');
select cancel_repair(pg_temp.r14_id('org'),r.id,'Cancelación real',r.lock_version) from r14_f f join repairs r on r.id=f.repair where f.label='cancelled';
select pg_temp.r14_claim('finance');
select is(pg_temp.r14_summary('cancelled')->'total'->>'amount','6.00','cancelled repair retains incurred cost and financial review');
select pg_temp.r14_record('cancelled','2','PEN','not_applicable','other'); select pg_temp.r14_confirm('cancelled');
select is(pg_temp.r14_summary('cancelled')->'total'->>'amount','8.00','late documented expense allowed without reopening cancellation');
select pg_temp.r14_record('warranty','4'); select pg_temp.r14_confirm('warranty');
select is(pg_temp.r14_summary('warranty')->'total'->>'amount','4.00','warranty repair can incur internal cost');
select is((select status from repairs where id=(select repair from r14_f where label='warranty')),'warranty','economic review leaves warranty state unchanged');
select pg_temp.r14_record('delivered','10'); select pg_temp.r14_confirm('delivered');
select pg_temp.r14_claim('admin');
select change_repair_status(pg_temp.r14_id('org'),r.id,'testing',null,r.lock_version) from r14_f f join repairs r on r.id=f.repair where f.label='delivered';
select record_repair_test(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'repair_id',r.id,'expected_lock_version',r.lock_version,
 'test_type','Encendido','result','Approved','passed',true)) from r14_f f join repairs r on r.id=f.repair where f.label='delivered';
select change_repair_status(pg_temp.r14_id('org'),r.id,'ready_for_delivery',null,r.lock_version) from r14_f f join repairs r on r.id=f.repair where f.label='delivered';
select configure_repair_service_warranty(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'repair_id',r.id,'expected_lock_version',r.lock_version,
 'operation_key',gen_random_uuid(),'warranty_days',30,'coverage','R14 test warranty')) from r14_f f join repairs r on r.id=f.repair where f.label='delivered';
select deliver_repair_with_accessories(jsonb_build_object('organization_id',pg_temp.r14_id('org'),'repair_id',r.id,'expected_lock_version',r.lock_version,
 'operation_key',gen_random_uuid(),'returns','[]'::jsonb)) from r14_f f join repairs r on r.id=f.repair where f.label='delivered';
insert into r14_saved(label,value) select 'delivered-before',jsonb_build_object('completion',r.technical_completion,'delivery',r.delivered_at,'warranty',to_jsonb(w))
 from repair_list r join repair_service_warranty_details w on w.repair_id=r.id where r.id=(select repair from r14_f where label='delivered');
select pg_temp.r14_claim('finance');
select is(pg_temp.r14_summary('delivered')->>'state','confirmed','technical completion, warranty and delivery do not stale economic sources');
select revise_repair_actual_cost(pg_temp.r14_payload('delivered',jsonb_build_object('entry_id',pg_temp.r14_item('delivered','labor')->>'revision_id','description','Trabajo corregido documentado',
 'amount','9.90','currency','PEN','cost_basis','not_applicable','incurred_on',(now() at time zone 'America/Lima')::date)));
select pg_temp.r14_confirm('delivered');
select is(pg_temp.r14_summary('delivered')->'total'->>'amount','9.90','delivered correction replaces amount');
select is((select jsonb_build_object('completion',r.technical_completion,'delivery',r.delivered_at,'warranty',to_jsonb(w)) from repair_list r join repair_service_warranty_details w on w.repair_id=r.id
 where r.id=(select repair from r14_f where label='delivered')),(select value from r14_saved where label='delivered-before'),'R13 completion, physical delivery and warranty dates remain intact');
select pg_temp.r14_claim('foreign');
select throws_ok($$select pg_temp.r14_summary('main')$$,'42501','REPAIR_FORBIDDEN','foreign organization cannot read cost RPC');
select is((select count(*) from repair_actual_cost_entries where organization_id=pg_temp.r14_id('org')),0::bigint,'RLS hides financial records');
select pg_temp.r14_claim('finance');
select throws_ok($$select verify_repair_cost_source(pg_temp.r14_payload('main',jsonb_build_object('source_kind','external','source_id',pg_temp.r14_item('external','external')->>'source_id','currency','PEN','cost_basis','tax_exclusive')))$$,
 'P0001','REPAIR_COST_SOURCE_NOT_FOUND','source from another repair is rejected');
select throws_ok($$update repair_actual_cost_entries set amount=0$$,'42501',null,'direct updates denied');
select throws_ok($$delete from repair_cost_source_reviews$$,'42501',null,'direct deletes denied');
select throws_ok($$select get_repair_actual_cost_summaries(pg_temp.r14_id('org'),array_fill(gen_random_uuid(),array[51]))$$,'22023','REPAIR_COST_BATCH_INVALID','batch limited to visible page');
select is(jsonb_array_length(get_repair_actual_cost_summaries(pg_temp.r14_id('org'),array[gen_random_uuid()])),0,'unknown IDs do not reveal repairs');
select * from finish();
rollback;
