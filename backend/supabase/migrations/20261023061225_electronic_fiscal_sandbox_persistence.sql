-- CPE-PE-DOM-PEN-1: internal fictitious sandbox persistence only.
-- No XML, certificates, transport, workers, cron, or productive issuance.
create schema electronic_private;
revoke all on schema electronic_private from public, anon, authenticated, service_role;

insert into public.permissions(code,name,description) values
 ('BILLING_VIEW','Consultar comprobantes fiscales','Consulta fiscal de su organización'),
 ('BILLING_PREPARE','Preparar comprobantes fiscales','Preparación y revisión sandbox'),
 ('BILLING_ISSUE','Confirmar comprobantes fiscales','Confirmación interna sandbox, sin validez tributaria'),
 ('BILLING_CONFIGURE','Configurar facturación','Perfiles y series ficticios sandbox');
-- Deliberately no role_permissions or implicit SALES_MANAGE inheritance.

create table public.electronic_issuer_profiles (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 environment text not null default 'sandbox' check(environment='sandbox'),
 ruc text not null check(ruc ~ '^(10|20)[0-9]{9}$'),
 legal_name text not null check(legal_name like 'SANDBOX %' and length(legal_name) between 11 and 1500),
 fiscal_address jsonb not null check(jsonb_typeof(fiscal_address)='object'),
 establishment_code text not null check(establishment_code ~ '^[0-9]{4}$'),
 rule_set_hash text not null check(rule_set_hash='cb5e871cfe3b81abea7faf25b156e5d35b21e8c4837979350919926612da73b6'),
 modality text not null default 'local_test' check(modality='local_test'),
 production_enabled boolean not null default false check(not production_enabled),
 version bigint not null default 1 check(version>0),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,environment,ruc)
);
create table public.electronic_document_series (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 issuer_profile_id uuid not null, environment text not null check(environment='sandbox'),
 issuer_ruc text not null, document_type text not null check(document_type in('01','03')),
 series text not null,
 next_number bigint not null default 1 check(next_number between 1 and 100000000),
 version bigint not null default 1 check(version>0), enabled boolean not null default true,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 foreign key(organization_id,issuer_profile_id) references public.electronic_issuer_profiles(organization_id,id),
 unique(organization_id,id), unique(organization_id,id,issuer_profile_id,environment,document_type,series),
 unique(environment,issuer_ruc,document_type,series),
 check((document_type='01' and series ~ '^F[A-Z0-9]{3}$') or (document_type='03' and series ~ '^B[A-Z0-9]{3}$'))
);
create table public.electronic_documents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 issuer_profile_id uuid not null, sale_id uuid not null, series_id uuid not null,
 environment text not null check(environment='sandbox'), document_type text not null,
 series text not null, issuer_ruc_snapshot text not null,
 number bigint check(number between 1 and 99999999),
 state text not null check(state in('prepared','frozen')),
 version bigint not null default 1 check(version>0),
 request jsonb not null, snapshot jsonb not null,
 snapshot_hash text not null check(snapshot_hash ~ '^[a-f0-9]{64}$'),
 currency text not null check(currency='PEN'), issue_date date not null,
 taxable_base numeric(14,2) not null check(taxable_base>=0),
 exempt_amount numeric(14,2) not null check(exempt_amount>=0),
 unaffected_amount numeric(14,2) not null check(unaffected_amount>=0),
 subtotal numeric(14,2) not null check(subtotal>0), tax numeric(14,2) not null check(tax>=0),
 total numeric(14,2) not null check(total>0), payment jsonb not null,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 confirmed_by uuid references public.profiles(id), confirmed_at timestamptz,
 unique(organization_id,id), unique(organization_id,id,sale_id),
 unique(organization_id,environment,sale_id),
 unique(environment,issuer_ruc_snapshot,document_type,series,number),
 foreign key(organization_id,sale_id) references public.sales(organization_id,id),
 foreign key(organization_id,series_id,issuer_profile_id,environment,document_type,series)
  references public.electronic_document_series(organization_id,id,issuer_profile_id,environment,document_type,series),
 check(subtotal=taxable_base+exempt_amount+unaffected_amount and total=subtotal+tax),
 check((state='prepared' and number is null and confirmed_at is null and confirmed_by is null)
    or (state='frozen' and number is not null and confirmed_at is not null and confirmed_by is not null))
);
create table public.electronic_document_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 document_id uuid not null, sale_id uuid not null, sale_item_id uuid not null,
 ordinal integer not null check(ordinal>0), quantity numeric(14,3) not null check(quantity>0),
 commercial_price numeric(16,4) not null check(commercial_price>0),
 unit_net numeric(22,10) not null check(unit_net>0), unit_gross numeric(22,10) not null check(unit_gross>0),
 base numeric(14,2) not null check(base>0), tax numeric(14,2) not null check(tax>=0),
 total numeric(14,2) not null check(total=base+tax),
 tax_code text not null, affectation text not null, rate numeric(8,5) not null,
 snapshot jsonb not null,
 foreign key(organization_id,document_id,sale_id) references public.electronic_documents(organization_id,id,sale_id),
 foreign key(organization_id,sale_id,sale_item_id) references public.sale_items(organization_id,sale_id,id),
 unique(document_id,sale_item_id), unique(document_id,ordinal),
 check((tax_code='1000' and affectation='10' and rate=18) or
       (tax_code='9997' and affectation='20' and rate=0 and tax=0) or
       (tax_code='9998' and affectation='30' and rate=0 and tax=0)),
 check(round(unit_net*quantity,2)=base and round(unit_gross*quantity,2)=total)
);
create table public.electronic_document_commands (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 environment text not null check(environment='sandbox'), operation text not null,
 operation_key uuid not null, canonical_payload jsonb not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 result_document_id uuid, result jsonb not null,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 unique(organization_id,environment,operation_key),
 foreign key(organization_id,result_document_id) references public.electronic_documents(organization_id,id)
);
create table public.electronic_document_outbox (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, document_id uuid not null,
 action text not null default 'sandbox_hold' check(action='sandbox_hold'),
 state text not null default 'blocked' check(state='blocked'),
 attempts integer not null default 0 check(attempts=0),
 created_at timestamptz not null default now(),
 foreign key(organization_id,document_id) references public.electronic_documents(organization_id,id),
 unique(document_id,action)
);
comment on table public.electronic_documents is 'Confirmación interna de prueba local SIN validez tributaria; no enviado a SUNAT.';
comment on table public.electronic_document_outbox is 'Trabajo durable bloqueado: no existe consumidor ni transporte en esta fase.';

create function electronic_private.assert_access(org uuid, permission text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
 if actor is null or sid is null or not public.is_auth_session_active(sid,actor)
    or not public.has_organization_permission(org,permission) then
  raise exception using errcode='42501',message='CPE_FORBIDDEN';
 end if;
 return actor;
end $$;
create function electronic_private.keys(p jsonb, allowed text[], required text[]) returns void
language plpgsql immutable set search_path='' as $$
begin
 if p is null or jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) k where not(k=any(allowed)))
    or exists(select 1 from unnest(required) k where not(p?k) or p->k='null'::jsonb) then
  raise exception using errcode='22023',message='CPE_PAYLOAD_INVALID';
 end if;
end $$;
create function electronic_private.hash(p jsonb) returns text
language sql immutable set search_path='' as $$select encode(extensions.digest(p::text,'sha256'),'hex')$$;
create function electronic_private.version(p jsonb) returns bigint
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p)<>'string' or p#>>'{}' !~ '^(0|[1-9][0-9]{0,17})$' then
  raise exception using errcode='22023',message='CPE_VERSION_INVALID'; end if;
 return (p#>>'{}')::bigint;
end $$;
create function electronic_private.date_value(p jsonb) returns date
language plpgsql immutable set search_path='' as $$
declare d date;
begin
 if jsonb_typeof(p)<>'string' or p#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
  raise exception using errcode='22023',message='CPE_DATE_INVALID'; end if;
 d:=(p#>>'{}')::date;
 if to_char(d,'YYYY-MM-DD')<>p#>>'{}' then raise exception using errcode='22023',message='CPE_DATE_INVALID'; end if;
 return d;
end $$;
create function electronic_private.money(p jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p)<>'string' or p#>>'{}' !~ '^(0|[1-9][0-9]{0,11})\.[0-9]{2}$' then
  raise exception using errcode='22023',message='CPE_MONEY_INVALID'; end if;
 return (p#>>'{}')::numeric;
end $$;
create function electronic_private.valid_ruc(r text) returns boolean
language sql immutable set search_path='' as $$
 select r ~ '^(10|20)[0-9]{9}$' and right(r,1)::integer =
  (11-(select sum(substr(r,i::integer,1)::integer*w) % 11 from unnest(array[5,4,3,2,7,6,5,4,3,2]) with ordinality a(w,i))) % 10
$$;
create function electronic_private.address(p jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb:='{}';
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
create function electronic_private.payment(p jsonb, issue date, total numeric) returns jsonb
language plpgsql immutable set search_path='' as $$
declare part jsonb; amount numeric; outstanding numeric; amounts numeric:=0; parts jsonb:='[]'; seen text[]:='{}';
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

-- Authorization always precedes this helper. A key is scoped to org/sandbox,
-- including operation in the compared command, so cross-operation reuse conflicts.
create function electronic_private.replay(org uuid, key uuid, op text, p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare c public.electronic_document_commands%rowtype;
begin
 if key is null then raise exception using errcode='22023',message='CPE_OPERATION_KEY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||':cpe:sandbox:'||key::text,0));
 select * into c from public.electronic_document_commands where organization_id=org and environment='sandbox' and operation_key=key;
 if found then
  if c.operation<>op or c.canonical_payload<>p then
   raise exception using errcode='P0001',message='CPE_OPERATION_KEY_REUSED'; end if;
  return c.result;
 end if;
 return null;
end $$;
create function electronic_private.complete(org uuid,key uuid,op text,p jsonb,result jsonb,actor uuid,doc uuid default null) returns jsonb
language plpgsql set search_path='' as $$
begin
 insert into public.electronic_document_commands(organization_id,environment,operation,operation_key,canonical_payload,payload_hash,result_document_id,result,created_by)
 values(org,'sandbox',op,key,p,electronic_private.hash(p),doc,result,actor);
 insert into public.audit_events(organization_id,actor_user_id,action,entity_type,entity_id,new_values)
 values(org,actor,'CPE_'||upper(op),'ELECTRONIC_DOCUMENT',coalesce(doc::text,result->>'id'),result);
 return result;
end $$;

create function public.save_electronic_issuer_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=(payload->>'organizationId')::uuid; actor uuid; key uuid; id_value uuid; expected bigint;
 p jsonb; result jsonb; current_row public.electronic_issuer_profiles%rowtype;
begin
 actor:=electronic_private.assert_access(org,'BILLING_CONFIGURE');
 perform electronic_private.keys(payload,array['organizationId','environment','operationKey','id','expectedVersion','ruc','legalName','fiscalAddress','establishmentCode','ruleSetHash','testOnly'],
 array['organizationId','environment','operationKey','id','expectedVersion','ruc','legalName','fiscalAddress','establishmentCode','ruleSetHash','testOnly']);
 if payload->>'environment'<>'sandbox' or payload->'testOnly'<>'true'::jsonb then raise exception using errcode='22023',message='CPE_SANDBOX_ONLY'; end if;
 key:=(payload->>'operationKey')::uuid; id_value:=(payload->>'id')::uuid; expected:=electronic_private.version(payload->'expectedVersion');
 if not electronic_private.valid_ruc(payload->>'ruc') then raise exception using errcode='22023',message='CPE_RUC_INVALID'; end if;
 p:=(payload-'operationKey')||jsonb_build_object('organizationId',org,'id',id_value,'legalName',btrim(payload->>'legalName'),'fiscalAddress',electronic_private.address(payload->'fiscalAddress'));
 result:=electronic_private.replay(org,key,'configure_issuer',p); if result is not null then return result; end if;
 select * into current_row from public.electronic_issuer_profiles where organization_id=org and id=id_value for update;
 if found then
  if current_row.version<>expected then raise exception using errcode='40001',message='CPE_STALE_WRITE'; end if;
  if current_row.ruc<>p->>'ruc' then raise exception using errcode='22023',message='CPE_ISSUER_IDENTITY_IMMUTABLE'; end if;
  update public.electronic_issuer_profiles set legal_name=p->>'legalName',fiscal_address=p->'fiscalAddress',
   establishment_code=p->>'establishmentCode',rule_set_hash=p->>'ruleSetHash',version=version+1 where id=id_value;
 else
  if expected<>0 then raise exception using errcode='40001',message='CPE_STALE_WRITE'; end if;
  insert into public.electronic_issuer_profiles(id,organization_id,ruc,legal_name,fiscal_address,establishment_code,rule_set_hash,created_by)
  values(id_value,org,p->>'ruc',p->>'legalName',p->'fiscalAddress',p->>'establishmentCode',p->>'ruleSetHash',actor);
 end if;
 return electronic_private.complete(org,key,'configure_issuer',p,jsonb_build_object('id',id_value,'version',(expected+1)::text),actor);
end $$;

create function public.configure_electronic_series(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=(payload->>'organizationId')::uuid; actor uuid; key uuid; id_value uuid; issuer uuid; expected bigint; n bigint;
 p jsonb; result jsonb; ruc_value text; current_row public.electronic_document_series%rowtype;
begin
 actor:=electronic_private.assert_access(org,'BILLING_CONFIGURE');
 perform electronic_private.keys(payload,array['organizationId','environment','operationKey','id','expectedVersion','issuerProfileId','documentType','series','nextNumber','enabled'],
 array['organizationId','environment','operationKey','id','expectedVersion','issuerProfileId','documentType','series','nextNumber','enabled']);
 if payload->>'environment'<>'sandbox' then raise exception using errcode='22023',message='CPE_SANDBOX_ONLY'; end if;
 expected:=electronic_private.version(payload->'expectedVersion'); n:=electronic_private.version(payload->'nextNumber');
 if jsonb_typeof(payload->'enabled')<>'boolean' then raise exception using errcode='22023',message='CPE_PAYLOAD_INVALID'; end if;
 key:=(payload->>'operationKey')::uuid; id_value:=(payload->>'id')::uuid; issuer:=(payload->>'issuerProfileId')::uuid;
 p:=(payload-'operationKey')||jsonb_build_object('organizationId',org,'id',id_value,'issuerProfileId',issuer);
 result:=electronic_private.replay(org,key,'configure_series',p); if result is not null then return result; end if;
 select * into current_row from public.electronic_document_series where organization_id=org and id=id_value for update;
 -- Series precedes issuer in every path; allocation changes next_number, NOT configuration version.
 select ruc into ruc_value from public.electronic_issuer_profiles where organization_id=org and id=issuer for share;
 if not found then raise exception using errcode='P0001',message='CPE_ISSUER_NOT_FOUND'; end if;
 if current_row.id is not null then
  if current_row.version<>expected then raise exception using errcode='40001',message='CPE_STALE_WRITE'; end if;
  if current_row.issuer_profile_id<>issuer or current_row.series<>payload->>'series' or current_row.document_type<>payload->>'documentType' then
   raise exception using errcode='22023',message='CPE_SERIES_IDENTITY_IMMUTABLE'; end if;
  if n<current_row.next_number then raise exception using errcode='22023',message='CPE_COUNTER_REGRESSION'; end if;
  update public.electronic_document_series set next_number=n,enabled=(payload->>'enabled')::boolean,version=version+1 where id=id_value;
 else
  if expected<>0 then raise exception using errcode='40001',message='CPE_STALE_WRITE'; end if;
  insert into public.electronic_document_series(id,organization_id,issuer_profile_id,environment,issuer_ruc,document_type,series,next_number,enabled,created_by)
  values(id_value,org,issuer,'sandbox',ruc_value,payload->>'documentType',payload->>'series',n,(payload->>'enabled')::boolean,actor);
 end if;
 return electronic_private.complete(org,key,'configure_series',p,jsonb_build_object('id',id_value,'version',(expected+1)::text),actor);
end $$;

-- Normalize only the explicitly supported request. Optional absent/null address
-- is equivalent; reference lists are intentionally rejected until specified.
create function electronic_private.request(p jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v jsonb; pay jsonb; part jsonb; parts jsonb:='[]';
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

-- Caller already holds sale, document (if any), and series, in that order.
-- Referenced masters are SHARE locked through commit. The sale lock also
-- conflicts with new child FK inserts; existing lines are explicitly locked.
create function electronic_private.snapshot(p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare org uuid:=(p->>'organizationId')::uuid; s public.sales%rowtype;
 ser public.electronic_document_series%rowtype; issuer public.electronic_issuer_profiles%rowtype;
 buyer public.customers%rowtype; address public.customer_addresses%rowtype;
 line record; items jsonb:='[]'; base numeric; tax numeric; amount numeric; net numeric; gross numeric;
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

create function electronic_private.write_items(org uuid, doc uuid, sale uuid, snap jsonb) returns void
language plpgsql set search_path='' as $$
declare line jsonb; n integer:=0;
begin
 delete from public.electronic_document_items where organization_id=org and document_id=doc;
 for line in select value from jsonb_array_elements(snap->'items') loop
  n:=n+1;
  insert into public.electronic_document_items(organization_id,document_id,sale_id,sale_item_id,ordinal,quantity,commercial_price,unit_net,unit_gross,base,tax,total,tax_code,affectation,rate,snapshot)
  values(org,doc,sale,(line->>'saleItemId')::uuid,n,(line->>'quantity')::numeric,(line->>'commercialPrice')::numeric,
   (line->>'unitNet')::numeric,(line->>'unitGross')::numeric,(line->>'base')::numeric,(line->>'tax')::numeric,(line->>'total')::numeric,
   line->>'taxCode',line->>'affectation',(line->>'rate')::numeric,line);
 end loop;
end $$;
create function electronic_private.document_result(doc public.electronic_documents) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('documentId',doc.id,'state',doc.state,'snapshotHash',doc.snapshot_hash,'version',doc.version::text,
  'fiscalIdentity',case when doc.number is null then null else jsonb_build_object('environment',doc.environment,'ruc',doc.issuer_ruc_snapshot,
   'documentType',doc.document_type,'series',doc.series,'number',doc.number::text) end)
$$;

create function public.prepare_electronic_document(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=(payload->>'organizationId')::uuid; actor uuid; key uuid; p jsonb; snap jsonb; result jsonb; doc public.electronic_documents%rowtype;
begin
 actor:=electronic_private.assert_access(org,'BILLING_PREPARE'); key:=(payload->>'operationKey')::uuid;
 p:=electronic_private.request(payload); result:=electronic_private.replay(org,key,'prepare',p); if result is not null then return result; end if;
 perform 1 from public.sales where organization_id=org and id=(p->>'saleId')::uuid for update;
 if not found then raise exception using errcode='P0001',message='CPE_SALE_NOT_FOUND'; end if;
 if exists(select 1 from public.electronic_documents where organization_id=org and sale_id=(p->>'saleId')::uuid and environment='sandbox') then
  raise exception using errcode='P0001',message='CPE_ORIGINAL_EXISTS'; end if;
 perform 1 from public.electronic_document_series where organization_id=org and id=(p->>'seriesId')::uuid for share;
 snap:=electronic_private.snapshot(p);
 insert into public.electronic_documents(organization_id,issuer_profile_id,sale_id,series_id,environment,document_type,series,issuer_ruc_snapshot,
  state,request,snapshot,snapshot_hash,currency,issue_date,taxable_base,exempt_amount,unaffected_amount,subtotal,tax,total,payment,created_by)
 values(org,(p->>'issuerProfileId')::uuid,(p->>'saleId')::uuid,(p->>'seriesId')::uuid,'sandbox',snap->>'documentType',snap->>'series',snap#>>'{issuer,ruc}',
  'prepared',p,snap,electronic_private.hash(snap),'PEN',(p->>'issueDate')::date,(snap#>>'{totals,taxableBase}')::numeric,
  (snap#>>'{totals,exemptAmount}')::numeric,(snap#>>'{totals,unaffectedAmount}')::numeric,(snap#>>'{totals,subtotal}')::numeric,
  (snap#>>'{totals,tax}')::numeric,(snap#>>'{totals,total}')::numeric,snap->'payment',actor) returning * into doc;
 perform electronic_private.write_items(org,doc.id,doc.sale_id,snap);
 return electronic_private.complete(org,key,'prepare',p,electronic_private.document_result(doc),actor,doc.id);
end $$;

create function public.revise_electronic_document(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=(payload->>'organizationId')::uuid; actor uuid; key uuid; id_value uuid; sale uuid; expected bigint;
 p jsonb; command jsonb; snap jsonb; result jsonb; doc public.electronic_documents%rowtype;
begin
 actor:=electronic_private.assert_access(org,'BILLING_PREPARE');
 perform electronic_private.keys(payload,array['organizationId','environment','operationKey','documentId','expectedVersion','request'],array['organizationId','environment','operationKey','documentId','expectedVersion','request']);
 if payload->>'environment'<>'sandbox' then raise exception using errcode='22023',message='CPE_SANDBOX_ONLY'; end if;
 key:=(payload->>'operationKey')::uuid; id_value:=(payload->>'documentId')::uuid; expected:=electronic_private.version(payload->'expectedVersion');
 p:=electronic_private.request(payload->'request');
 command:=(payload-'operationKey')||jsonb_build_object('organizationId',org,'documentId',id_value,'request',p);
 result:=electronic_private.replay(org,key,'revise',command); if result is not null then return result; end if;
 select sale_id into sale from public.electronic_documents where organization_id=org and id=id_value;
 perform 1 from public.sales where organization_id=org and id=sale for update;
 select * into doc from public.electronic_documents where organization_id=org and id=id_value for update;
 if not found then raise exception using errcode='P0001',message='CPE_DOCUMENT_NOT_FOUND'; end if;
 if doc.state<>'prepared' then raise exception using errcode='P0001',message='CPE_DOCUMENT_IMMUTABLE'; end if;
 if doc.version<>expected then raise exception using errcode='40001',message='CPE_STALE_WRITE'; end if;
 if org<>(p->>'organizationId')::uuid or doc.sale_id<>(p->>'saleId')::uuid or doc.series_id<>(p->>'seriesId')::uuid or doc.issuer_profile_id<>(p->>'issuerProfileId')::uuid then
  raise exception using errcode='22023',message='CPE_DOCUMENT_IDENTITY_IMMUTABLE'; end if;
 perform 1 from public.electronic_document_series where organization_id=org and id=doc.series_id for share;
 snap:=electronic_private.snapshot(p);
 update public.electronic_documents set request=p,snapshot=snap,snapshot_hash=electronic_private.hash(snap),version=version+1,issue_date=(p->>'issueDate')::date,
  taxable_base=(snap#>>'{totals,taxableBase}')::numeric,exempt_amount=(snap#>>'{totals,exemptAmount}')::numeric,
  unaffected_amount=(snap#>>'{totals,unaffectedAmount}')::numeric,subtotal=(snap#>>'{totals,subtotal}')::numeric,
  tax=(snap#>>'{totals,tax}')::numeric,total=(snap#>>'{totals,total}')::numeric,payment=snap->'payment' where id=doc.id returning * into doc;
 perform electronic_private.write_items(org,doc.id,doc.sale_id,snap);
 return electronic_private.complete(org,key,'revise',command,electronic_private.document_result(doc),actor,doc.id);
end $$;

create function public.confirm_electronic_document(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=(payload->>'organizationId')::uuid; actor uuid; key uuid; id_value uuid; sale uuid; expected bigint;
 p jsonb; snap jsonb; result jsonb; assigned bigint; doc public.electronic_documents%rowtype;
begin
 actor:=electronic_private.assert_access(org,'BILLING_ISSUE');
 perform electronic_private.keys(payload,array['organizationId','environment','operationKey','documentId','expectedVersion'],array['organizationId','environment','operationKey','documentId','expectedVersion']);
 if payload->>'environment'<>'sandbox' then raise exception using errcode='22023',message='CPE_SANDBOX_ONLY'; end if;
 key:=(payload->>'operationKey')::uuid; id_value:=(payload->>'documentId')::uuid; expected:=electronic_private.version(payload->'expectedVersion');
 p:=(payload-'operationKey')||jsonb_build_object('organizationId',org,'documentId',id_value);
 result:=electronic_private.replay(org,key,'confirm',p); if result is not null then return result; end if;
 select sale_id into sale from public.electronic_documents where organization_id=org and id=id_value;
 perform 1 from public.sales where organization_id=org and id=sale for update;
 select * into doc from public.electronic_documents where organization_id=org and id=id_value for update;
 if not found then raise exception using errcode='P0001',message='CPE_DOCUMENT_NOT_FOUND'; end if;
 if doc.state<>'prepared' then raise exception using errcode='P0001',message='CPE_DOCUMENT_IMMUTABLE'; end if;
 if doc.version<>expected then raise exception using errcode='40001',message='CPE_STALE_WRITE'; end if;
 perform 1 from public.electronic_document_series where organization_id=org and id=doc.series_id for update;
 snap:=electronic_private.snapshot(doc.request);
 if snap<>doc.snapshot then raise exception using errcode='40001',message='CPE_SOURCE_CHANGED'; end if;
 update public.electronic_document_series set next_number=next_number+1
 where organization_id=org and id=doc.series_id and next_number<=99999999 returning next_number-1 into assigned;
 if not found then raise exception using errcode='P0001',message='CPE_SERIES_EXHAUSTED'; end if;
 snap:=snap||jsonb_build_object('number',assigned::text,'confirmedBy',actor,'confirmedAt',transaction_timestamp(),
  'issueTime',to_char(timezone('America/Lima',transaction_timestamp()),'HH24:MI:SS'),'taxValidity','NONE_SANDBOX');
 update public.electronic_documents set state='frozen',number=assigned,version=version+1,
  snapshot=snap,snapshot_hash=electronic_private.hash(snap),confirmed_by=actor,confirmed_at=transaction_timestamp() where id=doc.id returning * into doc;
 insert into public.electronic_document_outbox(organization_id,document_id) values(org,doc.id);
 return electronic_private.complete(org,key,'confirm',p,electronic_private.document_result(doc),actor,doc.id);
end $$;

create function public.get_electronic_document(organization_id uuid,document_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform electronic_private.assert_access(organization_id,'BILLING_VIEW');
 select electronic_private.document_result(d)||jsonb_build_object('snapshot',d.snapshot) into result
 from public.electronic_documents d where d.organization_id=$1 and d.id=$2;
 if result is null then raise exception using errcode='P0001',message='CPE_DOCUMENT_NOT_FOUND'; end if;
 return result;
end $$;

create function electronic_private.immutable() returns trigger
language plpgsql set search_path='' as $$
begin raise exception using errcode='P0001',message='CPE_IMMUTABLE'; end $$;
create trigger electronic_commands_immutable before update or delete on public.electronic_document_commands
for each row execute function electronic_private.immutable();
create trigger electronic_outbox_immutable before update or delete on public.electronic_document_outbox
for each row execute function electronic_private.immutable();
create function electronic_private.protect_document() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.state='frozen' then raise exception using errcode='P0001',message='CPE_DOCUMENT_IMMUTABLE'; end if;
 if tg_op='UPDATE' and row(new.organization_id,new.sale_id,new.issuer_profile_id,new.series_id,new.environment,new.document_type,new.series,new.issuer_ruc_snapshot)
   is distinct from row(old.organization_id,old.sale_id,old.issuer_profile_id,old.series_id,old.environment,old.document_type,old.series,old.issuer_ruc_snapshot) then
  raise exception using errcode='P0001',message='CPE_DOCUMENT_IDENTITY_IMMUTABLE'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger electronic_documents_immutable before update or delete on public.electronic_documents
for each row execute function electronic_private.protect_document();
create function electronic_private.protect_item() returns trigger
language plpgsql security definer set search_path='' as $$
declare doc uuid:=coalesce(new.document_id,old.document_id);
begin
 if exists(select 1 from public.electronic_documents where id in(new.document_id,old.document_id) and state='frozen') then
  raise exception using errcode='P0001',message='CPE_DOCUMENT_IMMUTABLE'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger electronic_items_immutable before insert or update or delete on public.electronic_document_items
for each row execute function electronic_private.protect_item();

-- Deferred cross-table invariant, also protects privileged maintenance mistakes.
create function electronic_private.check_totals() returns trigger
language plpgsql security definer set search_path='' as $$
declare doc uuid; d public.electronic_documents%rowtype; sums record;
begin
 if tg_table_name='electronic_documents' then doc:=coalesce(new.id,old.id); else doc:=coalesce(new.document_id,old.document_id); end if;
 select * into d from public.electronic_documents where id=doc;
 if not found then return null; end if;
 select count(*) n,sum(base) base,sum(tax) tax,sum(total) total,
  coalesce(sum(base) filter(where affectation='10'),0) taxable,
  coalesce(sum(base) filter(where affectation='20'),0) exempt,
  coalesce(sum(base) filter(where affectation='30'),0) unaffected,
  jsonb_agg(snapshot order by ordinal) items into sums from public.electronic_document_items where document_id=doc;
 if sums.n=0 or row(sums.base,sums.tax,sums.total,sums.taxable,sums.exempt,sums.unaffected) is distinct from
   row(d.subtotal,d.tax,d.total,d.taxable_base,d.exempt_amount,d.unaffected_amount) or sums.items<>d.snapshot->'items'
   or d.snapshot_hash<>electronic_private.hash(d.snapshot) then
  raise exception using errcode='23514',message='CPE_AGGREGATE_MISMATCH'; end if;
 return null;
end $$;
create constraint trigger electronic_documents_totals after insert or update on public.electronic_documents
deferrable initially deferred for each row execute function electronic_private.check_totals();
create constraint trigger electronic_items_totals after insert or update or delete on public.electronic_document_items
deferrable initially deferred for each row execute function electronic_private.check_totals();

create function public.can_view_electronic_documents(org uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 perform electronic_private.assert_access(org,'BILLING_VIEW'); return true;
exception when insufficient_privilege then return false;
end $$;
revoke all on function public.can_view_electronic_documents(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_view_electronic_documents(uuid) to authenticated;

do $$declare t text; f text; begin
 foreach t in array array['electronic_issuer_profiles','electronic_document_series','electronic_documents','electronic_document_items','electronic_document_commands','electronic_document_outbox'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy fiscal_read on public.%I for select to authenticated using (public.can_view_electronic_documents(organization_id))',t);
 end loop;
 foreach f in array array['save_electronic_issuer_profile(jsonb)','configure_electronic_series(jsonb)','prepare_electronic_document(jsonb)',
  'revise_electronic_document(jsonb)','confirm_electronic_document(jsonb)','get_electronic_document(uuid,uuid)'] loop
  execute 'revoke all on function public.'||f||' from public,anon,authenticated,service_role';
  execute 'grant execute on function public.'||f||' to authenticated';
 end loop;
end $$;
revoke all on all functions in schema electronic_private from public,anon,authenticated,service_role;
