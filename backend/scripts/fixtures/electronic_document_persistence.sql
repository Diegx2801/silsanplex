-- Dedicated suite: run ONLY through test-sunat-phase2a.py after identity checks.
-- New UUID tenants, no cleanup, no existing documents, no trigger disabling.
-- The serial suite is rolled back by the runner. Race fixtures are retained.
do $$ begin
 if current_setting('silsan.sunat_phase2a_test',true) is distinct from 'verified-silsanplexp2c2' then
  raise exception using errcode='42501',message='CPE_TEST_REQUIRES_VERIFIED_ISOLATED_RUNNER';
 end if;
end $$;
create function pg_temp.cpe_assert(label text, ok boolean) returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end $$;
create function pg_temp.cpe_capture(q text, actor uuid default null, sid uuid default null) returns jsonb
language plpgsql as $$
declare v jsonb; s text; m text;
begin
 if actor is not null then
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',sid,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  set local role authenticated;
 end if;
 begin
  execute q into v;
  set constraints all immediate;
  set constraints all deferred;
 exception when others then
  get stacked diagnostics s=returned_sqlstate,m=message_text;
  reset role; return jsonb_build_object('state',s,'message',m);
 end;
 reset role; return jsonb_build_object('state','00000','value',v);
end $$;
create function pg_temp.cpe_call(name text,p jsonb,a uuid,s uuid) returns jsonb language sql as $$
 select pg_temp.cpe_capture(format('select public.%I(%L::jsonb)',name,p),a,s)
$$;
create function pg_temp.cpe_ok(name text,p jsonb,a uuid,s uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
 r:=pg_temp.cpe_call(name,p,a,s);
 if r->>'state'<>'00000' then raise exception '%: %',name,r; end if;
 return r->'value';
end $$;
create function pg_temp.cpe_ruc() returns text language plpgsql as $$
declare n text:='20'||lpad((floor(random()*100000000)::bigint)::text,8,'0');
begin
 return n||(((11-(select sum(substr(n,i::integer,1)::integer*w)%11 from unnest(array[5,4,3,2,7,6,5,4,3,2]) with ordinality a(w,i)))%10)::text);
end $$;
create function pg_temp.cpe_tenant() returns jsonb language plpgsql as $$
declare org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); issuer uuid:=gen_random_uuid();
 series uuid:=gen_random_uuid(); buyer uuid:=gen_random_uuid(); address uuid:=gen_random_uuid(); unit uuid:=gen_random_uuid(); warehouse uuid:=gen_random_uuid();
 p jsonb; r jsonb; code text:='S2A-'||left(org::text,8);
begin
 insert into public.organizations(id,name,slug) values(org,'SANDBOX fiscal ficticio',lower(code));
 insert into auth.users(id,email,raw_user_meta_data) values(actor,actor::text||'@example.invalid','{"full_name":"SANDBOX fiscal"}');
 insert into auth.sessions(id,user_id,created_at) values(sid,actor,now());
 insert into public.organization_memberships(organization_id,user_id) values(org,actor);
 insert into public.organization_user_permissions(organization_id,user_id,permission_code)
 select org,actor,permission.code from public.permissions permission where permission.code in('BILLING_VIEW','BILLING_PREPARE','BILLING_ISSUE','BILLING_CONFIGURE');
 insert into public.customers(id,organization_id,document_type,document_number,legal_name)
 values(buyer,org,'RUC',pg_temp.cpe_ruc(),'SANDBOX comprador ficticio');
 insert into public.customer_addresses(id,organization_id,customer_id,address_type,address_line,ubigeo_code)
 values(address,org,buyer,'FISCAL','SANDBOX domicilio ficticio 123','150101');
 insert into public.measurement_units(id,organization_id,code,name) values(unit,org,'NIU','Unidad fiscal ficticia');
 insert into public.warehouses(id,organization_id,code,name) values(warehouse,org,'TEST','SANDBOX ficticio');
 p:=jsonb_build_object('organizationId',org,'environment','sandbox','operationKey',gen_random_uuid(),'id',issuer,'expectedVersion','0',
  'ruc',pg_temp.cpe_ruc(),'legalName','SANDBOX emisor ficticio','fiscalAddress',jsonb_build_object('line','SANDBOX ficticio 123','district','Lima','province','Lima','department','Lima','ubigeo','150101','country','PE'),
  'establishmentCode','0000','ruleSetHash','cb5e871cfe3b81abea7faf25b156e5d35b21e8c4837979350919926612da73b6','testOnly',true);
 r:=pg_temp.cpe_ok('save_electronic_issuer_profile',p,actor,sid);
 p:=jsonb_build_object('organizationId',org,'environment','sandbox','operationKey',gen_random_uuid(),'id',series,'expectedVersion','0',
  'issuerProfileId',issuer,'documentType','01','series','F001','nextNumber','1','enabled',true);
 r:=pg_temp.cpe_ok('configure_electronic_series',p,actor,sid);
 return jsonb_build_object('org',org,'actor',actor,'sid',sid,'issuer',issuer,'series',series,'buyer',buyer,'address',address,'unit',unit,'warehouse',warehouse);
end $$;
create function pg_temp.cpe_sale(f jsonb, lines jsonb default '[{"quantity":"3.000","price":"1.0000","affectation":"gravado"}]', includes boolean default true) returns uuid
language plpgsql as $$
declare org uuid:=(f->>'org')::uuid; buyer uuid:=(f->>'buyer')::uuid; ord uuid:=gen_random_uuid(); sale uuid:=gen_random_uuid();
 product uuid; lineid uuid; l jsonb; n integer;
begin
 select coalesce(max(substring(internal_number from 5)::integer),0)+1 into n from public.sales where organization_id=org;
 insert into public.orders(id,organization_id,customer_id,order_number,operation_key,prices_include_tax,warehouse_id)
 values(ord,org,buyer,'PED-'||lpad(n::text,6,'0'),gen_random_uuid(),includes,(f->>'warehouse')::uuid);
 insert into public.sales(id,organization_id,order_id,customer_id,internal_number,document_type,series,document_number,sale_date,warehouse,operation_key,prices_include_tax)
 values(sale,org,ord,buyer,'VEN-'||lpad(n::text,6,'0'),'nota-venta','TEST',left(sale::text,20),current_date,'SANDBOX',gen_random_uuid(),includes);
 for l in select value from jsonb_array_elements(lines) loop
  product:=gen_random_uuid(); lineid:=gen_random_uuid();
  insert into public.products(id,organization_id,code,description,unit_of_measure,base_unit_id,tax_affectation)
  values(product,org,'T'||upper(replace(left(product::text,24),'-','')),'SANDBOX producto ficticio','NIU',(f->>'unit')::uuid,l->>'affectation');
  insert into public.order_items(id,organization_id,order_id,product_id,product_code,product_description,unit_of_measure,quantity,unit_price)
  values(lineid,org,ord,product,'TEST','SANDBOX producto ficticio','NIU',(l->>'quantity')::numeric,(l->>'price')::numeric);
  insert into public.sale_items(organization_id,sale_id,order_id,order_item_id,product_id,product_code,product_description,unit_of_measure,quantity,unit_price)
  values(org,sale,ord,lineid,product,'TEST','SANDBOX producto ficticio','NIU',(l->>'quantity')::numeric,(l->>'price')::numeric);
 end loop;
 return sale;
end $$;
create function pg_temp.cpe_prepare(f jsonb,sale uuid) returns jsonb language sql as $$
 select jsonb_build_object('schemaVersion','CPE-PE-DOM-PEN-1','organizationId',f->>'org','environment','sandbox',
 'operationKey',gen_random_uuid(),'saleId',sale,'issuerProfileId',f->>'issuer','expectedIssuerVersion','1',
 'seriesId',f->>'series','expectedSeriesVersion','1','issueDate',current_date,'buyerFiscalAddressId',f->>'address','payment',jsonb_build_object('kind','contado'))
$$;
create function pg_temp.cpe_confirm(f jsonb,d jsonb) returns jsonb language sql as $$
 select jsonb_build_object('organizationId',f->>'org','environment','sandbox','operationKey',gen_random_uuid(),'documentId',d->>'documentId','expectedVersion',d->>'version')
$$;
create function pg_temp.cpe_state(org uuid) returns jsonb language sql as $$
 select jsonb_build_object('docs',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from public.electronic_documents d where organization_id=org),
 'items',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from public.electronic_document_items d where organization_id=org),
 'commands',(select count(*) from public.electronic_document_commands where organization_id=org),
 'outbox',(select count(*) from public.electronic_document_outbox where organization_id=org),
 'audits',(select count(*) from public.audit_events where organization_id=org),
 'fiscalAudits',(select count(*) from public.audit_events where organization_id=org and action like 'CPE_%'),
 'commercialFingerprint',(select md5(jsonb_build_array(
   (select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.sales x where organization_id=org),
   (select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.sale_items x where organization_id=org),
   (select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.orders x where organization_id=org),
   (select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.order_items x where organization_id=org),
   (select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.inventory_movements x where organization_id=org),
   (select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.inventory_reservations x where organization_id=org),
   (select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.distribution_deliveries x where organization_id=org)
  )::text)),
 'series',(select jsonb_agg(to_jsonb(d) order by id) from public.electronic_document_series d where organization_id=org))
$$;
create function pg_temp.cpe_edit_buyer(buyer uuid) returns jsonb language plpgsql as $$
declare n integer;
begin
 update public.customers set legal_name='SANDBOX concurrent name' where id=buyer and legal_name like 'SANDBOX %';
 get diagnostics n=row_count;
 return jsonb_build_object('changed',n);
end $$;

-- SERIAL_TESTS_START: helpers above are reused by independent-session runner.
create function pg_temp.cpe_fail_after_counter() returns trigger language plpgsql as $$
begin
 if new.organization_id::text=current_setting('cpe.test_failure_org',true) then
  raise exception using errcode='P0001',message='CPE_TEST_AFTER_COUNTER';
 end if;
 return new;
end $$;
-- Created and rolled back with the serial transaction, never installed by migration.
create trigger cpe_test_after_counter after insert on public.electronic_document_outbox
for each row execute function pg_temp.cpe_fail_after_counter();
do $$
declare f jsonb:=pg_temp.cpe_tenant(); other_f jsonb:=pg_temp.cpe_tenant();
 org uuid:=(f->>'org')::uuid; a uuid:=(f->>'actor')::uuid; sid uuid:=(f->>'sid')::uuid;
 sale uuid; p jsonb; c jsonb; d jsonb; r jsonb; before_state jsonb; before_sale jsonb; frozen jsonb; x jsonb; keytext text;
 seriesid uuid; issuerp jsonb; versiontext text; anon uuid:=gen_random_uuid(); anon_session uuid:=gen_random_uuid();
 capability text; rpc text; needed text; matrix_actor uuid:=gen_random_uuid(); matrix_sid uuid:=gen_random_uuid();
begin
 sale:=pg_temp.cpe_sale(f); p:=pg_temp.cpe_prepare(f,sale);
 select to_jsonb(s) into before_sale from public.sales s where id=sale;
 d:=pg_temp.cpe_ok('prepare_electronic_document',p,a,sid);
 perform pg_temp.cpe_assert('included IGV exact numeric rounding',(select taxable_base=2.54 and tax=.46 and total=3 from public.electronic_documents where id=(d->>'documentId')::uuid));
 perform pg_temp.cpe_assert('prepare has no number or outbox',(select number is null from public.electronic_documents where id=(d->>'documentId')::uuid) and (select count(*)=0 from public.electronic_document_outbox where organization_id=org));
 before_state:=pg_temp.cpe_state(org);
 r:=pg_temp.cpe_ok('prepare_electronic_document',p,a,sid);
 perform pg_temp.cpe_assert('prepare identical replay unchanged',r=d and before_state=pg_temp.cpe_state(org));
 r:=pg_temp.cpe_call('prepare_electronic_document',p||'{"issueDate":"2026-10-24"}',a,sid);
 perform pg_temp.cpe_assert('prepare key conflict',r->>'message'='CPE_OPERATION_KEY_REUSED' and before_state=pg_temp.cpe_state(org));
 r:=pg_temp.cpe_call('prepare_electronic_document',p||jsonb_build_object('operationKey',gen_random_uuid()),a,sid);
 perform pg_temp.cpe_assert('one original per sale',r->>'message'='CPE_ORIGINAL_EXISTS');
 c:=pg_temp.cpe_confirm(f,d); d:=pg_temp.cpe_ok('confirm_electronic_document',c,a,sid);
 perform pg_temp.cpe_assert('frozen internal sandbox number one',d->>'state'='frozen' and d#>>'{fiscalIdentity,number}'='1');
 before_state:=pg_temp.cpe_state(org);
 r:=pg_temp.cpe_ok('confirm_electronic_document',c,a,sid);
 perform pg_temp.cpe_assert('confirm replay after version increment',r=d and before_state=pg_temp.cpe_state(org));
 r:=pg_temp.cpe_call('confirm_electronic_document',c||'{"expectedVersion":"2"}',a,sid);
 perform pg_temp.cpe_assert('confirm changed command rejected',r->>'message'='CPE_OPERATION_KEY_REUSED' and before_state=pg_temp.cpe_state(org));
 r:=pg_temp.cpe_call('confirm_electronic_document',c||jsonb_build_object('documentId',gen_random_uuid()),a,sid);
 perform pg_temp.cpe_assert('confirm same key other document conflicts',r->>'message'='CPE_OPERATION_KEY_REUSED' and before_state=pg_temp.cpe_state(org));
 perform pg_temp.cpe_assert('one confirmation command audit job',(select count(*)=1 from public.electronic_document_commands where organization_id=org and operation='confirm') and
  (select count(*)=1 from public.audit_events where organization_id=org and action='CPE_CONFIRM') and
  (select count(*)=1 from public.electronic_document_outbox where organization_id=org and state='blocked' and attempts=0));
 perform pg_temp.cpe_assert('source sale untouched',(select to_jsonb(s)=before_sale from public.sales s where id=sale));
 select snapshot into frozen from public.electronic_documents where id=(d->>'documentId')::uuid;
 update public.customers set legal_name='SANDBOX nombre posterior' where id=(f->>'buyer')::uuid;
 r:=pg_temp.cpe_ok('confirm_electronic_document',c,a,sid);
 perform pg_temp.cpe_assert('customer change does not alter frozen snapshot',r=d and (select snapshot=frozen from public.electronic_documents where id=(d->>'documentId')::uuid));
 r:=pg_temp.cpe_capture(format('update public.electronic_documents set total=total+1 where id=%L',d->>'documentId'));
 perform pg_temp.cpe_assert('frozen document immutable even to owner',r->>'message'='CPE_DOCUMENT_IMMUTABLE');
 r:=pg_temp.cpe_capture(format('delete from public.electronic_document_items where document_id=%L',d->>'documentId'));
 perform pg_temp.cpe_assert('frozen lines immutable',r->>'message'='CPE_DOCUMENT_IMMUTABLE');
 r:=pg_temp.cpe_capture(format('update public.electronic_document_commands set operation=''tamper'' where organization_id=%L',org));
 perform pg_temp.cpe_assert('commands immutable',r->>'message'='CPE_IMMUTABLE');
 r:=pg_temp.cpe_capture(format('delete from public.electronic_document_outbox where organization_id=%L',org));
 perform pg_temp.cpe_assert('outbox cannot be consumed or deleted',r->>'message'='CPE_IMMUTABLE');
 delete from public.organization_user_permissions where organization_id=org and user_id=a and permission_code='BILLING_ISSUE';
 before_state:=pg_temp.cpe_state(org); r:=pg_temp.cpe_call('confirm_electronic_document',c,a,sid);
 perform pg_temp.cpe_assert('C08 revoked permission blocks replay',r->>'state'='42501' and pg_temp.cpe_state(org)=before_state);
 insert into public.organization_user_permissions values(org,a,'BILLING_ISSUE',null,now());
 r:=pg_temp.cpe_call('confirm_electronic_document',c,(other_f->>'actor')::uuid,(other_f->>'sid')::uuid);
 perform pg_temp.cpe_assert('foreign tenant cannot replay',r->>'state'='42501');
 r:=pg_temp.cpe_capture(format('select public.get_electronic_document(%L,%L)',org,d->>'documentId'),(other_f->>'actor')::uuid,(other_f->>'sid')::uuid);
 perform pg_temp.cpe_assert('foreign tenant cannot read RPC',r->>'state'='42501');
 r:=pg_temp.cpe_capture('select to_jsonb(count(*)) from public.electronic_documents',(other_f->>'actor')::uuid,(other_f->>'sid')::uuid);
 perform pg_temp.cpe_assert('RLS hides another organization',r->'value'='0'::jsonb);
 r:=pg_temp.cpe_capture(format('update public.electronic_documents set version=version+1 where organization_id=%L',org),a,sid);
 perform pg_temp.cpe_assert('authenticated no direct writes',r->>'state'='42501');
 insert into auth.users(id,email,raw_user_meta_data) values(anon,anon::text||'@example.invalid','{"full_name":"SANDBOX denied"}');
 insert into auth.sessions(id,user_id) values(anon_session,anon);
 insert into public.organization_memberships(organization_id,user_id) values(org,anon);
 r:=pg_temp.cpe_call('confirm_electronic_document',c,anon,anon_session);
 perform pg_temp.cpe_assert('no permission denied',r->>'state'='42501');
 insert into public.organization_user_permissions(organization_id,user_id,permission_code) values(org,anon,'BILLING_VIEW');
 r:=pg_temp.cpe_capture(format('select public.get_electronic_document(%L,%L)',org,d->>'documentId'),anon,anon_session);
 perform pg_temp.cpe_assert('view only can read',r->>'state'='00000');
 r:=pg_temp.cpe_call('confirm_electronic_document',c,anon,anon_session);
 perform pg_temp.cpe_assert('view only cannot issue',r->>'state'='42501');
 r:=pg_temp.cpe_call('prepare_electronic_document',p,anon,anon_session);
 perform pg_temp.cpe_assert('view only cannot prepare',r->>'state'='42501');
 delete from auth.sessions where id=anon_session;
 r:=pg_temp.cpe_capture('select to_jsonb(count(*)) from public.electronic_documents',anon,anon_session);
 perform pg_temp.cpe_assert('revoked session RLS returns no rows',r->'value'='0'::jsonb);
 r:=pg_temp.cpe_call('prepare_electronic_document',p,a,gen_random_uuid());
 perform pg_temp.cpe_assert('invalid session denied',r->>'state'='42501');
 reset role;
 perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
 set local role anon;
 begin perform public.confirm_electronic_document(c); raise exception 'anonymous allowed';
 exception when insufficient_privilege then null; end;
 reset role;
 perform pg_temp.cpe_assert('anonymous execute revoked',not has_function_privilege('anon','public.confirm_electronic_document(jsonb)','EXECUTE'));
 perform pg_temp.cpe_assert('all six tables RLS',(select count(*)=6 and bool_and(relrowsecurity) from pg_class where relnamespace='public'::regnamespace and relname in
  ('electronic_issuer_profiles','electronic_document_series','electronic_documents','electronic_document_items','electronic_document_commands','electronic_document_outbox')));
 perform pg_temp.cpe_assert('no enterprise roles gain billing',(select count(*)=0 from public.role_permissions where permission_code like 'BILLING_%'));

 -- Mixed taxes, tax-exclusive sale, explicit credit, deterministic installment ordering.
 sale:=pg_temp.cpe_sale(f,'[{"quantity":"3.000","price":"1.0000","affectation":"gravado"},{"quantity":"2.000","price":"10.0000","affectation":"exonerado"},{"quantity":"1.000","price":"5.0000","affectation":"inafecto"}]',false);
 p:=pg_temp.cpe_prepare(f,sale)||jsonb_build_object('payment',jsonb_build_object('kind','credito','outstanding','20.00','installments',jsonb_build_array(
  jsonb_build_object('id','Cuota002','amount','10.00','dueDate',current_date+60),jsonb_build_object('id','Cuota001','amount','10.00','dueDate',current_date+30))));
 d:=pg_temp.cpe_ok('prepare_electronic_document',p,a,sid);
 perform pg_temp.cpe_assert('mixed taxes and exclusive calculation',(select subtotal=28 and tax=.54 and total=28.54 and exempt_amount=20 and unaffected_amount=5 from public.electronic_documents where id=(d->>'documentId')::uuid));
 perform pg_temp.cpe_assert('credit snapshot immutable decimal strings',(select payment->>'outstanding'='20.00' and payment->>'paidAtIssue'='8.54' and payment#>>'{installments,0,id}'='Cuota001' from public.electronic_documents where id=(d->>'documentId')::uuid));
 x:=jsonb_set(p,'{payment,installments}',jsonb_build_array(p#>'{payment,installments,1}',p#>'{payment,installments,0}'));
 r:=pg_temp.cpe_ok('prepare_electronic_document',x,a,sid);
 perform pg_temp.cpe_assert('canonical installment order replay',r=d);
 c:=pg_temp.cpe_confirm(f,d); r:=pg_temp.cpe_ok('confirm_electronic_document',c,a,sid);
 perform pg_temp.cpe_assert('second assigned number two',r#>>'{fiscalIdentity,number}'='2');

 sale:=pg_temp.cpe_sale(f); p:=pg_temp.cpe_prepare(f,sale);
 for keytext,x in select * from (values
  ('unknown field',p||'{"currency":"USD"}'),
  ('wrong environment',p||'{"environment":"production"}'),
  ('version precision',p||'{"expectedIssuerVersion":"1.0"}'),
  ('invalid issue date',p||'{"issueDate":"2026-02-30"}'),
  ('credit sum',p||jsonb_build_object('payment',jsonb_build_object('kind','credito','outstanding','2.00','installments',jsonb_build_array(jsonb_build_object('id','Cuota001','amount','1.00','dueDate',current_date+1))))),
  ('credit precision',p||jsonb_build_object('payment',jsonb_build_object('kind','credito','outstanding','2.001','installments','[]'::jsonb))),
  ('credit exponent',p||jsonb_build_object('payment',jsonb_build_object('kind','credito','outstanding','2e0','installments','[]'::jsonb))),
  ('credit numeric JSON',p||jsonb_build_object('payment',jsonb_build_object('kind','credito','outstanding',2,'installments','[]'::jsonb))),
  ('credit nonfinite',p||jsonb_build_object('payment',jsonb_build_object('kind','credito','outstanding','NaN','installments','[]'::jsonb))),
  ('credit due date',p||jsonb_build_object('payment',jsonb_build_object('kind','credito','outstanding','2.00','installments',jsonb_build_array(jsonb_build_object('id','Cuota001','amount','2.00','dueDate',current_date))))),
  ('credit duplicate installment',p||jsonb_build_object('payment',jsonb_build_object('kind','credito','outstanding','2.00','installments',jsonb_build_array(jsonb_build_object('id','Cuota001','amount','1.00','dueDate',current_date+1),jsonb_build_object('id','Cuota001','amount','1.00','dueDate',current_date+2))))),
  ('unknown payment',p||'{"payment":{"kind":"other"}}'),
  ('missing fiscal address',p-'buyerFiscalAddressId'),
  ('foreign address',p||jsonb_build_object('buyerFiscalAddressId',other_f->>'address'))
 ) tests(label,value) loop
  before_state:=pg_temp.cpe_state(org); r:=pg_temp.cpe_call('prepare_electronic_document',x,a,sid);
  perform pg_temp.cpe_assert('reject '||keytext,r->>'state'<>'00000' and before_state=pg_temp.cpe_state(org));
 end loop;
 d:=pg_temp.cpe_ok('prepare_electronic_document',p,a,sid);
 x:=jsonb_build_object('organizationId',org,'environment','sandbox','operationKey',gen_random_uuid(),'documentId',d->>'documentId','expectedVersion',d->>'version','request',p-'operationKey');
 r:=pg_temp.cpe_ok('revise_electronic_document',x,a,sid);
 perform pg_temp.cpe_assert('revise draft version',r->>'version'='2');
 before_state:=pg_temp.cpe_state(org); r:=pg_temp.cpe_call('revise_electronic_document',x||jsonb_build_object('operationKey',gen_random_uuid()),a,sid);
 perform pg_temp.cpe_assert('stale draft revision rejected',r->>'state'='40001' and before_state=pg_temp.cpe_state(org));
 update public.customers set legal_name='SANDBOX cambio antes de confirmar' where id=(f->>'buyer')::uuid;
 r:=pg_temp.cpe_call('confirm_electronic_document',pg_temp.cpe_confirm(f,jsonb_build_object('documentId',d->>'documentId','version','2')),a,sid);
 perform pg_temp.cpe_assert('C09 changed source before freeze rejected',r->>'message'='CPE_SOURCE_CHANGED');

 sale:=pg_temp.cpe_sale(f,'[{"quantity":"0.001","price":"0.0100","affectation":"gravado"}]');
 p:=pg_temp.cpe_prepare(f,sale); r:=pg_temp.cpe_call('prepare_electronic_document',p,a,sid);
 perform pg_temp.cpe_assert('zero rounded sale rejected',r->>'message'='CPE_SALE_UNSUPPORTED');
 sale:=pg_temp.cpe_sale(f,'[{"quantity":"99999999999.999","price":"0.0001","affectation":"gravado"}]');
 r:=pg_temp.cpe_call('prepare_electronic_document',pg_temp.cpe_prepare(f,sale),a,sid);
 perform pg_temp.cpe_assert('ten fiscal decimals cannot reconstruct amount rejected',r->>'message'='CPE_PRECISION_UNSUPPORTED');
 sale:=pg_temp.cpe_sale(f,'[{"quantity":"3.000","price":"1.0000","affectation":"por-definir"}]');
 r:=pg_temp.cpe_call('prepare_electronic_document',pg_temp.cpe_prepare(f,sale),a,sid);
 perform pg_temp.cpe_assert('pending tax rejected',r->>'message'='CPE_SALE_UNSUPPORTED');
 sale:=pg_temp.cpe_sale(f); update public.sales set total=total+.01 where id=sale;
 r:=pg_temp.cpe_call('prepare_electronic_document',pg_temp.cpe_prepare(f,sale),a,sid);
 perform pg_temp.cpe_assert('mismatched totals rejected',r->>'message'='CPE_SALE_TOTALS_MISMATCH');
 sale:=pg_temp.cpe_sale(f); update public.measurement_units set code='XYZ' where id=(f->>'unit')::uuid;
 r:=pg_temp.cpe_call('prepare_electronic_document',pg_temp.cpe_prepare(f,sale),a,sid);
 perform pg_temp.cpe_assert('ambiguous unit rejected',r->>'message'='CPE_LINE_UNSUPPORTED');
 update public.measurement_units set code='NIU' where id=(f->>'unit')::uuid;

 -- Test series configuration cannot regress; exhausted range is transactional.
 x:=jsonb_build_object('organizationId',org,'environment','sandbox','operationKey',gen_random_uuid(),'id',f->>'series','expectedVersion','1',
  'issuerProfileId',f->>'issuer','documentType','01','series','F001','nextNumber','1','enabled',true);
 r:=pg_temp.cpe_call('configure_electronic_series',x,a,sid);
 perform pg_temp.cpe_assert('no counter regression',r->>'message'='CPE_COUNTER_REGRESSION');
 seriesid:=gen_random_uuid(); x:=x||jsonb_build_object('id',seriesid,'series','F999','expectedVersion','0','nextNumber','99999999');
 r:=pg_temp.cpe_ok('configure_electronic_series',x,a,sid);
 sale:=pg_temp.cpe_sale(f); p:=pg_temp.cpe_prepare(f,sale)||jsonb_build_object('seriesId',seriesid);
 d:=pg_temp.cpe_ok('prepare_electronic_document',p,a,sid); r:=pg_temp.cpe_ok('confirm_electronic_document',pg_temp.cpe_confirm(f,d),a,sid);
 perform pg_temp.cpe_assert('C10 last allowed number',r#>>'{fiscalIdentity,number}'='99999999');
 sale:=pg_temp.cpe_sale(f); p:=pg_temp.cpe_prepare(f,sale)||jsonb_build_object('seriesId',seriesid);
 d:=pg_temp.cpe_ok('prepare_electronic_document',p,a,sid); before_state:=pg_temp.cpe_state(org);
 r:=pg_temp.cpe_call('confirm_electronic_document',pg_temp.cpe_confirm(f,d),a,sid);
 perform pg_temp.cpe_assert('C10 exhaustion no partial effects',r->>'message'='CPE_SERIES_EXHAUSTED' and before_state=pg_temp.cpe_state(org));

 -- Boleta identified DNI, no invented receiver. Its commercial credit isn't XML.
 seriesid:=gen_random_uuid(); x:=x||jsonb_build_object('id',seriesid,'series','B001','documentType','03','nextNumber','1','operationKey',gen_random_uuid());
 r:=pg_temp.cpe_ok('configure_electronic_series',x,a,sid);
 f:=f||jsonb_build_object('buyer',gen_random_uuid(),'address',gen_random_uuid());
 insert into public.customers(id,organization_id,document_type,document_number,legal_name)
 values((f->>'buyer')::uuid,org,'DNI','12345678','SANDBOX receptor DNI');
 insert into public.customer_addresses(id,organization_id,customer_id,address_type,address_line,ubigeo_code)
 values((f->>'address')::uuid,org,(f->>'buyer')::uuid,'FISCAL','SANDBOX domicilio DNI','150101');
 sale:=pg_temp.cpe_sale(f); p:=pg_temp.cpe_prepare(f,sale)||jsonb_build_object('seriesId',seriesid);
 d:=pg_temp.cpe_ok('prepare_electronic_document',p,a,sid); r:=pg_temp.cpe_ok('confirm_electronic_document',pg_temp.cpe_confirm(f,d),a,sid);
 perform pg_temp.cpe_assert('identified boleta confirmation',r#>>'{fiscalIdentity,documentType}'='03');
 sale:=pg_temp.cpe_sale(f); r:=pg_temp.cpe_call('prepare_electronic_document',pg_temp.cpe_prepare(f,sale),a,sid);
 perform pg_temp.cpe_assert('factura rejects DNI',r->>'message'='CPE_BUYER_INVALID');
 f:=other_f; org:=(f->>'org')::uuid; a:=(f->>'actor')::uuid; sid:=(f->>'sid')::uuid;
 sale:=pg_temp.cpe_sale(f); p:=pg_temp.cpe_prepare(f,sale); d:=pg_temp.cpe_ok('prepare_electronic_document',p,a,sid);
 before_state:=pg_temp.cpe_state(org);
 perform set_config('cpe.test_failure_org',org::text,true);
 c:=pg_temp.cpe_confirm(f,d); r:=pg_temp.cpe_call('confirm_electronic_document',c,a,sid);
 perform pg_temp.cpe_assert('C07 rollback counter document items command audit job',r->>'message'='CPE_TEST_AFTER_COUNTER' and before_state=pg_temp.cpe_state(org));
 perform set_config('cpe.test_failure_org','',true);
 r:=pg_temp.cpe_ok('confirm_electronic_document',c,a,sid);
 perform pg_temp.cpe_assert('C07 failed allocation number reusable before commit',r#>>'{fiscalIdentity,number}'='1');
 insert into auth.users(id,email,raw_user_meta_data) values(matrix_actor,matrix_actor::text||'@example.invalid','{"full_name":"SANDBOX permission matrix"}');
 insert into auth.sessions(id,user_id) values(matrix_sid,matrix_actor);
 insert into public.organization_memberships(organization_id,user_id) values(org,matrix_actor);
 foreach capability in array array['NONE','BILLING_VIEW','BILLING_PREPARE','BILLING_ISSUE','BILLING_CONFIGURE'] loop
  delete from public.organization_user_permissions where organization_id=org and user_id=matrix_actor;
  if capability<>'NONE' then insert into public.organization_user_permissions(organization_id,user_id,permission_code) values(org,matrix_actor,capability); end if;
  for rpc,needed in select * from (values ('save_electronic_issuer_profile','BILLING_CONFIGURE'),('configure_electronic_series','BILLING_CONFIGURE'),
    ('prepare_electronic_document','BILLING_PREPARE'),('revise_electronic_document','BILLING_PREPARE'),('confirm_electronic_document','BILLING_ISSUE')) capabilities(r,p) loop
   before_state:=pg_temp.cpe_state(org);
   -- Authorized roles reach payload validation; others must fail before it.
   r:=pg_temp.cpe_call(rpc,jsonb_build_object('organizationId',org),matrix_actor,matrix_sid);
   perform pg_temp.cpe_assert('permission matrix '||capability||'/'||rpc,
    case when capability=needed then r->>'state'='22023' else r->>'state'='42501' end and before_state=pg_temp.cpe_state(org));
  end loop;
  r:=pg_temp.cpe_capture(format('select public.get_electronic_document(%L,%L)',org,d->>'documentId'),matrix_actor,matrix_sid);
  perform pg_temp.cpe_assert('permission matrix '||capability||'/get_electronic_document',case when capability='BILLING_VIEW' then r->>'state'='00000' else r->>'state'='42501' end);
 end loop;
 perform pg_temp.cpe_assert('no direct authenticated fiscal DML',(select bool_and(not has_table_privilege('authenticated',c.oid,'INSERT') and not has_table_privilege('authenticated',c.oid,'UPDATE') and not has_table_privilege('authenticated',c.oid,'DELETE'))
  from pg_class c where c.relnamespace='public'::regnamespace and c.relname in('electronic_issuer_profiles','electronic_document_series','electronic_documents','electronic_document_items','electronic_document_commands','electronic_document_outbox')));
 perform pg_temp.cpe_assert('private helpers inaccessible',not has_schema_privilege('authenticated','electronic_private','USAGE') and not has_schema_privilege('anon','electronic_private','USAGE'));
 perform pg_temp.cpe_assert('no external document states',(select bool_and(state in('prepared','frozen')) from public.electronic_documents));
 perform pg_temp.cpe_assert('outbox strictly dormant',(select bool_and(state='blocked' and attempts=0 and action='sandbox_hold') from public.electronic_document_outbox));
end $$;
