begin;
select no_plan();
create function pg_temp.acc_fixture() returns jsonb language plpgsql as $$
declare org uuid := gen_random_uuid(); actor uuid := gen_random_uuid(); sid uuid := gen_random_uuid(); repair uuid; legacy uuid;
begin
  insert into public.organizations(id,name,slug) values(org,'Accessory SQL fixture','acc-'||org);
  insert into auth.users(id,email,raw_user_meta_data) values(actor,actor||'@example.invalid','{"full_name":"Accessory actor"}');
  insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,actor,now(),now());
  insert into public.organization_memberships(organization_id,user_id) values(org,actor);
  insert into public.user_roles(organization_id,user_id,role_code) values(org,actor,'ADMIN');
  perform set_config('request.jwt.claims', jsonb_build_object('sub',actor,'role','authenticated','session_id',sid)::text,true);
  repair := public.create_repair(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),
    'requester_type','internal','requesting_area','Fixture area','equipment_type','external',
    'external_equipment_description','Fixture equipment','problem_description','Does not start','notes','Reception notes unchanged',
    'accessories','[{"name":"Cable","quantity_received":3},{"name":"Sensor","quantity_received":2},{"name":"Estuche","quantity_received":1}]'::jsonb));
  legacy := public.create_repair(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),
    'requester_type','internal','requesting_area','Fixture area','equipment_type','external',
    'external_equipment_description','Historical equipment','problem_description','Legacy problem','notes','Accesorios: cable y estuche'));
  return jsonb_build_object('org',org,'actor',actor,'sid',sid,'repair',repair,'legacy',legacy,
    'cable',(select id from public.repair_accessories where repair_id=repair and name='Cable'),
    'sensor',(select id from public.repair_accessories where repair_id=repair and name='Sensor'),
    'case',(select id from public.repair_accessories where repair_id=repair and name='Estuche'));
end;
$$;
create function pg_temp.acc_payload(f jsonb, changes jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('organization_id',f->>'org','repair_id',f->>'repair','operation_key',gen_random_uuid(),
    'expected_lock_version',(select lock_version from public.repairs where id=(f->>'repair')::uuid)) || changes;
$$;
create function pg_temp.acc_ready(f jsonb, target uuid default null) returns void language plpgsql as $$
declare repair uuid := coalesce(target,(f->>'repair')::uuid); org uuid := (f->>'org')::uuid; v bigint;
begin
  select lock_version into v from public.repairs where id=repair;
  perform public.assign_repair(org,repair,(f->>'actor')::uuid,v);
  select lock_version into v from public.repairs where id=repair;
  perform public.change_repair_status(org,repair,'diagnosis',null,v);
  select lock_version into v from public.repairs where id=repair;
  perform public.change_repair_status(org,repair,'in_repair',null,v);
  select lock_version into v from public.repairs where id=repair;
  perform public.change_repair_status(org,repair,'testing',null,v);
  select lock_version into v from public.repairs where id=repair;
  perform public.record_repair_test(jsonb_build_object('organization_id',org,'repair_id',repair,'expected_lock_version',v,
    'test_type','Encendido','result','Stable','passed',true));
  select lock_version into v from public.repairs where id=repair;
  perform public.change_repair_status(org,repair,'ready_for_delivery',null,v);
end;
$$;
create temporary table f as select pg_temp.acc_fixture() data;
grant select on f to authenticated;
create function pg_temp.acc_return(changes jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select pg_temp.acc_payload(data,jsonb_build_object('returns',jsonb_build_array(jsonb_build_object('accessory_id',data->>'cable','quantity',1,'observation','First return'))) || changes) from f;
$$;
create temp table command as select pg_temp.acc_return() p;
grant select on command to authenticated;
set local role authenticated;
select lives_ok($$select record_repair_accessory_return((select p from command))$$,'partial return confirmed');
select lives_ok($$select record_repair_accessory_return((select p from command))$$,'lost response replays before version');
select is((select sum(quantity) from repair_accessory_returns),1::bigint,'replay does not double return');
select is((select lock_version from repairs where id=(select (data->>'repair')::uuid from f)),2::bigint,'return advances exactly once');
select is((get_repair_accessories((select (data->>'org')::uuid from f),(select (data->>'repair')::uuid from f))->'accessories'->0->>'registered_by_name') is not null,true,'responsible name returned');
select throws_ok($$select record_repair_accessory_return((select p||'{"returns":[]}' from command))$$,'P0001','REPAIR_OPERATION_KEY_REUSED','changed operation rejected');
select throws_ok($$select record_repair_accessory_return(pg_temp.acc_return(jsonb_build_object('returns',jsonb_build_array(jsonb_build_object(
  'accessory_id',(select data->>'cable' from f),'quantity',3)))))$$,'P0001','REPAIR_ACCESSORY_RETURN_EXCEEDED','overreturn rejected');
select throws_ok($$select record_repair_accessory_return(pg_temp.acc_return('{"returns":[]}'))$$,'22023','REPAIR_ACCESSORY_RETURNS_INVALID','empty return rejected');
select throws_ok($$select record_repair_accessory_return(pg_temp.acc_return(jsonb_build_object('returns',jsonb_build_array(jsonb_build_object(
  'accessory_id',(select data->>'cable' from f),'quantity',0)))))$$,'22023','REPAIR_ACCESSORY_QUANTITY_INVALID','zero return rejected');
select throws_ok($$select record_repair_accessory_return(pg_temp.acc_return(jsonb_build_object('returns',jsonb_build_array(jsonb_build_object(
  'accessory_id',(select data->>'cable' from f),'quantity',1.5)))))$$,'22023','REPAIR_ACCESSORY_QUANTITY_INVALID','fractional return rejected');
select throws_ok($$select save_repair_accessories(pg_temp.acc_payload((select data from f),jsonb_build_object('accessories',jsonb_build_array(
  jsonb_build_object('id',(select data->>'cable' from f),'name','Changed','quantity_received',4)))))$$,'P0001','REPAIR_ACCESSORY_CORRECTION_LOCKED','confirmed return locks ordinary corrections');
select throws_ok($$select save_repair_accessories(pg_temp.acc_payload((select data from f),jsonb_build_object('accessories',jsonb_build_array(
  jsonb_build_object('id',(select data->>'cable' from f),'void',true,'reason','Cannot erase return')))))$$,'P0001','REPAIR_ACCESSORY_CORRECTION_LOCKED','cannot void returned accessory');
select throws_ok($$select deliver_repair_with_accessories(pg_temp.acc_payload((select data from f),'{"authorize_exception":true,"exception_reason":"Cannot bypass technical state"}'))$$,
  'P0001','REPAIR_DELIVERY_STATE_REQUIRED','exception never bypasses technical state');
select is((select count(*) from repair_events where event_type='ACCESSORY_DELIVERY_EXCEPTION'),0::bigint,'technical rejection leaves no exception audit');
select lives_ok($$select pg_temp.acc_ready((select data from f))$$,'pending accessories do not block technical readiness');
select throws_ok($$select deliver_repair((select (data->>'org')::uuid from f),(select (data->>'repair')::uuid from f),null,
  (select lock_version from repairs where id=(select (data->>'repair')::uuid from f)))$$,'P0001','REPAIR_ACCESSORIES_PENDING','old delivery cannot bypass pending belongings');
select throws_ok($$select deliver_repair_with_accessories(pg_temp.acc_payload((select data from f)))$$,'P0001','REPAIR_ACCESSORIES_PENDING','ordinary new delivery blocked');
select throws_ok($$select deliver_repair_with_accessories(pg_temp.acc_payload((select data from f),'{"authorize_exception":true,"exception_reason":" "}'))$$,
  '22023','REPAIR_ACCESSORY_REASON_REQUIRED','exception reason required');
select throws_ok($$select deliver_repair_with_accessories(pg_temp.acc_payload((select data from f),jsonb_build_object('returns',jsonb_build_array(
  jsonb_build_object('accessory_id',(select data->>'cable' from f),'quantity',1)))))$$,'P0001','REPAIR_ACCESSORIES_PENDING','failed delivery rolls back simultaneous return');
select is((select sum(quantity) from repair_accessory_returns),1::bigint,'no partial return after failed delivery');
reset role;
create temp table delivery as select pg_temp.acc_payload(data,'{"authorize_exception":true,"exception_reason":"Customer agreed to collect remaining accessories later"}') p from f;
grant select on delivery to authenticated;
set local role authenticated;
select lives_ok($$select deliver_repair_with_accessories((select p from delivery))$$,'authorized exception succeeds');
select lives_ok($$select deliver_repair_with_accessories((select p from delivery))$$,'exception replay succeeds');
select is((select status from repairs where id=(select (data->>'repair')::uuid from f)),'delivered','equipment delivered');
select is((select sum(quantity) from repair_accessory_returns),1::bigint,'exception does not simulate returns');
select is((select count(*) from repair_events where event_type='DELIVERED'),1::bigint,'no duplicate delivery');
select is((select count(*) from repair_events where event_type='ACCESSORY_DELIVERY_EXCEPTION'),1::bigint,'no duplicate exception');
select is((select jsonb_array_length(metadata->'pending_accessories') from repair_events where event_type='ACCESSORY_DELIVERY_EXCEPTION'),3,'pending identities snapshot retained');
reset role;
delete from user_roles where user_id=(select (data->>'actor')::uuid from f);
insert into organization_user_permissions(organization_id,user_id,permission_code)
select (data->>'org')::uuid,(data->>'actor')::uuid,code from f cross join unnest(array['REPAIRS_VIEW','REPAIRS_DELIVER']) code;
set local role authenticated;
select throws_ok($$select deliver_repair_with_accessories((select p from delivery))$$,'42501','REPAIR_FORBIDDEN','revoked exception permission rejected even on confirmed replay');
reset role;
insert into user_roles(organization_id,user_id,role_code) select (data->>'org')::uuid,(data->>'actor')::uuid,'ADMIN' from f;
delete from organization_user_permissions where user_id=(select (data->>'actor')::uuid from f);
set local role authenticated;
select lives_ok($$select record_repair_accessory_return(pg_temp.acc_return(jsonb_build_object('returns',jsonb_build_array(
  jsonb_build_object('accessory_id',(select data->>'cable' from f),'quantity',2),
  jsonb_build_object('accessory_id',(select data->>'sensor' from f),'quantity',2),
  jsonb_build_object('accessory_id',(select data->>'case' from f),'quantity',1)))))$$,'post-delivery custody regularization');
select is((select status from repairs where id=(select (data->>'repair')::uuid from f)),'delivered','no reopening');
select is((select sum(quantity) from repair_accessory_returns),6::bigint,'all quantities physically returned');
select is((select count(*) from repair_events where event_type='DELIVERED'),1::bigint,'regularization not a new delivery');
select lives_ok($$select pg_temp.acc_ready((select data from f),(select (data->>'legacy')::uuid from f))$$,'legacy technical flow unchanged');
select lives_ok($$select deliver_repair((select (data->>'org')::uuid from f),(select (data->>'legacy')::uuid from f),null,
  (select lock_version from repairs where id=(select (data->>'legacy')::uuid from f)))$$,'old delivery with no structured accessories works');
reset role;
select is((select count(*) from audit_events where action='REPAIR_ACCESSORY_DELIVERY_EXCEPTION'),1::bigint,'exception audited');
select is((select actor_user_id from audit_events where action='REPAIR_ACCESSORY_DELIVERY_EXCEPTION'),(select (data->>'actor')::uuid from f),'real actor audited');
select is((select metadata->>'reason' from audit_events where action='REPAIR_ACCESSORY_DELIVERY_EXCEPTION'),'Customer agreed to collect remaining accessories later','reason persisted');
select throws_ok($$update repair_accessory_returns set quantity=2$$,'P0001','REPAIR_ACCESSORY_RETURN_IMMUTABLE','returns append only');
select throws_ok($$delete from repair_accessory_returns$$,'P0001','REPAIR_ACCESSORY_RETURN_IMMUTABLE','returns cannot disappear');
select is((select count(*) from inventory_movements),0::bigint,'custody does not change stock movements');
select is((select count(*) from inventory_reservations),0::bigint,'custody does not reserve inventory');
create temporary table ordinary as select pg_temp.acc_fixture() data;
select pg_temp.acc_ready((select data from ordinary));
create temporary table complete_delivery as select pg_temp.acc_payload(data,jsonb_build_object('returns',jsonb_build_array(
  jsonb_build_object('accessory_id',data->>'cable','quantity',3),jsonb_build_object('accessory_id',data->>'sensor','quantity',2),
  jsonb_build_object('accessory_id',data->>'case','quantity',1)))) p from ordinary;
select lives_ok($$select deliver_repair_with_accessories((select p from complete_delivery))$$,'ordinary atomic delivery returns all accessories');
select lives_ok($$select deliver_repair_with_accessories((select p from complete_delivery))$$,'ordinary delivery replay idempotent');
select is((select lock_version from repairs where id=(select (data->>'repair')::uuid from ordinary)),8::bigint,'multiple returns plus delivery advance once');
select is((select sum(quantity) from repair_accessory_returns where repair_id=(select (data->>'repair')::uuid from ordinary)),6::bigint,'no duplicate atomic returns');
create temporary table cancelled as select pg_temp.acc_fixture() data;
select public.cancel_repair((select (data->>'org')::uuid from cancelled),(select (data->>'repair')::uuid from cancelled),'Cancelled service',1);
select is((select count(*) from repair_accessory_returns where repair_id=(select (data->>'repair')::uuid from cancelled)),0::bigint,'cancellation does not simulate return');
select lives_ok($$select record_repair_accessory_return(pg_temp.acc_payload((select data from cancelled),jsonb_build_object('returns',jsonb_build_array(
  jsonb_build_object('accessory_id',(select data->>'cable' from cancelled),'quantity',1)))))$$,'cancelled order permits differentiated custody return');
select is((select status from repairs where id=(select (data->>'repair')::uuid from cancelled)),'cancelled','return does not reopen cancellation');
select is(jsonb_array_length(public.repair_accessory_pending((select (data->>'org')::uuid from cancelled),(select (data->>'repair')::uuid from cancelled))),3,'cancellation preserves remaining obligations');
create temporary table rejected as select pg_temp.acc_fixture() data;
select public.change_repair_status((select (data->>'org')::uuid from rejected),(select (data->>'repair')::uuid from rejected),'diagnosis',null,1);
select public.save_repair_quote(pg_temp.acc_payload((select data from rejected),'{"currency":"PEN","exchange_rate_to_pen":1,"prices_include_tax":true,"tax_rate":18,"submit":true,"items":[{"line_type":"labor","description":"Service","quantity":1,"unit_price":50,"taxable":true}]}'));
select public.reject_repair_quote((select (data->>'org')::uuid from rejected),(select (data->>'repair')::uuid from rejected),
  (select id from repair_quotes where repair_id=(select (data->>'repair')::uuid from rejected)),'Customer rejected quote',3);
select lives_ok($$select record_repair_accessory_return(pg_temp.acc_payload((select data from rejected),jsonb_build_object('returns',jsonb_build_array(
  jsonb_build_object('accessory_id',(select data->>'sensor' from rejected),'quantity',1)))))$$,'rejected service permits custody return');
select is((select status from repairs where id=(select (data->>'repair')::uuid from rejected)),'rejected','return preserves quote rejection state');
-- Nonempty stock/reservation/consumption snapshots prove custody does not touch inventory.
create temporary table stock_fixture as select pg_temp.acc_fixture() data;
create function pg_temp.acc_stock_setup(f jsonb) returns void language plpgsql as $$
declare product uuid := gen_random_uuid(); warehouse uuid; location uuid; part uuid; org uuid := (f->>'org')::uuid; repair uuid := (f->>'repair')::uuid;
begin
  insert into products(id,organization_id,code,description,unit_of_measure,sale_price,batch_control,expiration_control,created_by,updated_by)
  values(product,org,'ACC-STOCK','Unrelated stock fixture','UND',25,false,false,(f->>'actor')::uuid,(f->>'actor')::uuid);
  warehouse := save_warehouse(jsonb_build_object('organization_id',org,'operation_key',gen_random_uuid(),'code','ACC-STOCK','name','Accessory stock control'));
  select id into location from warehouse_locations where warehouse_id=warehouse and code='GENERAL';
  perform record_inventory_movement(jsonb_build_object('organization_id',org,'product_id',product,'warehouse_id',warehouse,'location_id',location,
    'movement_type','entrada','quantity',10,'unit_cost',5,'stock_status','available','operation_date',current_date,'reason','Fixture stock','document_reference','ACC-STOCK'));
  perform change_repair_status(org,repair,'diagnosis',null,1);
  perform change_repair_status(org,repair,'in_repair',null,2);
  part := reserve_repair_part(jsonb_build_object('organization_id',org,'repair_id',repair,'operation_key',gen_random_uuid(),'expected_lock_version',3,
    'product_id',product,'warehouse_id',warehouse,'location_id',location,'stock_status','available','quantity_requested',4));
  perform consume_repair_part(jsonb_build_object('organization_id',org,'repair_part_id',part,'operation_key',gen_random_uuid(),'expected_lock_version',4,'quantity',1));
end $$;
select pg_temp.acc_stock_setup((select data from stock_fixture));
create function pg_temp.acc_inventory(org uuid) returns jsonb language sql as $$
  select jsonb_build_object('stock',(select jsonb_agg(to_jsonb(x) order by product_id) from inventory_product_stock_summary x where organization_id=org),
    'movements',(select jsonb_agg(to_jsonb(x) order by id) from inventory_movements x where organization_id=org),
    'reservations',(select jsonb_agg(to_jsonb(x) order by id) from inventory_reservations x where organization_id=org),
    'consumptions',(select jsonb_agg(to_jsonb(x) order by id) from repair_part_consumptions x where organization_id=org));
$$;
create temporary table inventory_before as select pg_temp.acc_inventory((select (data->>'org')::uuid from stock_fixture)) value;
select is((select (value->'stock'->0->>'physical_quantity')::numeric from inventory_before),9::numeric,'fixture has physical stock');
select is((select (value->'stock'->0->>'reserved_quantity')::numeric from inventory_before),3::numeric,'fixture has active reserved stock');
select is((select jsonb_array_length(value->'consumptions') from inventory_before),1,'fixture has a confirmed part consumption');
select lives_ok($$select save_repair_accessories(pg_temp.acc_payload((select data from stock_fixture),'{"accessories":[{"name":"Bolsa del cliente","quantity_received":2}]}'))$$,'reception on order with real inventory');
select lives_ok($$select record_repair_accessory_return(pg_temp.acc_payload((select data from stock_fixture),jsonb_build_object('returns',jsonb_build_array(
  jsonb_build_object('accessory_id',(select data->>'cable' from stock_fixture),'quantity',1)))))$$,'custody return with real inventory');
select is(pg_temp.acc_inventory((select (data->>'org')::uuid from stock_fixture)),(select value from inventory_before),'physical stock, reservations, movements and consumptions unchanged byte-for-byte');
select * from finish();
rollback;
