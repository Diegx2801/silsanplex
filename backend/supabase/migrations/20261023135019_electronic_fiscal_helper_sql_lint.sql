-- Prospective correction after 20261023061225; preserves fiscal sandbox behavior.
-- date input/formatting and polymorphic JSON builders are STABLE in PostgreSQL.
-- These helpers perform no table reads/writes; no index/check depends on them.
-- CREATE OR REPLACE preserves function identity, owner and existing grants.
begin;

alter function electronic_private.date_value(jsonb) stable;

create or replace function electronic_private.address(p jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare k text; v jsonb:='{}'::jsonb;
begin
 perform electronic_private.keys(p,array['line','district','province','department','ubigeo','country'],array['line','district','province','department','ubigeo','country']);
 for k in select jsonb_object_keys(p) loop
  if jsonb_typeof(p->k)<>'string' or length(btrim(p->>k)) not between 2 and 240 then
   raise exception using errcode='22023',message='CPE_ADDRESS_INVALID'; end if;
  v:=v||jsonb_build_object(k,btrim(p->>k));
 end loop;
 if v->>'country'<>'PE' or v->>'ubigeo' !~ '^[0-9]{6}$' then
  raise exception using errcode='22023',message='CPE_ADDRESS_INVALID'; end if;
 return v;
end $$;

create or replace function electronic_private.payment(p jsonb, issue date, total numeric) returns jsonb
language plpgsql stable set search_path='' as $$
declare part jsonb; amount numeric; outstanding numeric; amounts numeric:=0; parts jsonb:='[]'::jsonb; seen text[]:='{}'::text[];
begin
 if p->>'kind'='contado' then
  perform electronic_private.keys(p,array['kind'],array['kind']); return p;
 end if;
 perform electronic_private.keys(p,array['kind','outstanding','installments'],array['kind','outstanding','installments']);
 if p->>'kind'<>'credito' or jsonb_typeof(p->'installments')<>'array' or jsonb_array_length(p->'installments') not between 1 and 999 then
  raise exception using errcode='22023',message='CPE_PAYMENT_INVALID'; end if;
 outstanding:=electronic_private.money(p->'outstanding');
 for part in select value from jsonb_array_elements(p->'installments') order by value->>'id' loop
  perform electronic_private.keys(part,array['id','amount','dueDate'],array['id','amount','dueDate']);
  amount:=electronic_private.money(part->'amount');
  if part->>'id' !~ '^Cuota[0-9]{3}$' or part->>'id'='Cuota000' or (part->>'id')=any(seen)
    or amount<=0 or electronic_private.date_value(part->'dueDate')<=issue then
   raise exception using errcode='22023',message='CPE_PAYMENT_INVALID'; end if;
  seen:=array_append(seen,part->>'id'); amounts:=amounts+amount; parts:=parts||jsonb_build_array(part);
 end loop;
 if outstanding<=0 or outstanding>total or amounts<>outstanding then
  raise exception using errcode='22023',message='CPE_PAYMENT_INVALID'; end if;
 return jsonb_build_object('kind','credito','outstanding',outstanding::numeric(14,2)::text,
  'installments',parts,'paidAtIssue',(total-outstanding)::numeric(14,2)::text);
end $$;

create or replace function electronic_private.request(p jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare v jsonb; pay jsonb; part jsonb; parts jsonb:='[]'::jsonb;
begin
 perform electronic_private.keys(p,array['schemaVersion','organizationId','environment','operationKey','saleId','issuerProfileId','expectedIssuerVersion','seriesId','expectedSeriesVersion','issueDate','buyerFiscalAddressId','payment'],
 array['schemaVersion','organizationId','environment','saleId','issuerProfileId','expectedIssuerVersion','seriesId','expectedSeriesVersion','issueDate','payment']);
 if p->>'schemaVersion'<>'CPE-PE-DOM-PEN-1' or p->>'environment'<>'sandbox' then raise exception using errcode='22023',message='CPE_PROFILE_UNSUPPORTED'; end if;
 if electronic_private.version(p->'expectedIssuerVersion')<1 or electronic_private.version(p->'expectedSeriesVersion')<1 then
  raise exception using errcode='22023',message='CPE_VERSION_INVALID'; end if;
 pay:=p->'payment';
 if pay->>'kind'='contado' then perform electronic_private.keys(pay,array['kind'],array['kind']);
 else
  perform electronic_private.keys(pay,array['kind','outstanding','installments'],array['kind','outstanding','installments']);
  if pay->>'kind'<>'credito' or jsonb_typeof(pay->'installments')<>'array' then raise exception using errcode='22023',message='CPE_PAYMENT_INVALID'; end if;
  perform electronic_private.money(pay->'outstanding');
  for part in select value from jsonb_array_elements(pay->'installments') order by value->>'id' loop
   perform electronic_private.keys(part,array['id','amount','dueDate'],array['id','amount','dueDate']);
   perform electronic_private.money(part->'amount'); perform electronic_private.date_value(part->'dueDate');
   parts:=parts||jsonb_build_array(part);
  end loop;
  pay:=pay||jsonb_build_object('installments',parts);
 end if;
 v:=(p-'operationKey')||jsonb_build_object('organizationId',(p->>'organizationId')::uuid,
  'saleId',(p->>'saleId')::uuid,'issuerProfileId',(p->>'issuerProfileId')::uuid,'seriesId',(p->>'seriesId')::uuid,
  'buyerFiscalAddressId',(p->>'buyerFiscalAddressId')::uuid,'issueDate',electronic_private.date_value(p->'issueDate'),'payment',pay);
 return v;
end $$;

create or replace function electronic_private.snapshot(p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare org uuid:=(p->>'organizationId')::uuid; s public.sales%rowtype;
 ser public.electronic_document_series%rowtype; issuer public.electronic_issuer_profiles%rowtype;
 buyer public.customers%rowtype; address public.customer_addresses%rowtype;
 line record; items jsonb:='[]'::jsonb; base numeric; tax numeric; amount numeric; net numeric; gross numeric;
 taxable numeric:=0; exempt numeric:=0; unaffected numeric:=0; taxes numeric:=0; subtotal numeric; total numeric;
 buyer_type text; pay jsonb; ordinal integer:=0;
begin
 select * into s from public.sales where organization_id=org and id=(p->>'saleId')::uuid;
 if not found or s.tax_calculation_status<>'calculated' or s.total<=0 then raise exception using errcode='22023',message='CPE_SALE_UNSUPPORTED'; end if;
 select * into ser from public.electronic_document_series where organization_id=org and id=(p->>'seriesId')::uuid;
 if not found or not ser.enabled or ser.issuer_profile_id<>(p->>'issuerProfileId')::uuid then raise exception using errcode='22023',message='CPE_SERIES_INVALID'; end if;
 select * into issuer from public.electronic_issuer_profiles where organization_id=org and id=ser.issuer_profile_id for share;
 if issuer.version<>electronic_private.version(p->'expectedIssuerVersion') or ser.version<>electronic_private.version(p->'expectedSeriesVersion') then
  raise exception using errcode='40001',message='CPE_CONFIGURATION_CHANGED'; end if;
 select * into buyer from public.customers where organization_id=org and id=s.customer_id for share;
 if not found or not buyer.is_active or length(btrim(buyer.legal_name)) not between 3 and 1500 then raise exception using errcode='22023',message='CPE_BUYER_INVALID'; end if;
 buyer_type:=case buyer.document_type when 'RUC' then '6' when 'DNI' then '1' when 'CE' then '4' end;
 if buyer_type is null or (ser.document_type='01' and buyer_type<>'6')
   or (buyer_type='6' and not electronic_private.valid_ruc(buyer.document_number))
   or (buyer_type='1' and buyer.document_number !~ '^[0-9]{8}$')
   or (buyer_type='4' and buyer.document_number !~ '^[A-Z0-9]{1,12}$') then raise exception using errcode='22023',message='CPE_BUYER_INVALID'; end if;
 if p->>'buyerFiscalAddressId' is not null then
  select * into address from public.customer_addresses where organization_id=org and customer_id=buyer.id and id=(p->>'buyerFiscalAddressId')::uuid and address_type='FISCAL' and is_active for share;
  if not found or address.ubigeo_code is null then raise exception using errcode='22023',message='CPE_BUYER_ADDRESS_INVALID'; end if;
 elsif ser.document_type='01' then raise exception using errcode='22023',message='CPE_BUYER_ADDRESS_REQUIRED'; end if;
 -- Lock source rows before reading any calculated snapshot line.
 perform 1 from public.sale_items where organization_id=org and sale_id=s.id order by id for share;
 perform 1 from public.products product where product.organization_id=org and product.id in
  (select product_id from public.sale_items where organization_id=org and sale_id=s.id) order by product.id for share;
 perform 1 from public.measurement_units unit where unit.organization_id=org and unit.id in
  (select product.base_unit_id from public.products product join public.sale_items si on si.product_id=product.id and si.organization_id=product.organization_id where si.organization_id=org and si.sale_id=s.id) order by unit.id for share;
 for line in select si.*,unit.code fiscal_unit,unit.name fiscal_unit_name,unit.is_active unit_active
  from public.sale_items si join public.products product on product.organization_id=si.organization_id and product.id=si.product_id
  left join public.measurement_units unit on unit.organization_id=product.organization_id and unit.id=product.base_unit_id
  where si.organization_id=org and si.sale_id=s.id order by si.id loop
  if line.tax_affectation not in('gravado','exonerado','inafecto') or line.tax_affectation is null
     or line.fiscal_unit is null or not line.unit_active or line.fiscal_unit not in('NIU','ZZ','KGM','LTR','MTR')
     or line.unit_of_measure is null or line.unit_of_measure not in(line.fiscal_unit,line.fiscal_unit_name)
     or line.unit_price<=0 or line.quantity<=0 then raise exception using errcode='22023',message='CPE_LINE_UNSUPPORTED'; end if;
  amount:=round(line.quantity*line.unit_price,2);
  base:=case when line.tax_affectation='gravado' and s.prices_include_tax then round(amount/1.18,2) else amount end;
  tax:=case when line.tax_affectation<>'gravado' then 0 when s.prices_include_tax then amount-base else round(base*.18,2) end;
  net:=round(base/line.quantity,10); gross:=round((base+tax)/line.quantity,10);
  if base<=0 or base+tax>=1000000000000 or net<=0 or gross<=0 or net>=1000000000000 or gross>=1000000000000
     or round(net*line.quantity,2)<>base or round(gross*line.quantity,2)<>base+tax then
   raise exception using errcode='22023',message='CPE_PRECISION_UNSUPPORTED'; end if;
  ordinal:=ordinal+1;
  items:=items||jsonb_build_array(jsonb_build_object('saleItemId',line.id,'productId',line.product_id,'code',btrim(line.product_code),
    'description',btrim(line.product_description),'unit',line.fiscal_unit,'quantity',line.quantity::numeric(14,3)::text,
    'commercialPrice',line.unit_price::numeric(16,4)::text,'unitNet',net::numeric(22,10)::text,'unitGross',gross::numeric(22,10)::text,
    'affectation',case line.tax_affectation when 'gravado' then '10' when 'exonerado' then '20' else '30' end,
    'taxCode',case line.tax_affectation when 'gravado' then '1000' when 'exonerado' then '9997' else '9998' end,
    'rate',case line.tax_affectation when 'gravado' then '18.00000' else '0.00000' end,
    'base',base::numeric(14,2)::text,'tax',tax::numeric(14,2)::text,'total',(base+tax)::numeric(14,2)::text));
  if line.tax_affectation='gravado' then taxable:=taxable+base;
  elsif line.tax_affectation='exonerado' then exempt:=exempt+base; else unaffected:=unaffected+base; end if;
  taxes:=taxes+tax;
 end loop;
 subtotal:=taxable+exempt+unaffected; total:=subtotal+taxes;
 if ordinal=0 or total>=1000000000000 or row(taxable,exempt,unaffected,subtotal,taxes,total) is distinct from
   row(s.taxable_base,s.exempt_amount,s.unaffected_amount,s.subtotal,s.tax,s.total) then raise exception using errcode='22023',message='CPE_SALE_TOTALS_MISMATCH'; end if;
 pay:=electronic_private.payment(p->'payment',(p->>'issueDate')::date,total);
 return jsonb_build_object('schemaVersion','CPE-PE-DOM-PEN-1','ruleSetHash',issuer.rule_set_hash,'modality','local_test',
  'organizationId',org,'environment','sandbox','saleId',s.id,'orderId',s.order_id,'saleDate',s.sale_date,
  'issuer',jsonb_build_object('id',issuer.id,'version',issuer.version::text,'ruc',issuer.ruc,'legalName',issuer.legal_name,
    'address',issuer.fiscal_address,'establishmentCode',issuer.establishment_code),
  'buyer',jsonb_build_object('customerId',buyer.id,'type',buyer_type,'number',buyer.document_number,'name',btrim(buyer.legal_name),
    'address',case when address.id is null then null else jsonb_build_object('id',address.id,'line',btrim(address.address_line),'ubigeo',address.ubigeo_code,'country','PE') end),
  'currency','PEN','operationType','0101','issueDate',p->>'issueDate','documentType',ser.document_type,'series',ser.series,
  'pricesIncludeTax',s.prices_include_tax,'items',items,'payment',pay,
  'totals',jsonb_build_object('taxableBase',taxable::numeric(14,2)::text,'exemptAmount',exempt::numeric(14,2)::text,
   'unaffectedAmount',unaffected::numeric(14,2)::text,'subtotal',subtotal::numeric(14,2)::text,'tax',taxes::numeric(14,2)::text,'total',total::numeric(14,2)::text));
end $$;

commit;
