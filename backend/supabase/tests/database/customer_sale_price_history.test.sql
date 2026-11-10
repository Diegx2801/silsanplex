begin;
select plan(30);
create function pg_temp.hid(n integer) returns uuid language sql immutable as $$
  select ('a8810000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
insert into public.organizations(id,name,slug) values
  (pg_temp.hid(1),'Price history one','price-history-one'),(pg_temp.hid(2),'Price history two','price-history-two');
insert into auth.users(id,email,raw_user_meta_data) values
  (pg_temp.hid(31),'price-history@test.invalid','{"full_name":"History salesperson"}'),
  (pg_temp.hid(32),'price-history-other@test.invalid','{}'),
  (pg_temp.hid(33),'price-history-denied@test.invalid','{}');
insert into public.organization_memberships(organization_id,user_id) values
  (pg_temp.hid(1),pg_temp.hid(31)),(pg_temp.hid(2),pg_temp.hid(32)),(pg_temp.hid(1),pg_temp.hid(33));
insert into public.user_roles(organization_id,user_id,role_code) values
  (pg_temp.hid(1),pg_temp.hid(31),'VENTAS'),(pg_temp.hid(2),pg_temp.hid(32),'VENTAS');
insert into public.organization_user_permissions(organization_id,user_id,permission_code) values
  (pg_temp.hid(1),pg_temp.hid(33),'CUSTOMERS_VIEW');
insert into auth.sessions(id,user_id) values
  (pg_temp.hid(41),pg_temp.hid(31)),(pg_temp.hid(43),pg_temp.hid(33));
insert into public.customers(id,organization_id,document_type,document_number,legal_name) values
  (pg_temp.hid(11),pg_temp.hid(1),'OTHER','HIST-1','History customer'),
  (pg_temp.hid(12),pg_temp.hid(1),'OTHER','HIST-2','Another customer'),
  (pg_temp.hid(13),pg_temp.hid(2),'OTHER','HIST-3','Foreign customer');
insert into public.products(id,organization_id,code,description,unit_of_measure,tax_affectation) values
  (pg_temp.hid(21),pg_temp.hid(1),'HIST-1','Historical product','UND','gravado'),
  (pg_temp.hid(22),pg_temp.hid(2),'HIST-2','Foreign product','CAJA','exonerado');
insert into public.warehouses(id,organization_id,code,name) values
  (pg_temp.hid(51),pg_temp.hid(1),'HIST-1','History warehouse'),
  (pg_temp.hid(52),pg_temp.hid(2),'HIST-2','Foreign warehouse');

-- Real persisted commercial rows and original snapshot triggers, never mocked prices.
create function pg_temp.history_sale(n integer, org uuid, cust uuid, prod uuid,
  d date, price numeric, inc boolean, unit text, sale_status text default 'registrada')
returns uuid language plpgsql as $$
declare oid uuid := gen_random_uuid(); iid uuid := gen_random_uuid(); sid uuid := pg_temp.hid(100+n);
begin
  insert into public.orders(id,organization_id,order_number,customer_id,order_date,operation_key,prices_include_tax,warehouse_id)
    values(oid,org,'PED-'||lpad(n::text,6,'0'),cust,d,gen_random_uuid(),inc,
      case when org=pg_temp.hid(1) then pg_temp.hid(51) else pg_temp.hid(52) end);
  insert into public.order_items(id,organization_id,order_id,product_id,product_code,product_description,unit_of_measure,quantity,unit_price)
    values(iid,org,oid,prod,'ORIGINAL','Original description',unit,2,price);
  insert into public.sales(id,organization_id,order_id,customer_id,internal_number,document_type,series,document_number,
    sale_date,warehouse,operation_key,prices_include_tax,status,created_at,created_by)
    values(sid,org,oid,cust,'VEN-'||lpad(n::text,6,'0'),'nota-venta','NV',n::text,d,'History warehouse',
      gen_random_uuid(),inc,sale_status,'2026-11-01 12:00:00+00',pg_temp.hid(31));
  insert into public.sale_items(organization_id,sale_id,order_id,order_item_id,product_id,product_code,product_description,
    unit_of_measure,quantity,unit_price)
    values(org,sid,oid,iid,prod,'ORIGINAL','Original description',unit,2,price);
  return sid;
end $$;
select pg_temp.history_sale(1,pg_temp.hid(1),pg_temp.hid(11),pg_temp.hid(21),'2026-10-01',11.80,true,'UND');
select pg_temp.history_sale(2,pg_temp.hid(1),pg_temp.hid(11),pg_temp.hid(21),'2026-11-01',15,false,'CAJA','despachada');
select pg_temp.history_sale(3,pg_temp.hid(1),pg_temp.hid(11),pg_temp.hid(21),'2026-11-01',17,true,'UND');
select pg_temp.history_sale(4,pg_temp.hid(1),pg_temp.hid(12),pg_temp.hid(21),'2026-11-02',99,true,'UND');
select pg_temp.history_sale(5,pg_temp.hid(2),pg_temp.hid(13),pg_temp.hid(22),'2026-11-03',999,true,'CAJA');
select pg_temp.history_sale(6,pg_temp.hid(1),pg_temp.hid(11),pg_temp.hid(21),'2026-11-04',888,true,'UND');
update public.orders set status='cancelado' where id=(select order_id from public.sales where id=pg_temp.hid(106));
-- Catalog edits must not rewrite any of the sale snapshots.
update public.products set code='NEW-CODE', description='New description',tax_affectation='exonerado' where id=pg_temp.hid(21);

select is(has_function_privilege('anon','public.get_customer_sale_price_history(uuid,uuid,uuid,date,date,text,integer,integer)','execute'),false,'anon denied');
select is(has_function_privilege('service_role','public.get_customer_sale_price_history(uuid,uuid,uuid,date,date,text,integer,integer)','execute'),false,'no service_role actor shortcut');
select is((select prosecdef from pg_proc where oid='public.get_customer_sale_price_history(uuid,uuid,uuid,date,date,text,integer,integer)'::regprocedure),false,'invoker preserves RLS');
select set_config('request.jwt.claims',json_build_object('sub',pg_temp.hid(31),'role','authenticated','session_id',pg_temp.hid(41))::text,true);
set local role authenticated;
select is((select count(*) from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11))),3::bigint,'only matching valid sales');
select is((select unit_price from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),pg_temp.hid(21),page_size=>1)),17::numeric,'latest date with stable UUID tie-break');
select is((select sale_id from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),page_size=>1,page_offset=>1)),pg_temp.hid(102),'second page stable');
select is((select unit_price from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(12),page_size=>1)),99::numeric,'customer separation');
select is((select count(*) from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(999))),0::bigint,'no history');
select is((select count(*) from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(13))),0::bigint,'foreign customer has no rows');
select throws_ok($$select * from public.get_customer_sale_price_history(pg_temp.hid(2),pg_temp.hid(13))$$,'42501','CUSTOMER_SALE_HISTORY_FORBIDDEN','foreign organization denied');
select is((select count(*) from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),pg_temp.hid(22))),0::bigint,'foreign product has no rows');
select is((select count(*) from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),date_from=>'2026-10-01',date_to=>'2026-10-01')),1::bigint,'inclusive date filters');
select is((select count(*) from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),product_search=>'original')),3::bigint,'search historical snapshot');
select is((select product_code from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),page_size=>1)),'ORIGINAL','snapshot code conserved');
select is((select tax_affectation from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),page_size=>1)),'gravado','historical IGV conserved');
select is((select prices_include_tax from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),page_size=>1,page_offset=>1)),false,'net price is explicit');
select is((select unit_of_measure from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),page_size=>1,page_offset=>1)),'CAJA','historical units conserved');
select is((select currency from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),page_size=>1)),'PEN','sole supported commercial currency, no invented FX');
select is((select recorded_by from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),page_size=>1)),pg_temp.hid(31),'verified recording actor');
select throws_ok($$select * from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),page_size=>0)$$,'22023','CUSTOMER_SALE_HISTORY_FILTER_INVALID','invalid pagination');
select throws_ok($$select * from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),date_from=>'2026-11-02',date_to=>'2026-11-01')$$,'22023','CUSTOMER_SALE_HISTORY_FILTER_INVALID','invalid date range');
select throws_ok($$select * from public.get_customer_sale_price_history(pg_temp.hid(1),null)$$,'22023','CUSTOMER_SALE_HISTORY_FILTER_INVALID','customer required');
select set_config('request.jwt.claims',json_build_object('sub',pg_temp.hid(33),'role','authenticated','session_id',pg_temp.hid(43))::text,true);
select throws_ok($$select * from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11))$$,'42501','CUSTOMER_SALE_HISTORY_FORBIDDEN','customers-only permission denied');
set local role postgres;
insert into public.organization_user_permissions(organization_id,user_id,permission_code) values(pg_temp.hid(1),pg_temp.hid(33),'SALES_VIEW');
delete from public.organization_user_permissions where user_id=pg_temp.hid(33) and permission_code='CUSTOMERS_VIEW';
set local role authenticated;
select throws_ok($$select * from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11))$$,'42501','CUSTOMER_SALE_HISTORY_FORBIDDEN','sales-only permission denied');
set local role postgres;
select pg_temp.history_sale(7,pg_temp.hid(1),pg_temp.hid(11),pg_temp.hid(21),'2026-11-05',22,true,'UND');
select set_config('request.jwt.claims',json_build_object('sub',pg_temp.hid(31),'role','authenticated','session_id',pg_temp.hid(41))::text,true);
set local role authenticated;
select is((select unit_price from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),page_size=>1)),22::numeric,'new sale immediately changes last price');
set local role postgres;
select pg_temp.history_sale(8,pg_temp.hid(1),pg_temp.hid(11),pg_temp.hid(21),'2026-09-01',100,true,'UND');
insert into public.products(id,organization_id,code,description,unit_of_measure,tax_affectation)
  values(pg_temp.hid(23),pg_temp.hid(1),'SECOND','Second product','UND','gravado');
insert into public.order_items(id,organization_id,order_id,product_id,product_code,product_description,unit_of_measure,quantity,unit_price)
  select pg_temp.hid(61),pg_temp.hid(1),order_id,pg_temp.hid(23),'SECOND','Second product','UND',1,9
  from public.sales where id=pg_temp.hid(101);
insert into public.sale_items(organization_id,sale_id,order_id,order_item_id,product_id,product_code,product_description,unit_of_measure,quantity,unit_price)
  select pg_temp.hid(1),id,order_id,pg_temp.hid(61),pg_temp.hid(23),'SECOND','Second product','UND',1,9
  from public.sales where id=pg_temp.hid(101);
set local role authenticated;
select is((select unit_price from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),page_size=>1)),22::numeric,'backdated sale does not override latest commercial date');
select is((select count(*) from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11))),6::bigint,'full customer history includes multiple products on a sale');
select is((select count(*) from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11),pg_temp.hid(21))),5::bigint,'product filter excludes other sale lines');
set local role postgres;
delete from auth.sessions where id=pg_temp.hid(41);
set local role authenticated;
select throws_ok($$select * from public.get_customer_sale_price_history(pg_temp.hid(1),pg_temp.hid(11))$$,'42501','CUSTOMER_SALE_HISTORY_FORBIDDEN','same JWT claims denied after session revocation');
select is((select count(*) from public.sale_items where organization_id=pg_temp.hid(1)),0::bigint,'underlying RLS still rejects revoked session');
select * from finish();
rollback;
