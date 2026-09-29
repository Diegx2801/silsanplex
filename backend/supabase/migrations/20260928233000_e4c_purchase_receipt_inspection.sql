begin;

-- E4C conserva purchase_receipt_items.quantity como la cantidad fisicamente
-- documentada en la recepcion. La inspeccion registra la disposicion aceptada
-- o rechazada sin modificar la fila inmutable de recepcion.
create table public.purchase_receipt_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  purchase_receipt_id uuid not null,
  purchase_receipt_item_id uuid not null,
  purchase_order_id uuid not null,
  purchase_order_item_id uuid not null,
  supplier_id uuid not null,
  product_id uuid not null,
  inspected_quantity numeric(14,3) not null,
  accepted_quantity numeric(14,3) not null,
  rejected_quantity numeric(14,3) not null default 0,
  status text not null default 'completed',
  observation text,
  operation_key uuid not null,
  operation_payload_hash text not null,
  inspected_by uuid not null references auth.users(id) on delete restrict,
  inspected_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  supersedes_inspection_id uuid,
  voided_by uuid references auth.users(id) on delete restrict,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_receipt_inspections_organization_id_id_key unique (organization_id, id),
  constraint purchase_receipt_inspections_receipt_fk
    foreign key (organization_id, purchase_receipt_id)
    references public.purchase_receipts (organization_id, id) on delete restrict,
  constraint purchase_receipt_inspections_receipt_item_fk
    foreign key (organization_id, purchase_receipt_item_id)
    references public.purchase_receipt_items (organization_id, id) on delete restrict,
  constraint purchase_receipt_inspections_order_fk
    foreign key (organization_id, purchase_order_id)
    references public.purchase_orders (organization_id, id) on delete restrict,
  constraint purchase_receipt_inspections_order_item_fk
    foreign key (organization_id, purchase_order_item_id)
    references public.purchase_order_items (organization_id, id) on delete restrict,
  constraint purchase_receipt_inspections_supplier_fk
    foreign key (organization_id, supplier_id)
    references public.suppliers (organization_id, id) on delete restrict,
  constraint purchase_receipt_inspections_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint purchase_receipt_inspections_supersedes_fk
    foreign key (organization_id, supersedes_inspection_id)
    references public.purchase_receipt_inspections (organization_id, id) on delete restrict,
  constraint purchase_receipt_inspections_quantities_valid
    check (
      inspected_quantity > 0
      and accepted_quantity >= 0
      and rejected_quantity >= 0
      and inspected_quantity = accepted_quantity + rejected_quantity
    ),
  constraint purchase_receipt_inspections_status_valid
    check (status in ('completed', 'voided')),
  constraint purchase_receipt_inspections_status_consistent
    check (
      (status = 'completed' and completed_at is not null and voided_at is null and voided_by is null)
      or
      (status = 'voided' and completed_at is not null and voided_at is not null and voided_by is not null)
    ),
  constraint purchase_receipt_inspections_observation_length
    check (observation is null or char_length(btrim(observation)) <= 600),
  constraint purchase_receipt_inspections_operation_payload_hash_format
    check (operation_payload_hash ~ '^[0-9a-f]{64}$'),
  constraint purchase_receipt_inspections_void_reason_length
    check (void_reason is null or char_length(btrim(void_reason)) between 5 and 600)
);

create unique index purchase_receipt_inspections_active_item_unique
  on public.purchase_receipt_inspections (organization_id, purchase_receipt_item_id)
  where status = 'completed';

create unique index purchase_receipt_inspections_operation_item_unique
  on public.purchase_receipt_inspections (organization_id, operation_key, purchase_receipt_item_id);

create index purchase_receipt_inspections_order_idx
  on public.purchase_receipt_inspections (organization_id, purchase_order_id, inspected_at desc, id);

create index purchase_receipt_inspections_supplier_product_idx
  on public.purchase_receipt_inspections (organization_id, supplier_id, product_id, inspected_at desc, id);

create table public.purchase_receipt_inspection_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  inspection_id uuid not null,
  reason_code text not null,
  reason_text text,
  quantity numeric(14,3) not null,
  created_at timestamptz not null default now(),
  constraint purchase_receipt_inspection_reasons_organization_id_id_key unique (organization_id, id),
  constraint purchase_receipt_inspection_reasons_inspection_fk
    foreign key (organization_id, inspection_id)
    references public.purchase_receipt_inspections (organization_id, id) on delete restrict,
  constraint purchase_receipt_inspection_reasons_code_valid
    check (reason_code in ('quality', 'documentation', 'quantity_mismatch', 'other')),
  constraint purchase_receipt_inspection_reasons_text_length
    check (reason_text is null or char_length(btrim(reason_text)) between 3 and 600),
  constraint purchase_receipt_inspection_reasons_other_text_required
    check (reason_code <> 'other' or (reason_text is not null and char_length(btrim(reason_text)) between 3 and 600)),
  constraint purchase_receipt_inspection_reasons_quantity_positive
    check (quantity > 0)
);

create index purchase_receipt_inspection_reasons_inspection_idx
  on public.purchase_receipt_inspection_reasons (organization_id, inspection_id, id);

comment on table public.purchase_receipt_inspections is
  'Resultado inmutable de inspeccion de una recepcion. purchase_receipt_items conserva la cantidad fisica documentada.';
comment on table public.purchase_receipt_inspection_reasons is
  'Motivos estructurados de rechazo de recepcion; la taxonomia inicial es tecnica y extensible.';

create or replace function public.set_purchase_receipt_inspection_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger purchase_receipt_inspections_set_updated_at
before update on public.purchase_receipt_inspections
for each row execute function public.set_purchase_receipt_inspection_updated_at();

create or replace function public.validate_purchase_receipt_inspection_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_row record;
begin
  select
    source_item.organization_id,
    source_item.receipt_id,
    source_item.purchase_order_item_id,
    source_item.product_id,
    source_item.quantity,
    source_item.fulfillment_mode,
    receipt.purchase_order_id,
    purchase.supplier_id,
    order_item.product_id as order_product_id,
    order_item.product_type
  into source_row
  from public.purchase_receipt_items source_item
    join public.purchase_receipts receipt
      on receipt.organization_id = source_item.organization_id
     and receipt.id = source_item.receipt_id
    join public.purchase_orders purchase
      on purchase.organization_id = receipt.organization_id
     and purchase.id = receipt.purchase_order_id
    join public.purchase_order_items order_item
      on order_item.organization_id = source_item.organization_id
     and order_item.id = source_item.purchase_order_item_id
  where source_item.organization_id = new.organization_id
    and source_item.id = new.purchase_receipt_item_id;

  if not found
    or source_row.receipt_id is distinct from new.purchase_receipt_id
    or source_row.purchase_order_item_id is distinct from new.purchase_order_item_id
    or source_row.product_id is distinct from new.product_id
    or source_row.purchase_order_id is distinct from new.purchase_order_id
    or source_row.supplier_id is distinct from new.supplier_id
    or source_row.order_product_id is distinct from new.product_id
    or source_row.product_type is distinct from 'good'
    or source_row.fulfillment_mode is distinct from 'physical'
  then
    raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_INSPECTION_SOURCE_INVALID';
  end if;

  if new.inspected_quantity is distinct from source_row.quantity then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_QUANTITY_MISMATCH';
  end if;

  return new;
end;
$$;

create trigger purchase_receipt_inspections_validate_source
before insert or update on public.purchase_receipt_inspections
for each row execute function public.validate_purchase_receipt_inspection_source();

create or replace function public.validate_purchase_receipt_inspection_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  inspection_id_value uuid;
  inspection_row public.purchase_receipt_inspections%rowtype;
  reasons_total numeric;
begin
  if tg_table_name = 'purchase_receipt_inspections' then
    inspection_id_value := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    inspection_id_value := case when tg_op = 'DELETE' then old.inspection_id else new.inspection_id end;
  end if;

  select *
  into inspection_row
  from public.purchase_receipt_inspections inspection
  where inspection.organization_id = case
    when tg_op = 'DELETE' then old.organization_id
    else new.organization_id
  end
    and inspection.id = inspection_id_value;

  if not found then
    return null;
  end if;

  select coalesce(sum(reason.quantity), 0)
  into reasons_total
  from public.purchase_receipt_inspection_reasons reason
  where reason.organization_id = inspection_row.organization_id
    and reason.inspection_id = inspection_row.id;

  if inspection_row.status = 'completed'
    and reasons_total is distinct from inspection_row.rejected_quantity
  then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_REASONS_TOTAL_MISMATCH';
  end if;

  if inspection_row.rejected_quantity = 0 and reasons_total <> 0 then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_REASONS_UNEXPECTED';
  end if;

  return null;
end;
$$;

create constraint trigger purchase_receipt_inspections_validate_totals
after insert or update on public.purchase_receipt_inspections
deferrable initially deferred
for each row execute function public.validate_purchase_receipt_inspection_totals();

create constraint trigger purchase_receipt_inspection_reasons_validate_totals
after insert or update or delete on public.purchase_receipt_inspection_reasons
deferrable initially deferred
for each row execute function public.validate_purchase_receipt_inspection_totals();

create or replace function public.reject_purchase_receipt_inspection_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'PURCHASE_RECEIPT_INSPECTION_IMMUTABLE';
  end if;

  if old.status = 'voided' then
    raise exception using errcode = '55000', message = 'PURCHASE_RECEIPT_INSPECTION_IMMUTABLE';
  end if;

  if old.status = 'completed' then
    if new.status <> 'voided'
      or new.id is distinct from old.id
      or new.organization_id is distinct from old.organization_id
      or new.purchase_receipt_id is distinct from old.purchase_receipt_id
      or new.purchase_receipt_item_id is distinct from old.purchase_receipt_item_id
      or new.purchase_order_id is distinct from old.purchase_order_id
      or new.purchase_order_item_id is distinct from old.purchase_order_item_id
      or new.supplier_id is distinct from old.supplier_id
      or new.product_id is distinct from old.product_id
      or new.inspected_quantity is distinct from old.inspected_quantity
      or new.accepted_quantity is distinct from old.accepted_quantity
      or new.rejected_quantity is distinct from old.rejected_quantity
      or new.status is distinct from 'voided'
      or new.operation_key is distinct from old.operation_key
      or new.operation_payload_hash is distinct from old.operation_payload_hash
      or new.inspected_by is distinct from old.inspected_by
      or new.inspected_at is distinct from old.inspected_at
      or new.completed_at is distinct from old.completed_at
      or new.supersedes_inspection_id is distinct from old.supersedes_inspection_id
      or new.observation is distinct from old.observation
    then
      raise exception using errcode = '55000', message = 'PURCHASE_RECEIPT_INSPECTION_IMMUTABLE';
    end if;
    return new;
  end if;

  raise exception using errcode = '55000', message = 'PURCHASE_RECEIPT_INSPECTION_IMMUTABLE';
end;
$$;

create trigger purchase_receipt_inspections_immutable
before update or delete on public.purchase_receipt_inspections
for each row execute function public.reject_purchase_receipt_inspection_mutation();

create or replace function public.reject_purchase_receipt_inspection_reason_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'PURCHASE_RECEIPT_INSPECTION_REASON_IMMUTABLE';
end;
$$;

create trigger purchase_receipt_inspection_reasons_immutable
before update or delete on public.purchase_receipt_inspection_reasons
for each row execute function public.reject_purchase_receipt_inspection_reason_mutation();

alter table public.purchase_receipt_inspections enable row level security;
alter table public.purchase_receipt_inspection_reasons enable row level security;

create policy purchase_receipt_inspections_select_authorized
on public.purchase_receipt_inspections
for select to authenticated
using ((select public.has_organization_permission(organization_id, 'PURCHASES_VIEW')));

create policy purchase_receipt_inspection_reasons_select_authorized
on public.purchase_receipt_inspection_reasons
for select to authenticated
using ((select public.has_organization_permission(organization_id, 'PURCHASES_VIEW')));

revoke all on table public.purchase_receipt_inspections, public.purchase_receipt_inspection_reasons
from anon, authenticated;
grant select on table public.purchase_receipt_inspections, public.purchase_receipt_inspection_reasons
to authenticated;
grant select, insert, update, delete on table public.purchase_receipt_inspections, public.purchase_receipt_inspection_reasons
to service_role;

create view public.purchase_receipt_inspection_details
with (security_invoker = true)
as
select
  inspection.organization_id,
  inspection.id,
  inspection.purchase_receipt_id,
  inspection.purchase_receipt_item_id,
  inspection.purchase_order_id,
  inspection.purchase_order_item_id,
  inspection.supplier_id,
  inspection.product_id,
  order_item.product_code,
  order_item.product_description,
  order_item.unit_of_measure,
  receipt_item.quantity as received_quantity,
  receipt_item.lot,
  receipt_item.expiration_date,
  inspection.inspected_quantity,
  inspection.accepted_quantity,
  inspection.rejected_quantity,
  inspection.status,
  inspection.observation,
  inspection.inspected_by,
  inspection.inspected_at,
  inspection.completed_at,
  inspection.supersedes_inspection_id,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', reason.id,
        'reason_code', reason.reason_code,
        'reason_text', reason.reason_text,
        'quantity', reason.quantity
      )
      order by reason.id
    ) filter (where reason.id is not null),
    '[]'::jsonb
  ) as reasons
from public.purchase_receipt_inspections inspection
join public.purchase_receipt_items receipt_item
  on receipt_item.organization_id = inspection.organization_id
 and receipt_item.id = inspection.purchase_receipt_item_id
join public.purchase_order_items order_item
  on order_item.organization_id = inspection.organization_id
 and order_item.id = inspection.purchase_order_item_id
left join public.purchase_receipt_inspection_reasons reason
  on reason.organization_id = inspection.organization_id
 and reason.inspection_id = inspection.id
group by
  inspection.organization_id,
  inspection.id,
  inspection.purchase_receipt_id,
  inspection.purchase_receipt_item_id,
  inspection.purchase_order_id,
  inspection.purchase_order_item_id,
  inspection.supplier_id,
  inspection.product_id,
  order_item.product_code,
  order_item.product_description,
  order_item.unit_of_measure,
  receipt_item.quantity,
  receipt_item.lot,
  receipt_item.expiration_date,
  inspection.inspected_quantity,
  inspection.accepted_quantity,
  inspection.rejected_quantity,
  inspection.status,
  inspection.observation,
  inspection.inspected_by,
  inspection.inspected_at,
  inspection.completed_at,
  inspection.supersedes_inspection_id;

revoke all on table public.purchase_receipt_inspection_details from anon, authenticated;
grant select on table public.purchase_receipt_inspection_details to authenticated;

-- Nuevo camino de recepcion para el frontend E4C. El RPC legado permanece
-- disponible para callers historicos; cuando no se envia inspection, este
-- camino conserva exactamente la semantica anterior.
create or replace function public.receive_purchase_order_partial_inspected(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid;
  order_id uuid;
  idempotency_key uuid;
  receipt_id uuid;
  existing_receipt public.purchase_receipts%rowtype;
  existing_receipt_found boolean := false;
  order_row public.purchase_orders%rowtype;
  updated_order public.purchase_orders%rowtype;
  warehouse_row public.warehouses%rowtype;
  item_payload jsonb;
  item_row public.purchase_order_items%rowtype;
  receipt_item_id uuid;
  inspection_id uuid;
  inspection_payload jsonb;
  canonical_item jsonb;
  canonical_inspection jsonb;
  canonical_findings jsonb;
  finding_payload jsonb;
  reason_code_value text;
  reason_text_value text;
  quantity_value numeric;
  inspected_quantity_value numeric;
  accepted_quantity_value numeric;
  rejected_quantity_value numeric;
  finding_quantity_value numeric;
  findings_total numeric;
  lot_value text;
  expiration_value date;
  fulfillment_mode_value text;
  location_id_value uuid;
  already_received numeric;
  payload_received numeric;
  item_count integer := 0;
  physical_item_count integer := 0;
  administrative_item_count integer := 0;
  inspected_item_count integer := 0;
  physical_quantity numeric := 0;
  physical_accepted_quantity numeric := 0;
  physical_rejected_quantity numeric := 0;
  administrative_quantity numeric := 0;
  completed boolean;
  notes_value text;
  observation_value text;
  canonical_items jsonb := '[]'::jsonb;
  canonical_payload jsonb;
  request_payload_hash text;
  items_input jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_PAYLOAD_INVALID';
  end if;

  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  order_id := nullif(payload ->> 'purchase_order_id', '')::uuid;
  idempotency_key := nullif(payload ->> 'operation_key', '')::uuid;

  if organization_id is null or order_id is null then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_PAYLOAD_INVALID';
  end if;
  if idempotency_key is null then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_OPERATION_KEY_REQUIRED';
  end if;
  if actor_id is null
    or not public.has_organization_permission(organization_id, 'PURCHASES_RECEIVE')
  then
    raise exception using errcode = '42501', message = 'PURCHASE_RECEIPT_FORBIDDEN';
  end if;
  if payload ? 'items'
    and payload -> 'items' <> 'null'::jsonb
    and jsonb_typeof(payload -> 'items') <> 'array'
  then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_ITEMS_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text || ':purchase-receipt-operation:' || idempotency_key::text,
    0
  ));

  select *
  into existing_receipt
  from public.purchase_receipts receipt
  where receipt.organization_id = organization_id
    and receipt.operation_key = idempotency_key
  for update;
  existing_receipt_found := found;

  if existing_receipt_found and existing_receipt.purchase_order_id is distinct from order_id then
    raise exception using errcode = '23505', message = 'PURCHASE_RECEIPT_KEY_CONFLICT';
  end if;

  if existing_receipt_found and existing_receipt.operation_payload_hash is null then
    raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_IDEMPOTENCY_LEGACY_UNVERIFIABLE';
  end if;

  select *
  into order_row
  from public.purchase_orders purchase
  where purchase.id = order_id
    and purchase.organization_id = organization_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_RECEIVABLE';
  end if;

  items_input := case
    when payload -> 'items' is null or payload -> 'items' = 'null'::jsonb then '[]'::jsonb
    else payload -> 'items'
  end;
  notes_value := nullif(btrim(coalesce(payload ->> 'notes', '')), '');

  -- Primera pasada: canoniza y valida tambien la inspeccion para que el hash
  -- de idempotencia cubra cantidades y motivos.
  for item_payload in select value from jsonb_array_elements(items_input)
  loop
    select *
    into item_row
    from public.purchase_order_items item
    where item.id = nullif(item_payload ->> 'purchase_order_item_id', '')::uuid
      and item.organization_id = organization_id
      and item.purchase_order_id = order_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_ORDER_ITEM_INVALID';
    end if;
    if item_row.product_type is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_PRODUCT_TYPE_UNKNOWN';
    end if;

    quantity_value := nullif(item_payload ->> 'quantity', '')::numeric::numeric(14, 3);
    if quantity_value is null or quantity_value <= 0 then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_QUANTITY_INVALID';
    end if;

    fulfillment_mode_value := coalesce(
      nullif(lower(btrim(item_payload ->> 'fulfillment_mode')), ''),
      case item_row.product_type when 'good' then 'physical' when 'service' then 'administrative' end
    );
    if fulfillment_mode_value not in ('physical', 'administrative') then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_FULFILLMENT_MODE_INVALID';
    end if;
    if (item_row.product_type = 'good' and fulfillment_mode_value <> 'physical')
      or (item_row.product_type = 'service' and fulfillment_mode_value <> 'administrative')
    then
      raise exception using errcode = 'P0001',
        message = case when item_row.product_type = 'good'
          then 'PURCHASE_RECEIPT_GOOD_ADMINISTRATIVE_FORBIDDEN'
          else 'PURCHASE_RECEIPT_SERVICE_PHYSICAL_FORBIDDEN' end;
    end if;

    canonical_item := jsonb_build_object(
      'purchase_order_item_id', item_row.id,
      'quantity', public.normalize_commercial_idempotency_numeric(quantity_value),
      'fulfillment_mode', fulfillment_mode_value,
      'location_id', case when fulfillment_mode_value = 'physical'
        then nullif(item_payload ->> 'location_id', '')::uuid else null end,
      'lot', case when fulfillment_mode_value = 'physical'
        then nullif(btrim(item_payload ->> 'lot'), '') else null end,
      'expiration_date', case when fulfillment_mode_value = 'physical'
        then nullif(item_payload ->> 'expiration_date', '')::date else null end
    );

    if fulfillment_mode_value = 'physical'
      and item_payload ? 'inspection'
      and item_payload -> 'inspection' <> 'null'::jsonb
    then
      inspection_payload := item_payload -> 'inspection';
      if jsonb_typeof(inspection_payload) <> 'object' then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_INVALID';
      end if;
      inspected_quantity_value := nullif(inspection_payload ->> 'inspected_quantity', '')::numeric::numeric(14, 3);
      accepted_quantity_value := nullif(inspection_payload ->> 'accepted_quantity', '')::numeric::numeric(14, 3);
      rejected_quantity_value := coalesce(nullif(inspection_payload ->> 'rejected_quantity', '')::numeric, 0)::numeric(14, 3);
      if inspected_quantity_value is null
        or accepted_quantity_value is null
        or inspected_quantity_value <> quantity_value
        or accepted_quantity_value < 0
        or rejected_quantity_value < 0
        or inspected_quantity_value <> accepted_quantity_value + rejected_quantity_value
      then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_QUANTITY_INVALID';
      end if;

      canonical_findings := '[]'::jsonb;
      findings_total := 0;
      if inspection_payload ? 'findings'
        and inspection_payload -> 'findings' <> 'null'::jsonb
      then
        if jsonb_typeof(inspection_payload -> 'findings') <> 'array' then
          raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_REASONS_INVALID';
        end if;
        for finding_payload in select value from jsonb_array_elements(inspection_payload -> 'findings')
        loop
          reason_code_value := lower(nullif(btrim(finding_payload ->> 'reason_code'), ''));
          reason_text_value := nullif(btrim(finding_payload ->> 'reason_text'), '');
          finding_quantity_value := nullif(finding_payload ->> 'quantity', '')::numeric::numeric(14, 3);
          if reason_code_value not in ('quality', 'documentation', 'quantity_mismatch', 'other')
            or finding_quantity_value is null
            or finding_quantity_value <= 0
            or (reason_code_value = 'other' and (reason_text_value is null or char_length(reason_text_value) < 3))
          then
            raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_REASON_INVALID';
          end if;
          findings_total := findings_total + finding_quantity_value;
          canonical_findings := canonical_findings || jsonb_build_array(jsonb_build_object(
            'reason_code', reason_code_value,
            'reason_text', reason_text_value,
            'quantity', public.normalize_commercial_idempotency_numeric(finding_quantity_value)
          ));
        end loop;
      end if;
      if findings_total <> rejected_quantity_value then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_REASONS_TOTAL_MISMATCH';
      end if;
      select coalesce(jsonb_agg(item order by
          item ->> 'reason_code',
          coalesce(item ->> 'reason_text', ''),
          item ->> 'quantity'
        ), '[]'::jsonb)
      into canonical_findings
      from jsonb_array_elements(canonical_findings) as elements(item);

      observation_value := nullif(btrim(coalesce(inspection_payload ->> 'observation', '')), '');
      if observation_value is not null and char_length(observation_value) > 600 then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_OBSERVATION_INVALID';
      end if;
      canonical_inspection := jsonb_build_object(
        'inspected_quantity', public.normalize_commercial_idempotency_numeric(inspected_quantity_value),
        'accepted_quantity', public.normalize_commercial_idempotency_numeric(accepted_quantity_value),
        'rejected_quantity', public.normalize_commercial_idempotency_numeric(rejected_quantity_value),
        'observation', observation_value,
        'findings', canonical_findings
      );
      canonical_item := canonical_item || jsonb_build_object('inspection', canonical_inspection);
    elsif fulfillment_mode_value = 'administrative'
      and item_payload ? 'inspection'
      and item_payload -> 'inspection' <> 'null'::jsonb
    then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_SERVICE_FORBIDDEN';
    end if;

    canonical_items := canonical_items || jsonb_build_array(canonical_item);
  end loop;

  select coalesce(jsonb_agg(item order by
      item ->> 'purchase_order_item_id',
      item ->> 'fulfillment_mode',
      coalesce(item ->> 'location_id', ''),
      coalesce(item ->> 'lot', ''),
      coalesce(item ->> 'expiration_date', ''),
      item ->> 'quantity',
      coalesce(item -> 'inspection' ->> 'accepted_quantity', '')
    ), '[]'::jsonb)
  into canonical_items
  from jsonb_array_elements(canonical_items) as elements(item);

  canonical_payload := jsonb_build_object(
    'organization_id', organization_id,
    'purchase_order_id', order_id,
    'warehouse_id', order_row.warehouse_id,
    'notes', notes_value,
    'items', canonical_items
  );
  request_payload_hash := encode(
    extensions.digest(canonical_payload::text, 'sha256'),
    'hex'
  );

  if existing_receipt_found then
    if existing_receipt.operation_payload_hash is distinct from request_payload_hash then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_receipt.id;
  end if;

  if order_row.status not in ('issued', 'partially_received') then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_RECEIVABLE';
  end if;
  if jsonb_typeof(payload -> 'items') <> 'array'
    or jsonb_array_length(payload -> 'items') = 0
  then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_ITEMS_REQUIRED';
  end if;

  select *
  into warehouse_row
  from public.warehouses warehouse
  where warehouse.id = order_row.warehouse_id
    and warehouse.organization_id = organization_id
    and warehouse.is_active;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE';
  end if;

  -- Segunda pasada: valida snapshots, saldo y ubicacion antes de escribir.
  for item_payload in select value from jsonb_array_elements(payload -> 'items')
  loop
    quantity_value := nullif(item_payload ->> 'quantity', '')::numeric::numeric(14, 3);
    fulfillment_mode_value := nullif(lower(btrim(item_payload ->> 'fulfillment_mode')), '');
    select *
    into item_row
    from public.purchase_order_items item
    where item.organization_id = organization_id
      and item.purchase_order_id = order_id
      and item.id = (item_payload ->> 'purchase_order_item_id')::uuid;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_ORDER_ITEM_INVALID';
    end if;
    fulfillment_mode_value := coalesce(
      fulfillment_mode_value,
      case item_row.product_type when 'good' then 'physical' when 'service' then 'administrative' end
    );
    if item_row.product_type is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_PRODUCT_TYPE_UNKNOWN';
    end if;
    if item_row.expiration_control is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_EXPIRATION_CONTROL_UNKNOWN';
    end if;

    perform 1
    from public.products product
    where product.id = item_row.product_id
      and product.organization_id = organization_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE';
    end if;

    if fulfillment_mode_value = 'physical' then
      lot_value := nullif(btrim(item_payload ->> 'lot'), '');
      expiration_value := nullif(item_payload ->> 'expiration_date', '')::date;
      location_id_value := nullif(item_payload ->> 'location_id', '')::uuid;
      if item_row.batch_control and lot_value is null then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_LOT_REQUIRED';
      end if;
      if item_row.expiration_control and expiration_value is null then
        raise exception using errcode = '22023', message = 'PURCHASE_ORDER_EXPIRATION_REQUIRED';
      end if;
      perform 1
      from public.warehouse_locations location
      where location.id = location_id_value
        and location.organization_id = organization_id
        and location.warehouse_id = warehouse_row.id
        and location.is_active;
      if not found then
        raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_LOCATION_INVALID';
      end if;
    else
      lot_value := null;
      expiration_value := null;
      location_id_value := null;
    end if;

    select coalesce(sum(receipt_item.quantity), 0)
    into already_received
    from public.purchase_receipt_items receipt_item
    where receipt_item.organization_id = organization_id
      and receipt_item.purchase_order_item_id = item_row.id;
    select coalesce(sum((prior.value ->> 'quantity')::numeric), 0)
    into payload_received
    from jsonb_array_elements(canonical_items) with ordinality prior(value, position)
    where (prior.value ->> 'purchase_order_item_id')::uuid = item_row.id;
    if already_received + payload_received > item_row.quantity then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_EXCEEDS_ORDERED_QUANTITY';
    end if;
  end loop;

  insert into public.purchase_receipts (
    organization_id, purchase_order_id, warehouse_id, operation_key,
    operation_payload_hash, received_by, notes
  ) values (
    organization_id, order_id, warehouse_row.id, idempotency_key,
    request_payload_hash, actor_id, notes_value
  )
  returning id into receipt_id;

  for item_payload in select value from jsonb_array_elements(payload -> 'items')
  loop
    select *
    into item_row
    from public.purchase_order_items item
    where item.organization_id = organization_id
      and item.purchase_order_id = order_id
      and item.id = (item_payload ->> 'purchase_order_item_id')::uuid;

    quantity_value := (item_payload ->> 'quantity')::numeric::numeric(14, 3);
    fulfillment_mode_value := coalesce(
      nullif(lower(btrim(item_payload ->> 'fulfillment_mode')), ''),
      case item_row.product_type when 'good' then 'physical' when 'service' then 'administrative' end
    );
    lot_value := case when fulfillment_mode_value = 'physical' then nullif(btrim(item_payload ->> 'lot'), '') end;
    expiration_value := case when fulfillment_mode_value = 'physical' then nullif(item_payload ->> 'expiration_date', '')::date end;
    location_id_value := case when fulfillment_mode_value = 'physical'
      then nullif(item_payload ->> 'location_id', '')::uuid end;

    insert into public.purchase_receipt_items (
      organization_id, receipt_id, purchase_order_item_id, product_id,
      warehouse_id, location_id, quantity, unit_cost, lot, expiration_date,
      fulfillment_mode
    ) values (
      organization_id, receipt_id, item_row.id, item_row.product_id,
      case when fulfillment_mode_value = 'physical' then warehouse_row.id else null end,
      location_id_value, quantity_value, item_row.unit_cost, lot_value,
      expiration_value, fulfillment_mode_value
    )
    returning id into receipt_item_id;

    inspection_payload := item_payload -> 'inspection';
    if fulfillment_mode_value = 'physical'
      and inspection_payload is not null
      and jsonb_typeof(inspection_payload) = 'object'
    then
      inspected_quantity_value := (inspection_payload ->> 'inspected_quantity')::numeric::numeric(14, 3);
      accepted_quantity_value := (inspection_payload ->> 'accepted_quantity')::numeric::numeric(14, 3);
      rejected_quantity_value := coalesce((inspection_payload ->> 'rejected_quantity')::numeric, 0)::numeric(14, 3);
      observation_value := nullif(btrim(coalesce(inspection_payload ->> 'observation', '')), '');

      insert into public.purchase_receipt_inspections (
        organization_id, purchase_receipt_id, purchase_receipt_item_id,
        purchase_order_id, purchase_order_item_id, supplier_id, product_id,
        inspected_quantity, accepted_quantity, rejected_quantity, status,
        observation, operation_key, operation_payload_hash, inspected_by
      ) values (
        organization_id, receipt_id, receipt_item_id,
        order_id, item_row.id, order_row.supplier_id, item_row.product_id,
        inspected_quantity_value, accepted_quantity_value, rejected_quantity_value,
        'completed', observation_value, idempotency_key,
        encode(extensions.digest(inspection_payload::text, 'sha256'), 'hex'),
        actor_id
      )
      returning id into inspection_id;

      for finding_payload in select value from jsonb_array_elements(inspection_payload -> 'findings')
      loop
        insert into public.purchase_receipt_inspection_reasons (
          organization_id, inspection_id, reason_code, reason_text, quantity
        ) values (
          organization_id,
          inspection_id,
          lower(nullif(btrim(finding_payload ->> 'reason_code'), '')),
          nullif(btrim(finding_payload ->> 'reason_text'), ''),
          (finding_payload ->> 'quantity')::numeric::numeric(14, 3)
        );
      end loop;
      insert into public.audit_events (
        organization_id, actor_user_id, action, entity_type, entity_id,
        new_values, metadata
      ) values (
        organization_id,
        actor_id,
        'PURCHASE_RECEIPT_INSPECTION_COMPLETED',
        'purchase_receipt_inspection',
        inspection_id::text,
        jsonb_build_object(
          'purchase_receipt_item_id', receipt_item_id,
          'inspected_quantity', inspected_quantity_value,
          'accepted_quantity', accepted_quantity_value,
          'rejected_quantity', rejected_quantity_value,
          'lot', lot_value,
          'expiration_date', expiration_value
        ),
        jsonb_build_object('operation_key', idempotency_key)
      );
      inspected_item_count := inspected_item_count + 1;
      physical_accepted_quantity := physical_accepted_quantity + accepted_quantity_value;
      physical_rejected_quantity := physical_rejected_quantity + rejected_quantity_value;
    else
      accepted_quantity_value := quantity_value;
    end if;

    item_count := item_count + 1;
    if fulfillment_mode_value = 'physical' then
      physical_item_count := physical_item_count + 1;
      physical_quantity := physical_quantity + quantity_value;
      if accepted_quantity_value > 0 then
        insert into public.inventory_movements (
          organization_id, product_id, product_code, product_description,
          unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
          location_id, stock_status, unit_cost, lot, expiration_date,
          operation_date, reason, source_type, source_id, created_by
        ) values (
          organization_id, item_row.product_id, item_row.product_code,
          item_row.product_description, item_row.unit_of_measure, 'entrada',
          accepted_quantity_value, warehouse_row.name, warehouse_row.id,
          location_id_value, 'available', item_row.unit_cost, lot_value,
          expiration_value, current_date,
          left('Recepcion aceptada de ' || order_row.document_type || ' ' ||
            order_row.series || '-' || order_row.document_number, 180),
          'purchase-receipt', receipt_item_id, actor_id
        );
      end if;
    else
      administrative_item_count := administrative_item_count + 1;
      administrative_quantity := administrative_quantity + quantity_value;
    end if;
  end loop;

  select not exists (
    select 1
    from public.purchase_order_items item
    left join lateral (
      select coalesce(sum(receipt_item.quantity), 0) quantity
      from public.purchase_receipt_items receipt_item
      where receipt_item.organization_id = organization_id
        and receipt_item.purchase_order_item_id = item.id
    ) received on true
    where item.organization_id = organization_id
      and item.purchase_order_id = order_id
      and received.quantity < item.quantity
  )
  into completed;

  update public.purchase_orders purchase
  set status = case when completed then 'received' else 'partially_received' end,
      received_at = case when completed then now() else null end,
      received_by = case when completed then actor_id else null end,
      updated_by = actor_id,
      warehouse = warehouse_row.name
  where purchase.id = order_id
  returning * into updated_order;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    organization_id, actor_id, 'PURCHASE_RECEIPT_CONFIRMED',
    'purchase_receipt', receipt_id::text, null,
    jsonb_build_object('purchase_order_id', order_id, 'status', updated_order.status),
    jsonb_build_object(
      'items_received', item_count,
      'physical_items', physical_item_count,
      'physical_quantity', physical_quantity,
      'physical_accepted_quantity', physical_accepted_quantity,
      'physical_rejected_quantity', physical_rejected_quantity,
      'inspected_items', inspected_item_count,
      'administrative_items', administrative_item_count,
      'administrative_quantity', administrative_quantity,
      'operation_key', idempotency_key
    )
  );
  return receipt_id;
exception
  when unique_violation then
    if idempotency_key is not null then
      select *
      into existing_receipt
      from public.purchase_receipts receipt
      where receipt.organization_id = organization_id
        and receipt.operation_key = idempotency_key
      for update;
      if found then
        if existing_receipt.purchase_order_id is distinct from order_id then
          raise exception using errcode = '23505', message = 'PURCHASE_RECEIPT_KEY_CONFLICT';
        end if;
        if existing_receipt.operation_payload_hash is null then
          raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_IDEMPOTENCY_LEGACY_UNVERIFIABLE';
        end if;
        if existing_receipt.operation_payload_hash is distinct from request_payload_hash then
          raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_IDEMPOTENCY_CONFLICT';
        end if;
        return existing_receipt.id;
      end if;
    end if;
    raise;
end;
$$;

revoke all on function public.receive_purchase_order_partial_inspected(jsonb)
from public, anon, authenticated;
grant execute on function public.receive_purchase_order_partial_inspected(jsonb)
to authenticated;

-- Las correcciones solo sustituyen motivos/observaciones con las mismas
-- cantidades ya contabilizadas. Cambiar cantidades despues de postear stock
-- requeriria una reconciliacion de inventario distinta y no se permite aqui.
create or replace function public.correct_purchase_receipt_inspection(
  requested_organization_id uuid,
  requested_inspection_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  operation_key_value uuid;
  old_inspection public.purchase_receipt_inspections%rowtype;
  existing_inspection public.purchase_receipt_inspections%rowtype;
  replacement_id uuid;
  finding_payload jsonb;
  reason_code_value text;
  reason_text_value text;
  finding_quantity_value numeric;
  findings_total numeric := 0;
  observation_value text;
  operation_payload_hash_value text;
begin
  if actor_id is null
    or not public.has_organization_permission(requested_organization_id, 'PURCHASES_MANAGE')
  then
    raise exception using errcode = '42501', message = 'PURCHASE_RECEIPT_INSPECTION_CORRECTION_FORBIDDEN';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_CORRECTION_INVALID';
  end if;

  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  if operation_key_value is null then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_OPERATION_KEY_REQUIRED';
  end if;
  operation_payload_hash_value := encode(
    extensions.digest(payload::text, 'sha256'),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    requested_organization_id::text || ':purchase-receipt-inspection-correction:' ||
      requested_inspection_id::text,
    0
  ));

  select *
  into existing_inspection
  from public.purchase_receipt_inspections inspection
  where inspection.organization_id = requested_organization_id
    and inspection.operation_key = operation_key_value
    and inspection.status = 'completed'
  order by inspection.created_at desc, inspection.id desc
  limit 1
  for update;
  if found then
    if existing_inspection.operation_payload_hash is distinct from operation_payload_hash_value then
      raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_INSPECTION_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_inspection.id;
  end if;

  select *
  into old_inspection
  from public.purchase_receipt_inspections inspection
  where inspection.organization_id = requested_organization_id
    and inspection.id = requested_inspection_id
  for update;
  if not found or old_inspection.status <> 'completed' then
    raise exception using errcode = 'P0001', message = 'PURCHASE_RECEIPT_INSPECTION_NOT_CORRECTABLE';
  end if;

  if payload ? 'inspected_quantity'
    and (payload ->> 'inspected_quantity')::numeric::numeric(14, 3) is distinct from old_inspection.inspected_quantity
  then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_QUANTITY_CORRECTION_FORBIDDEN';
  end if;
  if payload ? 'accepted_quantity'
    and (payload ->> 'accepted_quantity')::numeric::numeric(14, 3) is distinct from old_inspection.accepted_quantity
  then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_QUANTITY_CORRECTION_FORBIDDEN';
  end if;
  if payload ? 'rejected_quantity'
    and (payload ->> 'rejected_quantity')::numeric::numeric(14, 3) is distinct from old_inspection.rejected_quantity
  then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_QUANTITY_CORRECTION_FORBIDDEN';
  end if;

  observation_value := nullif(btrim(coalesce(payload ->> 'observation', '')), '');
  if observation_value is not null and char_length(observation_value) > 600 then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_OBSERVATION_INVALID';
  end if;

  if payload ? 'findings' and payload -> 'findings' <> 'null'::jsonb then
    if jsonb_typeof(payload -> 'findings') <> 'array' then
      raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_REASONS_INVALID';
    end if;
    for finding_payload in select value from jsonb_array_elements(payload -> 'findings')
    loop
      reason_code_value := lower(nullif(btrim(finding_payload ->> 'reason_code'), ''));
      reason_text_value := nullif(btrim(finding_payload ->> 'reason_text'), '');
      finding_quantity_value := nullif(finding_payload ->> 'quantity', '')::numeric::numeric(14, 3);
      if reason_code_value not in ('quality', 'documentation', 'quantity_mismatch', 'other')
        or finding_quantity_value is null
        or finding_quantity_value <= 0
        or (reason_code_value = 'other' and (reason_text_value is null or char_length(reason_text_value) < 3))
      then
        raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_REASON_INVALID';
      end if;
      findings_total := findings_total + finding_quantity_value;
    end loop;
  end if;
  if findings_total <> old_inspection.rejected_quantity then
    raise exception using errcode = '22023', message = 'PURCHASE_RECEIPT_INSPECTION_REASONS_TOTAL_MISMATCH';
  end if;

  update public.purchase_receipt_inspections inspection
  set status = 'voided',
      voided_by = actor_id,
      voided_at = now(),
      void_reason = 'Correccion auditada de inspeccion',
      updated_at = now()
  where inspection.organization_id = requested_organization_id
    and inspection.id = old_inspection.id;

  insert into public.purchase_receipt_inspections (
    organization_id, purchase_receipt_id, purchase_receipt_item_id,
    purchase_order_id, purchase_order_item_id, supplier_id, product_id,
    inspected_quantity, accepted_quantity, rejected_quantity, status,
    observation, operation_key, operation_payload_hash, inspected_by, supersedes_inspection_id
  ) values (
    old_inspection.organization_id, old_inspection.purchase_receipt_id,
    old_inspection.purchase_receipt_item_id, old_inspection.purchase_order_id,
    old_inspection.purchase_order_item_id, old_inspection.supplier_id,
    old_inspection.product_id, old_inspection.inspected_quantity,
    old_inspection.accepted_quantity, old_inspection.rejected_quantity,
    'completed', observation_value, operation_key_value, operation_payload_hash_value, actor_id,
    old_inspection.id
  )
  returning id into replacement_id;

  if payload ? 'findings' and payload -> 'findings' <> 'null'::jsonb then
    for finding_payload in select value from jsonb_array_elements(payload -> 'findings')
    loop
      insert into public.purchase_receipt_inspection_reasons (
        organization_id, inspection_id, reason_code, reason_text, quantity
      ) values (
        old_inspection.organization_id,
        replacement_id,
        lower(nullif(btrim(finding_payload ->> 'reason_code'), '')),
        nullif(btrim(finding_payload ->> 'reason_text'), ''),
        (finding_payload ->> 'quantity')::numeric::numeric(14, 3)
      );
    end loop;
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    requested_organization_id, actor_id, 'PURCHASE_RECEIPT_INSPECTION_CORRECTED',
    'purchase_receipt_inspection', replacement_id::text,
    jsonb_build_object('superseded_inspection_id', old_inspection.id),
    jsonb_build_object(
      'inspection_id', replacement_id,
      'purchase_receipt_item_id', old_inspection.purchase_receipt_item_id,
      'accepted_quantity', old_inspection.accepted_quantity,
      'rejected_quantity', old_inspection.rejected_quantity
    ),
    jsonb_build_object('operation_key', operation_key_value)
  );
  return replacement_id;
end;
$$;

revoke all on function public.correct_purchase_receipt_inspection(uuid, uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.correct_purchase_receipt_inspection(uuid, uuid, jsonb)
to authenticated;

-- Las devoluciones posteriores se limitan a la cantidad aceptada cuando
-- existe inspeccion. Las recepciones historicas sin inspeccion conservan el
-- limite anterior basado en purchase_receipt_items.quantity.
create or replace function public.register_supplier_return(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  receipt_item_id uuid := (payload ->> 'purchase_receipt_item_id')::uuid;
  requested_quantity numeric := (payload ->> 'quantity')::numeric;
  accepted_quantity_value numeric;
  receipt_data record;
  return_id uuid;
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'SUPPLIERS_MANAGE') then
    raise exception using errcode = '42501', message = 'SUPPLIER_RETURN_FORBIDDEN';
  end if;
  select receipt_item.*, purchase.id as order_id, item.id as order_item_id
  into receipt_data
  from public.purchase_receipt_items receipt_item
  join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id
    and receipt.organization_id = receipt_item.organization_id
  join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id
    and purchase.organization_id = receipt.organization_id
  join public.purchase_order_items item on item.id = receipt_item.purchase_order_item_id
    and item.organization_id = receipt_item.organization_id
  where receipt_item.id = receipt_item_id
    and receipt_item.organization_id = organization_id
    and purchase.supplier_id = supplier_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_RETURN_RECEIPT_ITEM_INVALID';
  end if;

  select coalesce((
    select inspection.accepted_quantity
    from public.purchase_receipt_inspections inspection
    where inspection.organization_id = organization_id
      and inspection.purchase_receipt_item_id = receipt_item_id
      and inspection.status = 'completed'
    order by inspection.completed_at desc, inspection.id desc
    limit 1
  ), receipt_data.quantity)
  into accepted_quantity_value;

  if accepted_quantity_value <= 0 then
    raise exception using errcode = '22023', message = 'SUPPLIER_RETURN_NO_ACCEPTED_QUANTITY';
  end if;
  if requested_quantity <= 0 or requested_quantity + coalesce((
    select sum(previous.quantity)
    from public.supplier_returns previous
    where previous.organization_id = organization_id
      and previous.purchase_receipt_item_id = receipt_item_id
      and previous.status <> 'cancelled'
  ), 0) > accepted_quantity_value
  then
    raise exception using errcode = '22023', message = 'SUPPLIER_RETURN_QUANTITY_INVALID';
  end if;

  insert into public.supplier_returns (
    organization_id, supplier_id, purchase_order_id, purchase_order_item_id,
    purchase_receipt_item_id, product_id, quantity, reason, requested_at,
    responsible_user_id, responsible_name
  ) values (
    organization_id, supplier_id, receipt_data.order_id, receipt_data.order_item_id,
    receipt_item_id, receipt_data.product_id, requested_quantity,
    btrim(payload ->> 'reason'),
    coalesce(nullif(payload ->> 'requested_at', '')::date, current_date),
    actor_id, public.supplier_responsible_name(actor_id)
  )
  returning id into return_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values
  ) values (
    organization_id, actor_id, 'SUPPLIER_RETURN_REGISTERED',
    'supplier_return', return_id::text, payload - 'organization_id'
  );
  return return_id;
end;
$$;

revoke all on function public.register_supplier_return(jsonb)
from public, anon, authenticated;
grant execute on function public.register_supplier_return(jsonb)
to authenticated;

commit;
