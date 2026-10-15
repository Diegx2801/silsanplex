begin;
select no_plan();

insert into public.organizations(id,name,slug) values
 ('ab150000-0000-4000-8000-000000000001','Position transfers','position-transfer-test'),
 ('ab150000-0000-4000-8000-000000000002','Foreign transfers','foreign-position-transfer-test');
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values
 ('ab151000-0000-4000-8000-000000000001','transfer-admin@test.local','{"full_name":"Transfer admin"}',now(),now()),
 ('ab151000-0000-4000-8000-000000000002','transfer-sales@test.local','{"full_name":"Transfer sales"}',now(),now());
insert into public.organization_memberships(organization_id,user_id) values
 ('ab150000-0000-4000-8000-000000000001','ab151000-0000-4000-8000-000000000001'),
 ('ab150000-0000-4000-8000-000000000001','ab151000-0000-4000-8000-000000000002');
insert into public.user_roles(organization_id,user_id,role_code) values
 ('ab150000-0000-4000-8000-000000000001','ab151000-0000-4000-8000-000000000001','ADMIN'),
 ('ab150000-0000-4000-8000-000000000001','ab151000-0000-4000-8000-000000000002','VENTAS');
insert into public.products(id,organization_id,code,description,unit_of_measure,batch_control,expiration_control)
values ('ab152000-0000-4000-8000-000000000001','ab150000-0000-4000-8000-000000000001','POSITION','Position test','UND',true,true);
insert into public.product_unit_conversions(organization_id,product_id,unit_id,conversion_factor)
select 'ab150000-0000-4000-8000-000000000001','ab152000-0000-4000-8000-000000000001',id,20
from public.measurement_units where organization_id='ab150000-0000-4000-8000-000000000001' and code='BOX';
insert into public.warehouses(id,organization_id,code,name) values
 ('ab153000-0000-4000-8000-000000000001','ab150000-0000-4000-8000-000000000001','ONE','Source'),
 ('ab153000-0000-4000-8000-000000000002','ab150000-0000-4000-8000-000000000001','TWO','Destination'),
 ('ab153000-0000-4000-8000-000000000003','ab150000-0000-4000-8000-000000000002','OTHER','Foreign');
insert into public.warehouse_locations(id,organization_id,warehouse_id,code,name) values
 ('ab154000-0000-4000-8000-000000000001','ab150000-0000-4000-8000-000000000001','ab153000-0000-4000-8000-000000000001','A','Shelf A'),
 ('ab154000-0000-4000-8000-000000000002','ab150000-0000-4000-8000-000000000001','ab153000-0000-4000-8000-000000000001','B','Shelf B'),
 ('ab154000-0000-4000-8000-000000000003','ab150000-0000-4000-8000-000000000001','ab153000-0000-4000-8000-000000000002','C','Shelf C'),
 ('ab154000-0000-4000-8000-000000000004','ab150000-0000-4000-8000-000000000002','ab153000-0000-4000-8000-000000000003','D','Foreign shelf');
insert into public.inventory_movements(
 organization_id,product_id,product_code,product_description,unit_of_measure,movement_type,quantity,
 warehouse,warehouse_id,location_id,stock_status,unit_cost,lot,expiration_date,operation_date,reason,source_type
)
select 'ab150000-0000-4000-8000-000000000001','ab152000-0000-4000-8000-000000000001','POSITION','Position test','Unidad','entrada',100,
 'Source','ab153000-0000-4000-8000-000000000001','ab154000-0000-4000-8000-000000000001',fixture.status,3.1250,fixture.lot,current_date+fixture.days,current_date,'Fixture','manual'
from (values('EARLY',10,'available'),('Late-Lot',100,'available'),('QUARANTINE',100,'quarantine'),('DAMAGED',100,'damaged'),('EXPIRED',-10,'available')) as fixture(lot,days,status);
insert into public.inventory_reservations(organization_id,product_id,warehouse_id,location_id,stock_status,lot,expiration_date,quantity,source_type,source_id,status)
values ('ab150000-0000-4000-8000-000000000001','ab152000-0000-4000-8000-000000000001','ab153000-0000-4000-8000-000000000001','ab154000-0000-4000-8000-000000000001','available','EARLY',current_date+10,90,'transfer-test','ab155000-0000-4000-8000-000000000001','active');

create function pg_temp.transfer_payload(overrides jsonb default '{}'::jsonb)
returns jsonb language sql as $$
 select jsonb_build_object(
  'organization_id','ab150000-0000-4000-8000-000000000001','product_id','ab152000-0000-4000-8000-000000000001',
  'operation_key','ab156000-0000-4000-8000-000000000001','source_warehouse_id','ab153000-0000-4000-8000-000000000001',
  'source_location_id','ab154000-0000-4000-8000-000000000001','destination_warehouse_id','ab153000-0000-4000-8000-000000000002',
  'destination_location_id','ab154000-0000-4000-8000-000000000003','quantity',2,'lot','late-lot',
  'expiration_date',current_date+100,'stock_status','available','input_unit_id',(
   select id from public.measurement_units where organization_id='ab150000-0000-4000-8000-000000000001' and code='BOX'
  ),'expected_conversion_factor',20
 ) || overrides;
$$;

select has_function('public','transfer_inventory_position',array['jsonb'],'exact-position RPC exists');
select is(has_function_privilege('anon','public.transfer_inventory_position(jsonb)','EXECUTE'),false,'anonymous cannot execute');
select is(has_function_privilege('authenticated','public.transfer_inventory_position(jsonb)','EXECUTE'),true,'authenticated may execute with authorization');
select is(has_sequence_privilege('authenticated','inventory_internal.transfer_reference_sequence','USAGE'),false,'folio sequence is private');
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload())$$,'42501','INVENTORY_FORBIDDEN','anonymous denied inside function');
select set_config('request.jwt.claim.sub','ab151000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload())$$,'42501','INVENTORY_FORBIDDEN','sales user cannot move inventory');
select set_config('request.jwt.claim.sub','ab151000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"organization_id":"ab150000-0000-4000-8000-000000000002"}'))$$,'42501','INVENTORY_FORBIDDEN','cross-organization forbidden');
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"operation_key":null}'))$$,'22023','TRANSFER_OPERATION_KEY_REQUIRED','idempotency key required');
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"quantity":0}'))$$,'22023','INVENTORY_QUANTITY_INVALID','zero rejected');
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"quantity":"NaN"}'))$$,'22023','INVENTORY_QUANTITY_INVALID','NaN rejected');
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"expected_conversion_factor":19}'))$$,'P0001','INVENTORY_INPUT_UNIT_STALE','stale unit factor rejected');
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"destination_warehouse_id":"ab153000-0000-4000-8000-000000000001","destination_location_id":"ab154000-0000-4000-8000-000000000001"}'))$$,'P0001','TRANSFER_POSITION_MUST_DIFFER','identical position rejected');
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"destination_warehouse_id":"ab153000-0000-4000-8000-000000000003","destination_location_id":"ab154000-0000-4000-8000-000000000004"}'))$$,'P0001','TRANSFER_WAREHOUSE_UNAVAILABLE','foreign destination rejected');
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"destination_location_id":"ab154000-0000-4000-8000-000000000002"}'))$$,'P0001','TRANSFER_LOCATION_UNAVAILABLE','location must belong to destination warehouse');
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"lot":"missing"}'))$$,'P0001','TRANSFER_SOURCE_POSITION_UNAVAILABLE','missing source does not select a different lot');
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload(jsonb_build_object('lot','EARLY','expiration_date',current_date+10)))$$,'P0001','TRANSFER_INSUFFICIENT_STOCK','reserved source cannot be relocated');
select is((select count(*) from public.warehouse_transfers where organization_id='ab150000-0000-4000-8000-000000000001'),0::bigint,'rejected requests leave no transfer header');
create temp table transfer_result(id uuid);
insert into transfer_result select public.transfer_inventory_position(pg_temp.transfer_payload());
select is((select count(*) from public.inventory_movements where transfer_id=(select id from transfer_result)),2::bigint,'transfer writes exactly two ledger rows');
select is((select quantity from public.warehouse_transfer_items where transfer_id=(select id from transfer_result)),40::numeric,'two boxes convert to forty base units');
select is((select min(entered_quantity) from public.inventory_movements where transfer_id=(select id from transfer_result)),2::numeric,'capture quantity retained');
select is((select min(entered_unit_of_measure) from public.inventory_movements where transfer_id=(select id from transfer_result)),'Caja','capture unit retained');
select is((select min(unit_conversion_factor) from public.inventory_movements where transfer_id=(select id from transfer_result)),20::numeric,'conversion snapshot retained');
select is((select min(lot) from public.inventory_movements where transfer_id=(select id from transfer_result)),'Late-Lot','source lot spelling preserved');
select is((select min(unit_cost) from public.inventory_movements where transfer_id=(select id from transfer_result)),3.1250::numeric,'source unit cost preserved');
select is((select sum(case when movement_type='entrada' then quantity else -quantity end) from public.inventory_movements where transfer_id=(select id from transfer_result)),0::numeric,'transfer conserves total stock');
select is((select sum(case when movement_type='entrada' then quantity*unit_cost else -quantity*unit_cost end) from public.inventory_movements where transfer_id=(select id from transfer_result)),0::numeric,'transfer conserves total valuation');
select matches((select reference from public.warehouse_transfers where id=(select id from transfer_result)),'^TR-[0-9]+$','folio assigned automatically');
select is(public.transfer_inventory_position(pg_temp.transfer_payload()),(select id from transfer_result),'identical retry returns existing transfer');
select is((select count(*) from public.inventory_movements where transfer_id=(select id from transfer_result)),2::bigint,'retry never duplicates ledger');
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"quantity":1}'))$$,'P0001','TRANSFER_OPERATION_CONFLICT','changed request cannot reuse key');
select is(coalesce(current_setting('app.inventory_input_unit_context',true),''),'','unit context cleaned');

select lives_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"operation_key":"ab156000-0000-4000-8000-000000000002","destination_warehouse_id":"ab153000-0000-4000-8000-000000000001","destination_location_id":"ab154000-0000-4000-8000-000000000002","quantity":1}'))$$,'same warehouse different shelf relocation succeeds');
select is(public.inventory_bucket_quantity('ab150000-0000-4000-8000-000000000001','ab152000-0000-4000-8000-000000000001','ab153000-0000-4000-8000-000000000001','ab154000-0000-4000-8000-000000000002','available','Late-Lot',current_date+100),20::numeric,'destination shelf receives exact selected lot');
select is(public.inventory_bucket_quantity('ab150000-0000-4000-8000-000000000001','ab152000-0000-4000-8000-000000000001','ab153000-0000-4000-8000-000000000001','ab154000-0000-4000-8000-000000000001','available','EARLY',current_date+10),100::numeric,'earlier FEFO lot remains untouched');
select lives_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"operation_key":"ab156000-0000-4000-8000-000000000003","stock_status":"quarantine","lot":"QUARANTINE","quantity":1}'))$$,'quarantined stock can relocate without becoming available');
select is((select stock_status from public.warehouse_transfer_items where transfer_id=(select id from public.warehouse_transfers where operation_key='ab156000-0000-4000-8000-000000000003')),'quarantine','quarantine condition preserved');
select lives_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"operation_key":"ab156000-0000-4000-8000-000000000004","stock_status":"damaged","lot":"DAMAGED","quantity":1}'))$$,'damaged stock can physically relocate');
select lives_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload(jsonb_build_object('operation_key','ab156000-0000-4000-8000-000000000005','lot','EXPIRED','expiration_date',current_date-10,'quantity',1)))$$,'expired stock can relocate without being dispatched');
select is((select count(distinct reference) from public.warehouse_transfers where organization_id='ab150000-0000-4000-8000-000000000001'),5::bigint,'all operations receive distinct folios');
select is((select count(*) from public.audit_events where organization_id='ab150000-0000-4000-8000-000000000001' and action='WAREHOUSE_TRANSFER_COMPLETED'),5::bigint,'one audit event per operation, not per retry');
select is((select sum(quantity-quantity_consumed) from public.inventory_reservations where product_id='ab152000-0000-4000-8000-000000000001'),90::numeric,'reservations untouched');
select throws_ok($$insert into public.inventory_movements(organization_id,product_id,product_code,product_description,unit_of_measure,movement_type,quantity,warehouse,warehouse_id,location_id,stock_status,unit_cost,lot,expiration_date,operation_date,reason,source_type)
 values('ab150000-0000-4000-8000-000000000001','ab152000-0000-4000-8000-000000000001','POSITION','Position test','Unidad','salida',1,'Source','ab153000-0000-4000-8000-000000000001','ab154000-0000-4000-8000-000000000001','available',3.125,'Late-Lot',current_date+100,current_date,'Manual dispatch','manual')$$,'P0001','INVENTORY_FEFO_VIOLATION','ordinary outbound still enforces FEFO');

-- A legacy base-unit mismatch must never be silently converted using the
-- current product's alternative presentation. Only this rollback fixture
-- bypasses the modern insert guard to reproduce pre-guard historical data.
insert into public.inventory_movements(organization_id,product_id,product_code,product_description,unit_of_measure,movement_type,quantity,warehouse,warehouse_id,location_id,stock_status,unit_cost,lot,expiration_date,operation_date,reason,source_type)
values('ab150000-0000-4000-8000-000000000001','ab152000-0000-4000-8000-000000000001','POSITION','Position test','UND','entrada',1,'Source','ab153000-0000-4000-8000-000000000001','ab154000-0000-4000-8000-000000000001','available',3.125,'ALIAS',current_date+100,current_date,'Compatible unit alias fixture','manual');
select lives_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"operation_key":"ab156000-0000-4000-8000-000000000008","quantity":1,"lot":"ALIAS","input_unit_id":null,"expected_conversion_factor":1}'))$$,'known historical base-unit aliases do not block valid transfers');
alter table public.inventory_movements disable trigger inventory_movements_guard_base_unit;
insert into public.inventory_movements(organization_id,product_id,product_code,product_description,unit_of_measure,movement_type,quantity,warehouse,warehouse_id,location_id,stock_status,unit_cost,lot,expiration_date,operation_date,reason,source_type)
values('ab150000-0000-4000-8000-000000000001','ab152000-0000-4000-8000-000000000001','POSITION','Position test','Caja','entrada',1,'Source','ab153000-0000-4000-8000-000000000001','ab154000-0000-4000-8000-000000000001','available',3.125,'Late-Lot',current_date+100,current_date,'Legacy unit fixture','manual');
alter table public.inventory_movements enable trigger inventory_movements_guard_base_unit;
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"operation_key":"ab156000-0000-4000-8000-000000000006","quantity":1}'))$$,'P0001','INVENTORY_POSITION_UNIT_CONFLICT','mixed legacy source units require reconciliation, not automatic conversion');
select throws_ok($$select public.transfer_inventory_position(pg_temp.transfer_payload('{"operation_key":"ab156000-0000-4000-8000-000000000007","source_warehouse_id":"ab153000-0000-4000-8000-000000000002","source_location_id":"ab154000-0000-4000-8000-000000000003","destination_warehouse_id":"ab153000-0000-4000-8000-000000000001","destination_location_id":"ab154000-0000-4000-8000-000000000001","quantity":1}'))$$,'P0001','INVENTORY_POSITION_UNIT_CONFLICT','mixed legacy destination units also block unsafe merging');

select * from finish();
rollback;
