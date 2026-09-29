-- E4C.3: reintentos idempotentes del registro administrativo de devoluciones.
-- Las columnas permanecen nullable para no inventar claves en devoluciones
-- historicas. Las llamadas nuevas que envien operation_key quedan protegidas
-- por una clave unica por organizacion y un hash del payload semantico.

begin;

alter table public.supplier_returns
  add column operation_key uuid,
  add column operation_payload_hash text;

alter table public.supplier_returns
  add constraint supplier_returns_operation_payload_hash_format
    check (operation_payload_hash is null or operation_payload_hash ~ '^[0-9a-f]{64}$'),
  add constraint supplier_returns_operation_idempotency_consistent
    check (
      (operation_key is null and operation_payload_hash is null)
      or (operation_key is not null and operation_payload_hash is not null)
    );

create unique index supplier_returns_organization_operation_unique
  on public.supplier_returns (organization_id, operation_key)
  where operation_key is not null;

comment on column public.supplier_returns.operation_key is
  'Clave idempotente de la intencion de registro dentro de la organizacion; nullable para compatibilidad historica.';
comment on column public.supplier_returns.operation_payload_hash is
  'SHA-256 hexadecimal del payload funcional canonico de register_supplier_return.';

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
  operation_key_value uuid := nullif(payload ->> 'operation_key', '')::uuid;
  requested_quantity numeric := (payload ->> 'quantity')::numeric;
  requested_date date := nullif(payload ->> 'requested_at', '')::date;
  normalized_reason text := btrim(payload ->> 'reason');
  canonical_payload jsonb;
  request_payload_hash text;
  accepted_quantity_value numeric;
  receipt_data record;
  existing_return public.supplier_returns%rowtype;
  return_id uuid;
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'SUPPLIERS_MANAGE') then
    raise exception using errcode = '42501', message = 'SUPPLIER_RETURN_FORBIDDEN';
  end if;

  if operation_key_value is not null then
    canonical_payload := jsonb_build_object(
      'organization_id', organization_id,
      'supplier_id', supplier_id,
      'purchase_receipt_item_id', receipt_item_id,
      'quantity', public.normalize_commercial_idempotency_numeric(requested_quantity),
      'reason', normalized_reason
    );
    if requested_date is not null then
      canonical_payload := canonical_payload || jsonb_build_object('requested_at', requested_date);
    end if;
    request_payload_hash := encode(
      extensions.digest(canonical_payload::text, 'sha256'),
      'hex'
    );

    -- Serializa solo reintentos de la misma intencion dentro de la
    -- organizacion. El lock vive hasta que termina esta transaccion.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      organization_id::text || ':supplier-return-operation:' || operation_key_value::text,
      0
    ));

    select existing.*
    into existing_return
    from public.supplier_returns existing
    where existing.organization_id = organization_id
      and existing.operation_key = operation_key_value
    for update;

    if found then
      if existing_return.operation_payload_hash is distinct from request_payload_hash then
        raise exception using errcode = 'P0001', message = 'SUPPLIER_RETURN_IDEMPOTENCY_CONFLICT';
      end if;
      return existing_return.id;
    end if;
  end if;

  -- Este lock conserva la serializacion existente del saldo por linea fisica
  -- y debe preceder a la lectura de accepted_quantity y devoluciones previas.
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
    and purchase.supplier_id = supplier_id
  for update of receipt_item;

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
    responsible_user_id, responsible_name, operation_key, operation_payload_hash
  ) values (
    organization_id, supplier_id, receipt_data.order_id, receipt_data.order_item_id,
    receipt_item_id, receipt_data.product_id, requested_quantity,
    normalized_reason, coalesce(requested_date, current_date),
    actor_id, public.supplier_responsible_name(actor_id),
    operation_key_value, request_payload_hash
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
