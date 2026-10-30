-- R14: operational cost evidence, not quotes, payments or inventory revaluation.
begin;

insert into public.permissions(code,name,description,is_directly_assignable) values
 ('REPAIRS_MANAGE_ACTUAL_COST','Registrar costos reales de reparación','Registrar y revisar evidencia económica sin editar el trabajo técnico.',true),
 ('REPAIRS_CONFIRM_ACTUAL_COST','Confirmar revisión de costos reales','Confirmar explícitamente alcance y fuentes económicas a una fecha de corte.',true);
insert into public.permission_dependencies(permission_code,required_permission_code) values
 ('REPAIRS_MANAGE_ACTUAL_COST','REPAIRS_VIEW'),('REPAIRS_CONFIRM_ACTUAL_COST','REPAIRS_VIEW');
-- Deliberately NO role_permissions or user assignments, including ADMIN.
create sequence public.repair_cost_sequence;
revoke all on sequence public.repair_cost_sequence from public,anon,authenticated,service_role;

create table public.repair_actual_cost_entries (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null, repair_id uuid not null, root_id uuid not null, supersedes_id uuid,
 category text not null check(category in ('labor','other')),
 description text not null check(char_length(btrim(description)) between 3 and 500),
 amount numeric(20,2) not null check(amount>=0 and amount<=9999999999999999.99),
 currency text not null check(currency in ('PEN','USD')),
 cost_basis text not null check(cost_basis in ('tax_inclusive','tax_exclusive','not_applicable')),
 incurred_on date not null, evidence_reference text not null check(char_length(btrim(evidence_reference)) between 3 and 2000),
 reason text not null check(char_length(btrim(reason)) between 3 and 2000), is_void boolean not null default false,
 recorded_by uuid not null references auth.users(id) on delete restrict,
 recorded_by_name text not null, recorded_at timestamptz not null default now(),
 sequence_number bigint not null default nextval('public.repair_cost_sequence'),
 unique(organization_id,repair_id,id), unique(organization_id,supersedes_id),
 foreign key(organization_id,repair_id) references public.repairs(organization_id,id) on delete restrict,
 foreign key(organization_id,repair_id,root_id) references public.repair_actual_cost_entries(organization_id,repair_id,id) on delete restrict,
 foreign key(organization_id,repair_id,supersedes_id) references public.repair_actual_cost_entries(organization_id,repair_id,id) on delete restrict,
 check((supersedes_id is null and root_id=id) or (supersedes_id is not null and supersedes_id<>id))
);
create unique index repair_actual_cost_entries_reference_idx on public.repair_actual_cost_entries
 (organization_id,repair_id,(encode(extensions.digest(lower(evidence_reference),'sha256'),'hex'))) where supersedes_id is null;
create index repair_actual_cost_entries_scope_idx on public.repair_actual_cost_entries(organization_id,repair_id,recorded_at,id);

alter table public.repair_external_services add constraint repair_external_services_scope_key unique(organization_id,id);
create table public.repair_cost_source_reviews (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, repair_id uuid not null,
 consumption_id uuid, external_service_id uuid, supersedes_id uuid,
 review_kind text not null check(review_kind in ('verification','external_revision')),
 amount numeric(20,2), currency text not null check(currency in ('PEN','USD')),
 cost_basis text not null check(cost_basis in ('tax_inclusive','tax_exclusive','not_applicable')),
 evidence_reference text not null check(char_length(btrim(evidence_reference)) between 3 and 2000),
 reason text not null check(char_length(btrim(reason)) between 3 and 2000),
 source_fingerprint text not null, provenance jsonb not null,
 recorded_by uuid not null references auth.users(id) on delete restrict,
 recorded_by_name text not null, recorded_at timestamptz not null default now(),
 sequence_number bigint not null default nextval('public.repair_cost_sequence'),
 unique(organization_id,repair_id,id), unique(organization_id,supersedes_id),
 foreign key(organization_id,repair_id) references public.repairs(organization_id,id) on delete restrict,
 foreign key(organization_id,consumption_id) references public.repair_part_consumptions(organization_id,id) on delete restrict,
 foreign key(organization_id,external_service_id) references public.repair_external_services(organization_id,id) on delete restrict,
 foreign key(organization_id,repair_id,supersedes_id) references public.repair_cost_source_reviews(organization_id,repair_id,id) on delete restrict,
 check((consumption_id is not null)::integer+(external_service_id is not null)::integer=1),
 check((consumption_id is not null and amount is null and review_kind='verification') or
   (external_service_id is not null and amount is not null and amount>=0 and amount<=999999999999.99))
);
create unique index repair_cost_source_reviews_consumption_root_idx on public.repair_cost_source_reviews(organization_id,consumption_id)
 where consumption_id is not null and supersedes_id is null;
create unique index repair_cost_source_reviews_external_root_idx on public.repair_cost_source_reviews(organization_id,external_service_id)
 where external_service_id is not null and supersedes_id is null;
create index repair_cost_source_reviews_scope_idx on public.repair_cost_source_reviews(organization_id,repair_id,recorded_at,id);

create table public.repair_actual_cost_reviews (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, repair_id uuid not null,
 source_fingerprint text not null, scope jsonb not null,
 empty_currency text check(empty_currency in ('PEN','USD')),
 evidence_reference text not null, reason text not null, snapshot jsonb not null,
 reviewed_by uuid not null references auth.users(id) on delete restrict, reviewed_by_name text not null,
 -- Actual server cutoff after aggregate locking, not a possibly older SQL
 -- transaction start when an integration keeps a transaction open.
 cutoff_at timestamptz not null default clock_timestamp(),
 sequence_number bigint not null default nextval('public.repair_cost_sequence'),
 foreign key(organization_id,repair_id) references public.repairs(organization_id,id) on delete restrict
);
create index repair_actual_cost_reviews_scope_idx on public.repair_actual_cost_reviews(organization_id,repair_id,sequence_number desc);

create function public.prevent_repair_cost_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='P0001',message='REPAIR_COST_IMMUTABLE'; end $$;
do $$ declare t text; begin
 foreach t in array array['repair_actual_cost_entries','repair_cost_source_reviews','repair_actual_cost_reviews'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for select to authenticated using (
    (select public.current_auth_session_is_active()) and organization_id=any((select public.current_user_organization_ids_with_permission(''REPAIRS_VIEW''))::uuid[]))',t||'_read',t);
  execute format('create trigger %I before update or delete on public.%I for each row execute function public.prevent_repair_cost_mutation()',t||'_immutable',t);
 end loop;
end $$;

create function public.repair_cost_hash(value jsonb) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(value::text,'sha256'),'hex');
$$;
create function public.repair_cost_text(value jsonb,max_length integer default 2000) returns text
language plpgsql immutable set search_path='' as $$ declare result text; begin
 if jsonb_typeof(value) is distinct from 'string' then raise exception using errcode='22023',message='REPAIR_COST_TEXT_REQUIRED'; end if;
 result:=btrim(value#>>'{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 if char_length(result)<3 or char_length(result)>max_length then raise exception using errcode='22023',message='REPAIR_COST_TEXT_REQUIRED'; end if;
 return result;
end $$;
create function public.repair_cost_amount(value jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare result numeric; raw text:=btrim(value#>>'{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'); begin
 if jsonb_typeof(value) not in ('number','string') or value is null
   or coalesce(raw,'') !~ '^[0-9]{1,16}(\.[0-9]{1,2})?$' then
  raise exception using errcode='22023',message='REPAIR_COST_AMOUNT_INVALID';
 end if;
 result:=raw::numeric;
 if result<0 or result>9999999999999999.99 then raise exception using errcode='22023',message='REPAIR_COST_AMOUNT_INVALID'; end if;
 return result;
end $$;
create function public.assert_repair_cost_actor(org uuid,capability text) returns uuid
language plpgsql security definer set search_path='' as $$ begin
 if auth.jwt()->>'role' is distinct from 'authenticated' or auth.uid() is null then
  raise exception using errcode='42501',message='REPAIR_COST_USER_REQUIRED';
 end if;
 perform public.assert_repair_actor(org,'REPAIRS_VIEW');
 return public.assert_repair_actor(org,capability);
end $$;

-- Only document-traceable, homogeneous purchase inflows can certify an inventory
-- valuation. Manual stock, transfers/reclassifications, unknown tax snapshots or
-- mixed currencies remain UNVERIFIABLE even with a user-supplied currency/note.
-- No inventory row is changed. Ledger sequence fixes the pre-consumption cutoff.
create function public.repair_consumption_cost_provenance(org uuid,consumption uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.repair_part_consumptions%rowtype; m public.inventory_movements%rowtype;
  currencies integer; bases integer; currency_value text; basis_value text; valid boolean; contradictory boolean;
 receipts jsonb; qty numeric; value numeric;
begin
 select * into c from public.repair_part_consumptions where organization_id=org and id=consumption;
 select * into m from public.inventory_movements where organization_id=org and id=c.inventory_movement_id;
 if c.id is null or m.id is null or m.ledger_sequence is null or c.unit_cost<=0
   or c.unit_cost::text in ('NaN','Infinity','-Infinity') then return null; end if;
 with movements as materialized (
  select x.* from public.inventory_movements x where x.organization_id=org and x.product_id=m.product_id
    and x.warehouse_id=m.warehouse_id and x.location_id=m.location_id and x.stock_status=m.stock_status
    and lower(coalesce(x.lot,''))=lower(coalesce(m.lot,'')) and x.expiration_date is not distinct from m.expiration_date
    and x.ledger_sequence<m.ledger_sequence
 ), inflows as (
   select x.id,x.quantity,x.unit_cost,x.source_type,ri.id as receipt_item_id,po.currency,
    case when ri.tax_affectation in ('exonerado','inafecto') then 'not_applicable'
      when ri.tax_affectation='gravado' then case when po.prices_include_tax then 'tax_inclusive' else 'tax_exclusive' end end basis,
     -- Follow BOTH parents of the receipt line. A valid FK to an order item
     -- alone does not prove that it belongs to the receipt header's order.
     x.unit_cost=ri.unit_cost and ri.unit_cost=poi.unit_cost and x.product_id=ri.product_id
       and ri.product_id=poi.product_id and poi.purchase_order_id=pr.purchase_order_id
       and ri.tax_affectation=poi.tax_affectation and poi.product_type='good'
       and x.movement_type='entrada' and x.stock_status='available' and x.quantity<=ri.quantity
       and ri.fulfillment_mode='physical' and x.warehouse_id=ri.warehouse_id and x.location_id=ri.location_id
       and pr.warehouse_id=ri.warehouse_id
       and lower(coalesce(x.lot,''))=lower(coalesce(ri.lot,''))
       and x.expiration_date is not distinct from ri.expiration_date
       and po.status in ('received','partially_received','closed_partial') as cost_matches,
     coalesce(x.source_type='purchase-receipt' and ri.id is not null and (
       x.product_id is distinct from ri.product_id or x.unit_cost is distinct from ri.unit_cost or x.quantity>ri.quantity
       or x.movement_type<>'entrada' or x.stock_status<>'available' or ri.fulfillment_mode<>'physical'
       or x.warehouse_id is distinct from ri.warehouse_id or x.location_id is distinct from ri.location_id
       or lower(coalesce(x.lot,''))<>lower(coalesce(ri.lot,''))
       or x.expiration_date is distinct from ri.expiration_date
       or (pr.id is not null and pr.warehouse_id is distinct from ri.warehouse_id)
       or (poi.id is not null and (poi.purchase_order_id is distinct from pr.purchase_order_id
         or poi.product_id is distinct from ri.product_id or poi.unit_cost is distinct from ri.unit_cost
         or (poi.tax_affectation is not null and ri.tax_affectation is not null and poi.tax_affectation<>ri.tax_affectation)))
     ),false) as contradiction
   from movements x left join public.purchase_receipt_items ri on ri.organization_id=org and ri.id=x.source_id
   left join public.purchase_order_items poi on poi.organization_id=org and poi.id=ri.purchase_order_item_id
  left join public.purchase_receipts pr on pr.organization_id=org and pr.id=ri.receipt_id
  left join public.purchase_orders po on po.organization_id=org and po.id=pr.purchase_order_id
  where x.movement_type in ('entrada','ajuste-positivo')
 ) select count(distinct currency),count(distinct basis) filter(where basis<>'not_applicable'),min(currency),
  coalesce(min(basis) filter(where basis<>'not_applicable'),'not_applicable'),
   coalesce(bool_and(coalesce(source_type='purchase-receipt' and receipt_item_id is not null and currency in ('PEN','USD')
     and basis is not null and cost_matches and unit_cost>0 and unit_cost::text not in ('NaN','Infinity','-Infinity'),false)),false),
   coalesce(bool_or(contradiction),false),
  jsonb_agg(jsonb_build_object('receipt_item_id',receipt_item_id,'movement_id',id) order by id)
  into currencies,bases,currency_value,basis_value,valid,contradictory,receipts from inflows;
  if contradictory then return jsonb_build_object('method','rejected_documentary_chain','reason','inventory_documentary_inconsistent'); end if;
 select sum(case when x.movement_type in ('entrada','ajuste-positivo') then x.quantity else -x.quantity end),
   sum(case when x.movement_type in ('entrada','ajuste-positivo') then x.quantity*x.unit_cost else -x.quantity*x.unit_cost end)
 into qty,value from public.inventory_movements x where x.organization_id=org and x.product_id=m.product_id
   and x.warehouse_id=m.warehouse_id and x.location_id=m.location_id and x.stock_status=m.stock_status
   and lower(coalesce(x.lot,''))=lower(coalesce(m.lot,'')) and x.expiration_date is not distinct from m.expiration_date
   and x.ledger_sequence<m.ledger_sequence;
  if not valid or currencies<>1 or bases>1 or qty is null or qty<c.quantity or value is null
   or value::text in ('NaN','Infinity','-Infinity') or round(value/qty,4) is distinct from c.unit_cost then return null; end if;
 return jsonb_build_object('method','homogeneous_purchase_bucket','currency',currency_value,'cost_basis',basis_value,
   'cutoff_ledger_sequence',m.ledger_sequence::text,'receipts',receipts);
end $$;

-- Internal set-based source projection. No client EXECUTE; public read RPCs
-- validate an active REPAIRS_VIEW user once, then scope EVERY branch to org/IDs.
-- This also permits a repair reader (without INVENTORY_VIEW) to see integrity of
-- their repair consumption without exposing other stock or purchase records.
create function public.repair_actual_cost_items(org uuid,repairs uuid[])
returns table(organization_id uuid,repair_id uuid,source_kind text,source_id uuid,revision_id uuid,title text,
 amount numeric,original_amount numeric,currency text,cost_basis text,is_verified boolean,pending_reason text,source_fingerprint text,details jsonb)
language sql stable security definer set search_path='' as $$
 with reviews as materialized (
  select s.* from public.repair_cost_source_reviews s where s.organization_id=org and s.repair_id=any(repairs)
   and not exists(select 1 from public.repair_cost_source_reviews n where n.organization_id=org and n.supersedes_id=s.id)
 ), consumptions as (
  select c.*,p.repair_id,p.product_id,p.product_description_snapshot,m.id as movement_id,
   public.repair_cost_hash(jsonb_build_object('consumption',to_jsonb(c),'movement',to_jsonb(m))) fp,
   coalesce(m.movement_type='salida' and m.source_type='repair-consumption' and m.source_id=c.id
    and m.quantity=c.quantity and m.unit_cost=c.unit_cost and m.product_id=p.product_id
    and m.warehouse_id=c.warehouse_id and m.location_id=c.location_id and m.stock_status=c.stock_status
    and lower(coalesce(m.lot,''))=lower(coalesce(c.lot,'')) and m.expiration_date is not distinct from c.expiration_date
    and c.unit_cost::text not in ('NaN','Infinity','-Infinity') and c.quantity::text not in ('NaN','Infinity','-Infinity'),false) consistent
  from public.repair_parts p join public.repair_part_consumptions c on c.organization_id=org and c.repair_part_id=p.id
  left join public.inventory_movements m on m.organization_id=org and m.id=c.inventory_movement_id
  where p.organization_id=org and p.repair_id=any(repairs)
 ), externals as (
  select s.*,public.repair_cost_hash(to_jsonb(s)) fp from public.repair_external_services s
   where s.organization_id=org and s.repair_id=any(repairs)
 )
 select org,c.repair_id,'consumption',c.id,s.id,c.product_description_snapshot,c.quantity*c.unit_cost,c.quantity*c.unit_cost,
  s.currency,s.cost_basis,c.consistent and c.unit_cost>0 and s.id is not null and s.source_fingerprint=c.fp,
  case when not c.consistent then 'consumption_movement_inconsistent' when c.unit_cost=0 then 'historical_zero_unverified'
     when s.id is null or s.source_fingerprint<>c.fp then coalesce(proof.data->>'reason','inventory_currency_basis_unverified') end,c.fp,
  jsonb_build_object('quantity',c.quantity::text,'unit_cost',c.unit_cost::text,'inventory_movement_id',c.inventory_movement_id,
     'recorded_currency',null,'evidence_reference',s.evidence_reference,'provenance',coalesce(s.provenance,proof.data))
  from consumptions c left join reviews s on s.consumption_id=c.id
  left join lateral (select case when c.consistent and c.unit_cost>0 and (s.id is null or s.source_fingerprint<>c.fp)
    then public.repair_consumption_cost_provenance(org,c.id) end data) proof on true
 union all
 select org,x.repair_id,'external',x.id,s.id,x.supplier_name_snapshot,coalesce(s.amount,x.cost_amount),x.cost_amount,
  coalesce(s.currency,x.currency),s.cost_basis,x.returned_at is not null and s.id is not null and s.source_fingerprint=x.fp,
  case when x.returned_at is null then 'external_return_pending' when s.id is null or s.source_fingerprint<>x.fp then 'external_basis_unverified' end,x.fp,
  jsonb_build_object('supplier_id',x.supplier_id,'description',x.description,'returned_at',x.returned_at,
    'original_currency',x.currency,'evidence_reference',s.evidence_reference)
 from externals x left join reviews s on s.external_service_id=x.id
 union all
 select org,e.repair_id,e.category,e.root_id,e.id,e.description,e.amount,e.amount,e.currency,e.cost_basis,true,null,
  public.repair_cost_hash(to_jsonb(e)),jsonb_build_object('incurred_on',e.incurred_on,'evidence_reference',e.evidence_reference,'recorded_by_name',e.recorded_by_name)
 from public.repair_actual_cost_entries e where e.organization_id=org and e.repair_id=any(repairs) and not e.is_void
  and not exists(select 1 from public.repair_actual_cost_entries n where n.organization_id=org and n.supersedes_id=e.id)
 union all
 select org,p.repair_id,'inconsistent_parts',p.id,null,p.product_description_snapshot,null,null,null,null,false,'consumption_ledger_inconsistent',
  public.repair_cost_hash(jsonb_build_array(p.id,p.quantity_consumed,coalesce(sum(c.quantity),0))),
  jsonb_build_object('quantity_consumed',p.quantity_consumed::text,'quantity_in_ledger',coalesce(sum(c.quantity),0)::text)
 from public.repair_parts p left join public.repair_part_consumptions c on c.organization_id=org and c.repair_part_id=p.id
 where p.organization_id=org and p.repair_id=any(repairs) group by p.repair_id,p.id,p.product_description_snapshot,p.quantity_consumed
 having p.quantity_consumed is distinct from coalesce(sum(c.quantity),0);
$$;

create function public.repair_actual_cost_summaries(org uuid,repairs uuid[])
returns table(repair_id uuid,summary jsonb) language sql stable security definer set search_path='' as $$
 with owned as materialized(select r.id,r.lock_version from public.repairs r where r.organization_id=org and r.id=any(repairs)),
 items as materialized(select * from public.repair_actual_cost_items(org,array(select id from owned))),
 item_stats as (
  select i.repair_id,count(*) item_count,count(*) filter(where not i.is_verified) pending_count,
    count(*) filter(where i.is_verified) verified_count,
    count(distinct i.cost_basis) filter(where i.is_verified and i.cost_basis<>'not_applicable') basis_count,
    coalesce(min(i.cost_basis) filter(where i.is_verified and i.cost_basis<>'not_applicable'),'not_applicable') common_basis,
    jsonb_agg(jsonb_build_array(i.source_kind,i.source_id,i.revision_id,i.source_fingerprint,i.amount::text,i.currency,i.cost_basis,i.is_verified,i.pending_reason)
      order by i.source_kind,i.source_id) identities,
    coalesce(jsonb_agg(jsonb_build_object('source_kind',i.source_kind,'source_id',i.source_id,'reason',i.pending_reason)
      order by i.source_kind,i.source_id) filter(where not i.is_verified),'[]') pending
  from items i group by i.repair_id
 ), markers as (
  select m.repair_id,sum(m.n) n from (
   select e.repair_id,count(*) n from public.repair_actual_cost_entries e where e.organization_id=org and e.repair_id=any(repairs) group by e.repair_id
   union all select e.repair_id,count(*) from public.repair_cost_source_reviews e where e.organization_id=org and e.repair_id=any(repairs) group by e.repair_id
  ) m group by m.repair_id
 ), fingerprints as (
  select o.*,coalesce(s.item_count,0) item_count,coalesce(s.pending_count,0) pending_count,coalesce(s.verified_count,0) verified_count,
    coalesce(s.basis_count,0) basis_count,coalesce(s.common_basis,'not_applicable') common_basis,coalesce(s.pending,'[]') pending,
    public.repair_cost_hash(jsonb_build_object('organization_id',org,'repair_id',o.id,'sources',coalesce(s.identities,'[]'),
      'economic_revision_count',coalesce(m.n,0))) fingerprint
  from owned o left join item_stats s on s.repair_id=o.id left join markers m on m.repair_id=o.id
 ), subtotals as (
  select i.repair_id,i.currency,case when f.basis_count<=1 then f.common_basis else i.cost_basis end basis,sum(i.amount) amount
  from items i join fingerprints f on f.id=i.repair_id where i.is_verified
  group by i.repair_id,i.currency,case when f.basis_count<=1 then f.common_basis else i.cost_basis end
 ), totals as (
  select t.repair_id,count(*) n,jsonb_agg(jsonb_build_object('currency',t.currency,'cost_basis',t.basis,'amount',t.amount::text)
    order by t.currency,t.basis) subtotals,min(t.currency) currency,min(t.basis) basis,min(t.amount) amount from subtotals t group by t.repair_id
 ), categories as (
  select i.repair_id,i.source_kind,i.currency,i.cost_basis,count(*) n,sum(i.amount) amount from items i where i.is_verified
   group by i.repair_id,i.source_kind,i.currency,i.cost_basis
 ), components as (
  select c.repair_id,jsonb_agg(jsonb_build_object('component',c.source_kind,'currency',c.currency,'cost_basis',c.cost_basis,
    'count',c.n,'amount',c.amount::text) order by c.source_kind,c.currency,c.cost_basis) data from categories c group by c.repair_id
 ), latest as (
  select distinct on(r.repair_id) r.* from public.repair_actual_cost_reviews r where r.organization_id=org and r.repair_id=any(repairs)
   order by r.repair_id,r.sequence_number desc
 ) select f.id,jsonb_build_object('repair_id',f.id,'lock_version',f.lock_version,'source_fingerprint',f.fingerprint,
   'state',case when r.id is not null and r.source_fingerprint=f.fingerprint and f.pending_count=0 and f.basis_count<=1 then 'confirmed'
     when f.verified_count>0 then 'partial' else 'undetermined' end,
   'can_confirm',f.pending_count=0 and f.basis_count<=1,
   'total',case when r.id is not null and r.source_fingerprint=f.fingerprint and f.pending_count=0 and f.basis_count<=1
     and coalesce(t.n,0)<=1 then jsonb_build_object('amount',case when f.item_count=0 then '0' else t.amount::text end,
       'currency',case when f.item_count=0 then r.empty_currency else t.currency end,'cost_basis',f.common_basis) end,
   'subtotals',coalesce(t.subtotals,'[]'),'components',coalesce(c.data,'[]'),'item_count',f.item_count,
   'pending',f.pending||case when f.basis_count>1 then '[{"reason":"incompatible_tax_bases"}]'::jsonb else '[]'::jsonb end
     ||case when r.id is null then '[{"reason":"scope_review_required"}]'::jsonb
       when r.source_fingerprint<>f.fingerprint then '[{"reason":"economic_review_outdated"}]'::jsonb else '[]'::jsonb end,
   'warnings',case when t.n>1 and f.basis_count<=1 then '["multiple_currencies_no_conversion"]'::jsonb else '[]'::jsonb end,
   'latest_review',case when r.id is not null then jsonb_build_object('id',r.id,'cutoff_at',r.cutoff_at,'reviewed_by',r.reviewed_by,
     'reviewed_by_name',r.reviewed_by_name,'scope',r.scope,'evidence_reference',r.evidence_reference,'is_current',r.source_fingerprint=f.fingerprint) end)
 from fingerprints f left join totals t on t.repair_id=f.id left join components c on c.repair_id=f.id left join latest r on r.repair_id=f.id;
$$;

create function public.execute_repair_actual_cost_command(command text,payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare org uuid; repair uuid; operation uuid; actor uuid; actor_name text; result uuid; id uuid:=gen_random_uuid();
 e public.repair_actual_cost_entries%rowtype; s public.repair_cost_source_reviews%rowtype; x public.repair_external_services%rowtype;
 item record; cost_summary jsonb; previous jsonb; proof jsonb; amount_value numeric; currency_value text; basis text;
 description_value text; evidence text; reason_value text; incurred date; void_value boolean:=false;
 target uuid; source_kind text; scope_value jsonb; component text; n integer; choice text; allowed text[];
begin
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception using errcode='22023',message='REPAIR_PAYLOAD_INVALID'; end if;
 allowed:=array['organization_id','repair_id','operation_key','expected_lock_version','evidence_reference','reason']||case command
  when 'record_repair_actual_cost' then array['category','description','amount','currency','cost_basis','incurred_on']
  when 'revise_repair_actual_cost' then array['entry_id','description','amount','currency','cost_basis','incurred_on','void']
  when 'verify_repair_cost_source' then array['source_kind','source_id','currency','cost_basis']
  when 'revise_repair_external_cost' then array['source_id','amount','currency','cost_basis']
  when 'confirm_repair_actual_cost_review' then array['scope','source_fingerprint','empty_currency'] end;
 if allowed is null then raise exception using errcode='22023',message='REPAIR_PAYLOAD_INVALID'; end if;
 if payload - allowed <> '{}'::jsonb then
  raise exception using errcode='22023',message='REPAIR_COST_SERVER_FIELDS';
 end if;
 org:=(payload->>'organization_id')::uuid; repair:=(payload->>'repair_id')::uuid; operation:=(payload->>'operation_key')::uuid;
 actor:=public.assert_repair_cost_actor(org,case when command='confirm_repair_actual_cost_review' then 'REPAIRS_CONFIRM_ACTUAL_COST' else 'REPAIRS_MANAGE_ACTUAL_COST' end);
 result:=public.replay_repair_command(org,operation,command,payload);
 if result is not null then return result; end if;
 perform public.lock_repair_version(org,repair,(payload->>'expected_lock_version')::bigint);
 select full_name into actor_name from public.profiles where profiles.id=actor;
 evidence:=public.repair_cost_text(payload->'evidence_reference'); reason_value:=public.repair_cost_text(payload->'reason');
 if command in ('record_repair_actual_cost','revise_repair_actual_cost') then
  if command='revise_repair_actual_cost' then
   select a.* into e from public.repair_actual_cost_entries a where a.organization_id=org and a.repair_id=repair and a.id=(payload->>'entry_id')::uuid;
   if not found then raise exception using errcode='P0001',message='REPAIR_COST_SOURCE_NOT_FOUND'; end if;
   if exists(select 1 from public.repair_actual_cost_entries a where a.organization_id=org and a.supersedes_id=e.id) then
    raise exception using errcode='P0001',message='REPAIR_COST_REVISION_CONFLICT';
   end if;
   previous:=to_jsonb(e)||jsonb_build_object('amount',e.amount::text,'sequence_number',e.sequence_number::text);
   if payload ? 'void' and jsonb_typeof(payload->'void')<>'boolean' then raise exception using errcode='22023',message='REPAIR_PAYLOAD_INVALID'; end if;
   void_value:=coalesce((payload->>'void')::boolean,false);
  elsif payload->>'category' not in ('labor','other') or payload->>'category' is null then
   raise exception using errcode='22023',message='REPAIR_COST_CATEGORY_INVALID';
  end if;
  if void_value then
   amount_value:=e.amount; currency_value:=e.currency; basis:=e.cost_basis; description_value:=e.description; incurred:=e.incurred_on;
  else
   amount_value:=public.repair_cost_amount(payload->'amount'); currency_value:=payload->>'currency'; basis:=payload->>'cost_basis';
   description_value:=public.repair_cost_text(payload->'description',500);
   if payload->>'incurred_on' is null or payload->>'incurred_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using errcode='22023',message='REPAIR_COST_DATE_INVALID';
   end if;
   incurred:=(payload->>'incurred_on')::date;
   if incurred>(now() at time zone 'America/Lima')::date then raise exception using errcode='22023',message='REPAIR_COST_DATE_INVALID'; end if;
  end if;
  if currency_value is null or currency_value not in ('PEN','USD') or basis is null or basis not in ('tax_inclusive','tax_exclusive','not_applicable') then
   raise exception using errcode='22023',message='REPAIR_COST_CURRENCY_BASIS_REQUIRED';
  end if;
  if command='record_repair_actual_cost' and exists(select 1 from public.repair_actual_cost_entries a
    where a.organization_id=org and a.repair_id=repair and a.supersedes_id is null and lower(a.evidence_reference)=lower(evidence)) then
   raise exception using errcode='P0001',message='REPAIR_COST_DUPLICATE_REFERENCE';
  end if;
  if exists(select 1 from public.repair_actual_cost_entries a where a.organization_id=org and a.repair_id=repair
    and a.root_id<>coalesce(e.root_id,id) and lower(a.evidence_reference)=lower(evidence) and not a.is_void
    and not exists(select 1 from public.repair_actual_cost_entries next where next.organization_id=org and next.supersedes_id=a.id)) then
   raise exception using errcode='P0001',message='REPAIR_COST_DUPLICATE_REFERENCE';
  end if;
  insert into public.repair_actual_cost_entries(id,organization_id,repair_id,root_id,supersedes_id,category,description,amount,currency,cost_basis,
    incurred_on,evidence_reference,reason,is_void,recorded_by,recorded_by_name)
  values(id,org,repair,coalesce(e.root_id,id),e.id,coalesce(e.category,payload->>'category'),description_value,amount_value,currency_value,basis,
    incurred,evidence,reason_value,void_value,actor,actor_name);
 elsif command in ('verify_repair_cost_source','revise_repair_external_cost') then
  source_kind:=case when command='revise_repair_external_cost' then 'external' else payload->>'source_kind' end;
  if source_kind is null or source_kind not in ('consumption','external') then raise exception using errcode='22023',message='REPAIR_COST_SOURCE_NOT_FOUND'; end if;
  target:=(payload->>'source_id')::uuid;
  select i.* into item from public.repair_actual_cost_items(org,array[repair]) i where i.source_kind=source_kind and i.source_id=target;
  if not found then raise exception using errcode='P0001',message='REPAIR_COST_SOURCE_NOT_FOUND'; end if;
  select a.* into s from public.repair_cost_source_reviews a where a.organization_id=org and a.id=item.revision_id;
  if s.id is not null then previous:=to_jsonb(s)||jsonb_build_object('amount',s.amount::text,'sequence_number',s.sequence_number::text); end if;
  currency_value:=payload->>'currency'; basis:=payload->>'cost_basis';
  if currency_value is null or currency_value not in ('PEN','USD') or basis is null or basis not in ('tax_inclusive','tax_exclusive','not_applicable') then
   raise exception using errcode='22023',message='REPAIR_COST_CURRENCY_BASIS_REQUIRED';
  end if;
  if source_kind='consumption' then
   if item.pending_reason='consumption_movement_inconsistent' then raise exception using errcode='P0001',message='REPAIR_COST_SOURCE_INCONSISTENT'; end if;
    proof:=public.repair_consumption_cost_provenance(org,target);
    if proof->>'reason'='inventory_documentary_inconsistent' then
     raise exception using errcode='P0001',message='REPAIR_COST_DOCUMENTARY_INCONSISTENT';
    end if;
    if proof is null or proof->>'method' is distinct from 'homogeneous_purchase_bucket'
      or proof->>'currency'<>currency_value or proof->>'cost_basis'<>basis then
    raise exception using errcode='P0001',message='REPAIR_COST_PROVENANCE_UNVERIFIABLE';
   end if;
  else
   select a.* into x from public.repair_external_services a where a.organization_id=org and a.repair_id=repair and a.id=target;
   if x.returned_at is null then raise exception using errcode='P0001',message='REPAIR_COST_EXTERNAL_PENDING'; end if;
   if command='revise_repair_external_cost' then amount_value:=public.repair_cost_amount(payload->'amount');
   else
    amount_value:=coalesce(s.amount,x.cost_amount);
    if currency_value<>coalesce(s.currency,x.currency) then raise exception using errcode='22023',message='REPAIR_COST_USE_EXTERNAL_REVISION'; end if;
   end if;
   if amount_value>999999999999.99 then raise exception using errcode='22023',message='REPAIR_COST_AMOUNT_INVALID'; end if;
   proof:=jsonb_build_object('method','documented_external_cost','original_amount',x.cost_amount::text,'original_currency',x.currency,
    'external_service_id',x.id,'returned_at',x.returned_at);
  end if;
  insert into public.repair_cost_source_reviews(id,organization_id,repair_id,consumption_id,external_service_id,supersedes_id,review_kind,
    amount,currency,cost_basis,evidence_reference,reason,source_fingerprint,provenance,recorded_by,recorded_by_name)
  values(id,org,repair,case when source_kind='consumption' then target end,case when source_kind='external' then target end,s.id,
    case when command='revise_repair_external_cost' then 'external_revision' else 'verification' end,
    amount_value,currency_value,basis,evidence,reason_value,item.source_fingerprint,proof,actor,actor_name);
 elsif command='confirm_repair_actual_cost_review' then
  select c.summary into cost_summary from public.repair_actual_cost_summaries(org,array[repair]) c;
  if not (cost_summary->>'can_confirm')::boolean then raise exception using errcode='P0001',message='REPAIR_COST_SOURCES_PENDING'; end if;
  if payload->>'source_fingerprint' is distinct from cost_summary->>'source_fingerprint' then
   raise exception using errcode='P0001',message='REPAIR_COST_REVIEW_CONFLICT';
  end if;
  scope_value:=payload->'scope';
  if jsonb_typeof(scope_value) is distinct from 'object' or scope_value-array['consumption','external','labor','other']<>'{}'::jsonb
    or not scope_value ?& array['consumption','external','labor','other'] then raise exception using errcode='22023',message='REPAIR_COST_SCOPE_INVALID'; end if;
  foreach component in array array['consumption','external','labor','other'] loop
   choice:=scope_value->>component;
   select count(*) into n from public.repair_actual_cost_items(org,array[repair]) i where i.source_kind=component;
   if choice is null or choice not in ('complete','not_applicable') or (choice='complete' and n=0) or (choice='not_applicable' and n<>0) then
    raise exception using errcode='22023',message='REPAIR_COST_SCOPE_INVALID';
   end if;
  end loop;
  if (cost_summary->>'item_count')::integer=0 then
   currency_value:=payload->>'empty_currency';
   if currency_value is null or currency_value not in ('PEN','USD') then raise exception using errcode='22023',message='REPAIR_COST_CURRENCY_BASIS_REQUIRED'; end if;
  end if;
  insert into public.repair_actual_cost_reviews(id,organization_id,repair_id,source_fingerprint,scope,empty_currency,evidence_reference,reason,snapshot,reviewed_by,reviewed_by_name)
  values(id,org,repair,cost_summary->>'source_fingerprint',scope_value,currency_value,evidence,reason_value,cost_summary,actor,actor_name);
 end if;
 perform public.record_repair_event(org,repair,case command when 'record_repair_actual_cost' then 'ACTUAL_COST_RECORDED'
   when 'revise_repair_actual_cost' then 'ACTUAL_COST_REVISED' when 'confirm_repair_actual_cost_review' then 'ACTUAL_COST_REVIEW_CONFIRMED' else 'COST_SOURCE_REVIEWED' end,
   (select r.status from public.repairs r where r.organization_id=org and r.id=repair),
   (select r.status from public.repairs r where r.organization_id=org and r.id=repair),actor,reason_value,
   jsonb_build_object('economic_record_id',id,'command',command,'operation_key',operation,'old_values',previous,
     'new_values',case when command='confirm_repair_actual_cost_review' then jsonb_build_object('source_fingerprint',cost_summary->>'source_fingerprint','scope',scope_value)
       else jsonb_build_object('amount',amount_value::text,'currency',currency_value,'cost_basis',basis,'void',void_value,'evidence_reference',evidence) end),
   'REPAIR_'||upper(command));
 perform public.advance_repair_version(org,repair);
 perform public.complete_repair_command(org,operation,command,payload,id);
 return id;
end $$;

-- Commands and event types are extended without removing earlier blocks.
do $$ declare definition text; begin
 select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.repair_command_operations'::regclass and conname='repair_command_operations_command_type_valid';
 alter table public.repair_command_operations drop constraint repair_command_operations_command_type_valid;
 execute 'alter table public.repair_command_operations add constraint repair_command_operations_command_type_valid check (('
   ||substr(definition,7)||') or command_type in (''record_repair_actual_cost'',''revise_repair_actual_cost'',''verify_repair_cost_source'',''revise_repair_external_cost'',''confirm_repair_actual_cost_review''))';
 select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.repair_events'::regclass and conname='repair_events_event_type_valid';
 alter table public.repair_events drop constraint repair_events_event_type_valid;
 execute 'alter table public.repair_events add constraint repair_events_event_type_valid check (('
   ||substr(definition,7)||') or event_type in (''ACTUAL_COST_RECORDED'',''ACTUAL_COST_REVISED'',''COST_SOURCE_REVIEWED'',''ACTUAL_COST_REVIEW_CONFIRMED''))';
end $$;

-- Public wrappers/read contracts and final privilege revocations follow below.
create function public.record_repair_actual_cost(payload jsonb) returns uuid language sql security definer set search_path='' as $$
 select public.execute_repair_actual_cost_command('record_repair_actual_cost',payload); $$;
create function public.revise_repair_actual_cost(payload jsonb) returns uuid language sql security definer set search_path='' as $$
 select public.execute_repair_actual_cost_command('revise_repair_actual_cost',payload); $$;
create function public.verify_repair_cost_source(payload jsonb) returns uuid language sql security definer set search_path='' as $$
 select public.execute_repair_actual_cost_command('verify_repair_cost_source',payload); $$;
create function public.revise_repair_external_cost(payload jsonb) returns uuid language sql security definer set search_path='' as $$
 select public.execute_repair_actual_cost_command('revise_repair_external_cost',payload); $$;
create function public.confirm_repair_actual_cost_review(payload jsonb) returns uuid language sql security definer set search_path='' as $$
 select public.execute_repair_actual_cost_command('confirm_repair_actual_cost_review',payload); $$;

create function public.get_repair_actual_cost_summaries(requested_organization_id uuid,requested_repair_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$ declare result jsonb; begin
 perform public.assert_repair_cost_actor(requested_organization_id,'REPAIRS_VIEW');
 if requested_repair_ids is null or cardinality(requested_repair_ids)>50 or array_position(requested_repair_ids,null) is not null then
  raise exception using errcode='22023',message='REPAIR_COST_BATCH_INVALID';
 end if;
 select coalesce(jsonb_agg(s.summary order by s.repair_id),'[]') into result
  from public.repair_actual_cost_summaries(requested_organization_id,requested_repair_ids) s;
 return result;
end $$;

create function public.get_repair_actual_cost_detail(requested_organization_id uuid,requested_repair_id uuid,
 requested_offset integer default 0,requested_limit integer default 25) returns jsonb
language plpgsql security definer set search_path='' as $$ declare result jsonb; begin
 perform public.assert_repair_cost_actor(requested_organization_id,'REPAIRS_VIEW');
 if requested_offset is null or requested_offset<0 or requested_offset>1000000 or requested_limit is null or requested_limit<1 or requested_limit>50 then
  raise exception using errcode='22023',message='REPAIR_COST_BATCH_INVALID';
 end if;
 -- Summary, items and history share ONE statement snapshot, even though the
 -- authorization wrapper uses the existing volatile session assertion.
 with cost as materialized(select s.summary from public.repair_actual_cost_summaries(requested_organization_id,array[requested_repair_id]) s),
 items as materialized(select * from public.repair_actual_cost_items(requested_organization_id,array[requested_repair_id])),
 page as(select * from items order by source_kind,source_id offset requested_offset limit requested_limit),
 history as (
  select e.id,e.sequence_number,jsonb_build_object('kind','entry','id',e.id,'root_id',e.root_id,'supersedes_id',e.supersedes_id,
     'category',e.category,'description',e.description,'amount',e.amount::text,'currency',e.currency,'cost_basis',e.cost_basis,'is_void',e.is_void,
     'previous_amount',previous.amount::text,'previous_currency',previous.currency,'previous_cost_basis',previous.cost_basis,
     'is_effective',not e.is_void and not exists(select 1 from public.repair_actual_cost_entries n where n.organization_id=e.organization_id and n.supersedes_id=e.id),
    'incurred_on',e.incurred_on,'reason',e.reason,'evidence_reference',e.evidence_reference,'actor_name',e.recorded_by_name,
    'recorded_at',e.recorded_at,'sequence_number',e.sequence_number::text) data
    from public.repair_actual_cost_entries e left join public.repair_actual_cost_entries previous
      on previous.organization_id=e.organization_id and previous.repair_id=e.repair_id and previous.id=e.supersedes_id
    where e.organization_id=requested_organization_id and e.repair_id=requested_repair_id
  union all
  select e.id,e.sequence_number,jsonb_build_object('kind','source_review','id',e.id,'supersedes_id',e.supersedes_id,
    'source_id',coalesce(e.consumption_id,e.external_service_id),'source_kind',case when e.consumption_id is not null then 'consumption' else 'external' end,
     'amount',e.amount::text,'currency',e.currency,'cost_basis',e.cost_basis,'reason',e.reason,'evidence_reference',e.evidence_reference,
     'previous_amount',coalesce(previous.amount,x.cost_amount)::text,'previous_currency',coalesce(previous.currency,x.currency),
     'previous_cost_basis',previous.cost_basis,'is_effective',exists(select 1 from items i where i.revision_id=e.id and i.is_verified),
    'actor_name',e.recorded_by_name,'recorded_at',e.recorded_at,'sequence_number',e.sequence_number::text,'provenance',e.provenance)
    from public.repair_cost_source_reviews e left join public.repair_cost_source_reviews previous
      on previous.organization_id=e.organization_id and previous.repair_id=e.repair_id and previous.id=e.supersedes_id
    left join public.repair_external_services x on x.organization_id=e.organization_id and x.repair_id=e.repair_id and x.id=e.external_service_id
    where e.organization_id=requested_organization_id and e.repair_id=requested_repair_id
  union all
  select e.id,e.sequence_number,jsonb_build_object('kind','confirmation','id',e.id,'source_fingerprint',e.source_fingerprint,
     'scope',e.scope,'reason',e.reason,'evidence_reference',e.evidence_reference,'actor_name',e.reviewed_by_name,
     'is_current',e.id::text=(select summary->'latest_review'->>'id' from cost)
       and e.source_fingerprint=(select summary->>'source_fingerprint' from cost),
    'recorded_at',e.cutoff_at,'sequence_number',e.sequence_number::text,'snapshot',e.snapshot)
   from public.repair_actual_cost_reviews e where e.organization_id=requested_organization_id and e.repair_id=requested_repair_id
 ), history_page as(select * from history order by sequence_number desc offset requested_offset limit requested_limit)
 select jsonb_build_object('summary',(select summary from cost),'items',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('amount',p.amount::text,
   'original_amount',p.original_amount::text) order by p.source_kind,p.source_id) from page p),'[]'),
   'total_items',(select count(*) from items),'history',coalesce((select jsonb_agg(h.data order by h.sequence_number desc) from history_page h),'[]'),
   'total_history',(select count(*) from history),'offset',requested_offset,'limit',requested_limit) into result;
 if result->'summary'='null'::jsonb then raise exception using errcode='P0001',message='REPAIR_NOT_FOUND'; end if;
 return result;
end $$;

do $$ declare signature text; begin
 foreach signature in array array['prevent_repair_cost_mutation()','repair_cost_hash(jsonb)','repair_cost_text(jsonb,integer)',
  'repair_cost_amount(jsonb)','assert_repair_cost_actor(uuid,text)','repair_consumption_cost_provenance(uuid,uuid)',
  'repair_actual_cost_items(uuid,uuid[])','repair_actual_cost_summaries(uuid,uuid[])','execute_repair_actual_cost_command(text,jsonb)',
  'record_repair_actual_cost(jsonb)','revise_repair_actual_cost(jsonb)','verify_repair_cost_source(jsonb)',
  'revise_repair_external_cost(jsonb)','confirm_repair_actual_cost_review(jsonb)',
  'get_repair_actual_cost_summaries(uuid,uuid[])','get_repair_actual_cost_detail(uuid,uuid,integer,integer)'] loop
  execute 'revoke all on function public.'||signature||' from public,anon,authenticated,service_role';
 end loop;
end $$;
grant execute on function public.record_repair_actual_cost(jsonb),public.revise_repair_actual_cost(jsonb),
 public.verify_repair_cost_source(jsonb),public.revise_repair_external_cost(jsonb),public.confirm_repair_actual_cost_review(jsonb),
 public.get_repair_actual_cost_summaries(uuid,uuid[]),public.get_repair_actual_cost_detail(uuid,uuid,integer,integer) to authenticated;
comment on table public.repair_actual_cost_entries is 'Append-only manual incurred labor/other costs. Not quotes or payment records.';
comment on table public.repair_cost_source_reviews is 'Economic evidence/revisions; original inventory and custody records are never changed.';
comment on table public.repair_actual_cost_reviews is 'Explicit scope at server cutoff; fingerprints include economic revision counts, never technical events.';
commit;
