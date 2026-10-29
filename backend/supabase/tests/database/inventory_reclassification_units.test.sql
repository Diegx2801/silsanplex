begin;
select no_plan();

insert into public.organizations(id,name,slug) values
 ('ac190000-0000-4000-8000-000000000001','Stock control tests','stock-control-test'),
 ('ac190000-0000-4000-8000-000000000002','Foreign stock tests','foreign-stock-control-test');
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values
 ('ac191000-0000-4000-8000-000000000001','stock-admin@test.local','{"full_name":"Stock admin"}',now(),now()),
 ('ac191000-0000-4000-8000-000000000002','stock-sales@test.local','{"full_name":"Stock sales"}',now(),now());
insert into public.organization_memberships(organization_id,user_id) values
 ('ac190000-0000-4000-8000-000000000001','ac191000-0000-4000-8000-000000000001'),
 ('ac190000-0000-4000-8000-000000000001','ac191000-0000-4000-8000-000000000002');
insert into public.user_roles(organization_id,user_id,role_code) values
 ('ac190000-0000-4000-8000-000000000001','ac191000-0000-4000-8000-000000000001','ADMIN'),
 ('ac190000-0000-4000-8000-000000000001','ac191000-0000-4000-8000-000000000002','VENTAS');
insert into public.products(id,organization_id,code,description,unit_of_measure,batch_control,expiration_control)
values ('ac192000-0000-4000-8000-000000000001','ac190000-0000-4000-8000-000000000001','RECLASS','Stock condition test','UND',true,true);
insert into public.product_unit_conversions(organization_id,product_id,unit_id,conversion_factor)
select 'ac190000-0000-4000-8000-000000000001','ac192000-0000-4000-8000-000000000001',id,20
from public.measurement_units where organization_id='ac190000-0000-4000-8000-000000000001' and code='BOX';
insert into public.warehouses(id,organization_id,code,name) values
 ('ac193000-0000-4000-8000-000000000001','ac190000-0000-4000-8000-000000000001','ONE','Stock source');
insert into public.warehouse_locations(id,organization_id,warehouse_id,code,name) values
 ('ac194000-0000-4000-8000-000000000001','ac190000-0000-4000-8000-000000000001','ac193000-0000-4000-8000-000000000001','A','Shelf A');
insert into public.inventory_movements(
 organization_id,product_id,product_code,product_description,unit_of_measure,movement_type,quantity,
 warehouse,warehouse_id,location_id,stock_status,unit_cost,lot,expiration_date,operation_date,reason,source_type
)
select 'ac190000-0000-4000-8000-000000000001','ac192000-0000-4000-8000-000000000001','RECLASS','Stock condition test','Unidad','entrada',100,
 'Stock source','ac193000-0000-4000-8000-000000000001','ac194000-0000-4000-8000-000000000001',fixture.status,3.1250,fixture.lot,current_date+fixture.days,current_date,'Fixture','manual'
from (values('EARLY',10,'available'),('Late-Lot',100,'available'),('QUARANTINE',100,'quarantine'),('DAMAGED',100,'damaged'),('EXPIRED',-10,'available')) as fixture(lot,days,status);
insert into public.inventory_reservations(organization_id,product_id,warehouse_id,location_id,stock_status,lot,expiration_date,quantity,source_type,source_id,status)
values ('ac190000-0000-4000-8000-000000000001','ac192000-0000-4000-8000-000000000001','ac193000-0000-4000-8000-000000000001','ac194000-0000-4000-8000-000000000001','available','EARLY',current_date+10,90,'reclassification-test','ac195000-0000-4000-8000-000000000001','active');

create function pg_temp.reclass_payload(overrides jsonb default '{}'::jsonb)
returns jsonb language sql as $$
 select jsonb_build_object(
  'organization_id','ac190000-0000-4000-8000-000000000001','product_id','ac192000-0000-4000-8000-000000000001',
  'operation_key','ac196000-0000-4000-8000-000000000001','warehouse_id','ac193000-0000-4000-8000-000000000001',
  'location_id','ac194000-0000-4000-8000-000000000001','quantity',2,'lot','late-lot',
  'expiration_date',current_date+100,'source_status','available','destination_status','quarantine',
  'reason','Inspección de calidad','input_unit_id',(
   select id from public.measurement_units where organization_id='ac190000-0000-4000-8000-000000000001' and code='BOX'
  ),'expected_conversion_factor',20
 ) || overrides;
$$;

select is(has_function_privilege('anon','public.reclassify_inventory(jsonb)','EXECUTE'),false,'anonymous cannot execute');
select is(has_table_privilege('authenticated','inventory_internal.reclassification_operations','INSERT'),false,'client cannot forge idempotency completion');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload())$$,'42501','INVENTORY_FORBIDDEN','anonymous denied inside function');
select set_config('request.jwt.claim.sub','ac191000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload())$$,'42501','INVENTORY_FORBIDDEN','sales user cannot change stock conditions');
select set_config('request.jwt.claim.sub','ac191000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"organization_id":"ac190000-0000-4000-8000-000000000002"}'))$$,'42501','INVENTORY_FORBIDDEN','foreign organization rejected');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"quantity":0}'))$$,'22023','INVENTORY_QUANTITY_INVALID','zero rejected');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"quantity":"NaN"}'))$$,'22023','INVENTORY_QUANTITY_INVALID','NaN rejected');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"quantity":1.1234}'))$$,'22023','INVENTORY_QUANTITY_INVALID','excess entered precision rejected');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"expected_conversion_factor":19}'))$$,'P0001','INVENTORY_INPUT_UNIT_STALE','stale conversion rejected');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"input_unit_id":"ac199000-0000-4000-8000-000000000001"}'))$$,'22023','INVENTORY_INPUT_UNIT_INVALID','unconfigured unit rejected');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"destination_status":"available"}'))$$,'P0001','INVENTORY_STATUS_INVALID','identical condition rejected');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"source_status":null}'))$$,'P0001','INVENTORY_STATUS_INVALID','missing source condition rejected');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"reason":""}'))$$,'22023','RECLASSIFICATION_REASON_INVALID','empty reason rejected server side');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"location_id":"ac194000-0000-4000-8000-000000000002"}'))$$,'P0001','INVENTORY_LOCATION_UNAVAILABLE','nonexistent location rejected');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"quantity":6}'))$$,'P0001','INVENTORY_INSUFFICIENT_STOCK','physical overdraw rejected');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload(jsonb_build_object('lot','EARLY','expiration_date',current_date+10)))$$,'P0001','INVENTORY_RESERVED_STOCK','reserved quantity cannot change condition');
select is((select count(*) from inventory_internal.reclassification_operations where organization_id='ac190000-0000-4000-8000-000000000001'),0::bigint,'rejected requests do not claim the operation key');
create temp table reclass_result(id uuid);
insert into reclass_result select public.reclassify_inventory(pg_temp.reclass_payload());
select is((select count(*) from public.inventory_movements where source_id=(select id from reclass_result)),2::bigint,'one operation writes exactly two movements');
select is((select min(quantity) from public.inventory_movements where source_id=(select id from reclass_result)),40::numeric,'two boxes become forty base units');
select is((select min(entered_quantity) from public.inventory_movements where source_id=(select id from reclass_result)),2::numeric,'entered quantity retained on both ledger rows');
select is((select min(entered_unit_of_measure) from public.inventory_movements where source_id=(select id from reclass_result)),'Caja','entered unit name retained');
select is((select min(unit_conversion_factor) from public.inventory_movements where source_id=(select id from reclass_result)),20::numeric,'conversion snapshot retained');
select is((select min(unit_cost) from public.inventory_movements where source_id=(select id from reclass_result)),3.1250::numeric,'source valuation preserved');
select is((select min(lot) from public.inventory_movements where source_id=(select id from reclass_result)),'Late-Lot','original lot spelling preserved');
select is((select sum(case when movement_type='entrada' then quantity else -quantity end) from public.inventory_movements where source_id=(select id from reclass_result)),0::numeric,'global quantity unchanged');
select is((select sum(case when movement_type='entrada' then quantity*unit_cost else -quantity*unit_cost end) from public.inventory_movements where source_id=(select id from reclass_result)),0::numeric,'global valuation unchanged');
select is(public.inventory_bucket_quantity('ac190000-0000-4000-8000-000000000001','ac192000-0000-4000-8000-000000000001','ac193000-0000-4000-8000-000000000001','ac194000-0000-4000-8000-000000000001','available','Late-Lot',current_date+100),60::numeric,'exact source bucket debited');
select is(public.inventory_bucket_quantity('ac190000-0000-4000-8000-000000000001','ac192000-0000-4000-8000-000000000001','ac193000-0000-4000-8000-000000000001','ac194000-0000-4000-8000-000000000001','quarantine','Late-Lot',current_date+100),40::numeric,'same lot and location credited under new condition');
select is(public.reclassify_inventory(pg_temp.reclass_payload()),(select id from reclass_result),'identical retry returns original operation');
select is((select count(*) from public.inventory_movements where source_id=(select id from reclass_result)),2::bigint,'retry never duplicates movements');
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"quantity":1}'))$$,'P0001','RECLASSIFICATION_OPERATION_CONFLICT','changed payload cannot reuse operation key');
select is((select count(*) from public.audit_events where organization_id='ac190000-0000-4000-8000-000000000001' and action='INVENTORY_RECLASSIFIED'),1::bigint,'one audit event, not one per retry');
select is(coalesce(current_setting('app.inventory_input_unit_context',true),''),'','input context restored');
select lives_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"operation_key":"ac196000-0000-4000-8000-000000000002","lot":"QUARANTINE","source_status":"quarantine","destination_status":"available","quantity":1,"input_unit_id":null,"expected_conversion_factor":1}'))$$,'quarantined stock can be released using base units');
select lives_ok($$select public.reclassify_inventory(pg_temp.reclass_payload(jsonb_build_object('operation_key','ac196000-0000-4000-8000-000000000003','lot','EXPIRED','expiration_date',current_date-10,'quantity',1,'destination_status','damaged')))$$,'expired stock can be immobilized without FEFO dispatch restriction');
select is((select sum(quantity-quantity_consumed) from public.inventory_reservations where product_id='ac192000-0000-4000-8000-000000000001'),90::numeric,'existing reservations remain untouched');
select lives_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"operation_key":null,"lot":"DAMAGED","source_status":"damaged","destination_status":"quarantine","quantity":1}'))$$,'legacy keyless integrations retain compatibility');

-- Reproduce a pre-guard historical position only inside this rollback fixture.
alter table public.inventory_movements disable trigger inventory_movements_guard_base_unit;
insert into public.inventory_movements(organization_id,product_id,product_code,product_description,unit_of_measure,movement_type,quantity,warehouse,warehouse_id,location_id,stock_status,unit_cost,lot,expiration_date,operation_date,reason,source_type)
values('ac190000-0000-4000-8000-000000000001','ac192000-0000-4000-8000-000000000001','RECLASS','Stock condition test','Caja','entrada',1,'Stock source','ac193000-0000-4000-8000-000000000001','ac194000-0000-4000-8000-000000000001','damaged',3.125,'Late-Lot',current_date+100,current_date,'Legacy unit fixture','manual');
alter table public.inventory_movements enable trigger inventory_movements_guard_base_unit;
select throws_ok($$select public.reclassify_inventory(pg_temp.reclass_payload('{"operation_key":"ac196000-0000-4000-8000-000000000004","destination_status":"damaged","quantity":1}'))$$,'P0001','INVENTORY_POSITION_UNIT_CONFLICT','legacy mixed destination units cannot be merged');
select is(public.reclassify_inventory(pg_temp.reclass_payload()),(select id from reclass_result),'committed retry is replayed even after bucket changes');
select * from finish();
rollback;
