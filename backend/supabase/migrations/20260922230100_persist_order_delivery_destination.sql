-- SILSANPLEX: conserva en el pedido el destino comercial confirmado.
-- Los pedidos historicos siguen siendo validos y pueden usar el destino
-- principal del cliente como alternativa durante su programacion.

alter table public.customer_addresses
  add constraint customer_addresses_organization_customer_id_key
  unique (organization_id, customer_id, id);

alter table public.orders
  add column delivery_address_id uuid,
  add column delivery_address_snapshot jsonb not null default '{}'::jsonb;

alter table public.orders
  add constraint orders_delivery_address_same_customer
  foreign key (organization_id, customer_id, delivery_address_id)
  references public.customer_addresses (organization_id, customer_id, id)
  on delete restrict not valid;

alter table public.orders
  add constraint orders_delivery_address_snapshot_object
  check (pg_catalog.jsonb_typeof(delivery_address_snapshot) = 'object') not valid,
  add constraint orders_delivery_address_snapshot_valid
  check (
    delivery_address_snapshot = '{}'::jsonb
    or (
      pg_catalog.jsonb_typeof(delivery_address_snapshot) = 'object'
      and pg_catalog.char_length(pg_catalog.btrim(coalesce(delivery_address_snapshot ->> 'address_line', ''))) between 3 and 240
      and (
        delivery_address_snapshot ->> 'label' is null
        or pg_catalog.char_length(delivery_address_snapshot ->> 'label') <= 80
      )
      and (
        delivery_address_snapshot ->> 'ubigeo_code' is null
        or delivery_address_snapshot ->> 'ubigeo_code' ~ '^[0-9]{6}$'
      )
      and (
        delivery_address_snapshot ->> 'reference' is null
        or pg_catalog.char_length(delivery_address_snapshot ->> 'reference') <= 200
      )
    )
  ) not valid,
  add constraint orders_delivery_address_id_requires_snapshot
  check (delivery_address_id is null or delivery_address_snapshot <> '{}'::jsonb) not valid,
  add constraint orders_pickup_has_no_delivery_address
  check (
    fulfillment_mode <> 'pickup'
    or (delivery_address_id is null and delivery_address_snapshot = '{}'::jsonb)
  ) not valid;

alter table public.orders validate constraint orders_delivery_address_same_customer;
alter table public.orders validate constraint orders_delivery_address_snapshot_object;
alter table public.orders validate constraint orders_delivery_address_snapshot_valid;
alter table public.orders validate constraint orders_delivery_address_id_requires_snapshot;
alter table public.orders validate constraint orders_pickup_has_no_delivery_address;

create or replace function public.create_order_with_fulfillment(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_customer_id uuid;
  target_operation_key uuid;
  target_order_id uuid;
  target_delivery_address_id uuid;
  requested_mode text;
  raw_address_snapshot jsonb;
  normalized_address_snapshot jsonb := '{}'::jsonb;
  address_row public.customer_addresses%rowtype;
  existing_order public.orders%rowtype;
  existing_order_found boolean := false;
  address_line text;
  address_label text;
  address_ubigeo text;
  address_reference text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if payload is null or pg_catalog.jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_customer_id := nullif(payload ->> 'customer_id', '')::uuid;
  target_operation_key := nullif(payload ->> 'operation_key', '')::uuid;
  target_delivery_address_id := nullif(payload ->> 'delivery_address_id', '')::uuid;
  requested_mode := coalesce(nullif(pg_catalog.btrim(payload ->> 'fulfillment_mode'), ''), 'delivery');
  raw_address_snapshot := payload -> 'delivery_address_snapshot';

  if target_organization_id is null
     or not public.has_organization_permission(target_organization_id, 'SALES_MANAGE') then
    raise exception using errcode = '42501', message = 'ORDER_FORBIDDEN';
  end if;
  if requested_mode not in ('delivery', 'pickup') then
    raise exception using errcode = '22023', message = 'ORDER_FULFILLMENT_MODE_INVALID';
  end if;

  -- Serializa reintentos concurrentes de la misma cotizacion/operacion.
  if target_operation_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        target_organization_id::text || ':order-fulfillment-mode:' || target_operation_key::text,
        0
      )
    );

    select order_row.* into existing_order
    from public.orders order_row
    where order_row.organization_id = target_organization_id
      and order_row.operation_key = target_operation_key
    for update;
    existing_order_found := found;
  end if;

  if requested_mode = 'pickup' then
    if target_delivery_address_id is not null
       or (raw_address_snapshot is not null and raw_address_snapshot <> 'null'::jsonb and raw_address_snapshot <> '{}'::jsonb) then
      raise exception using errcode = '22023', message = 'ORDER_DELIVERY_ADDRESS_NOT_ALLOWED';
    end if;
  elsif target_delivery_address_id is null then
    if raw_address_snapshot is null or pg_catalog.jsonb_typeof(raw_address_snapshot) <> 'object' then
      raise exception using errcode = '22023', message = 'ORDER_DELIVERY_ADDRESS_REQUIRED';
    end if;
    address_line := nullif(pg_catalog.btrim(raw_address_snapshot ->> 'address_line'), '');
    address_label := nullif(pg_catalog.btrim(raw_address_snapshot ->> 'label'), '');
    address_ubigeo := nullif(pg_catalog.btrim(raw_address_snapshot ->> 'ubigeo_code'), '');
    address_reference := nullif(pg_catalog.btrim(raw_address_snapshot ->> 'reference'), '');
    if address_line is null or pg_catalog.char_length(address_line) not between 3 and 240
       or (address_label is not null and pg_catalog.char_length(address_label) > 80)
       or (address_ubigeo is not null and address_ubigeo !~ '^[0-9]{6}$')
       or (address_reference is not null and pg_catalog.char_length(address_reference) > 200) then
      raise exception using errcode = '22023', message = 'ORDER_DELIVERY_ADDRESS_INVALID';
    end if;
    normalized_address_snapshot := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'label', address_label,
      'address_line', address_line,
      'ubigeo_code', address_ubigeo,
      'reference', address_reference
    ));
  elsif raw_address_snapshot is not null and raw_address_snapshot <> 'null'::jsonb and raw_address_snapshot <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'ORDER_DELIVERY_ADDRESS_INVALID';
  end if;

  if existing_order_found then
    if existing_order.fulfillment_mode is distinct from requested_mode then
      raise exception using errcode = 'P0001', message = 'ORDER_FULFILLMENT_MODE_CONFLICT';
    end if;
    -- Un pedido historico sin snapshot conserva su comportamiento. Para los
    -- pedidos nuevos, los reintentos deben repetir exactamente el destino.
    if existing_order.delivery_address_snapshot <> '{}'::jsonb then
      if requested_mode = 'delivery' and target_delivery_address_id is not null then
        if existing_order.delivery_address_id is distinct from target_delivery_address_id then
          raise exception using errcode = 'P0001', message = 'ORDER_DELIVERY_ADDRESS_CONFLICT';
        end if;
      elsif existing_order.delivery_address_id is not null
         or existing_order.delivery_address_snapshot is distinct from normalized_address_snapshot then
        raise exception using errcode = 'P0001', message = 'ORDER_DELIVERY_ADDRESS_CONFLICT';
      end if;
    end if;
    return existing_order.id;
  end if;

  if requested_mode = 'delivery' and target_delivery_address_id is not null then
    select address.* into address_row
    from public.customer_addresses address
    where address.id = target_delivery_address_id
      and address.organization_id = target_organization_id
      and address.customer_id = target_customer_id
      and address.address_type = 'DELIVERY'
      and address.is_active
    for share;
    if not found then
      raise exception using errcode = 'P0001', message = 'ORDER_DELIVERY_ADDRESS_UNAVAILABLE';
    end if;
    normalized_address_snapshot := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'label', nullif(pg_catalog.btrim(address_row.label), ''),
      'address_line', pg_catalog.btrim(address_row.address_line),
      'ubigeo_code', nullif(pg_catalog.btrim(address_row.ubigeo_code), ''),
      'reference', nullif(pg_catalog.btrim(address_row.reference), '')
    ));
  end if;

  target_order_id := public.create_order(payload);

  -- create_order tambien puede devolver el mismo pedido por source_quote_id.
  select order_row.* into existing_order
  from public.orders order_row
  where order_row.organization_id = target_organization_id
    and order_row.id = target_order_id
  for update;
  if existing_order.delivery_address_snapshot <> '{}'::jsonb then
    if existing_order.fulfillment_mode is distinct from requested_mode
       or existing_order.delivery_address_id is distinct from target_delivery_address_id
       or existing_order.delivery_address_snapshot is distinct from normalized_address_snapshot then
      raise exception using errcode = 'P0001', message = 'ORDER_DELIVERY_ADDRESS_CONFLICT';
    end if;
    return target_order_id;
  end if;

  update public.orders
  set fulfillment_mode = requested_mode,
      delivery_address_id = case when requested_mode = 'delivery' then target_delivery_address_id else null end,
      delivery_address_snapshot = normalized_address_snapshot,
      updated_at = pg_catalog.now(),
      updated_by = actor_id
  where organization_id = target_organization_id
    and id = target_order_id
    and status = 'confirmado'
    and fulfillment_status = 'pending';

  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_FULFILLMENT_MODE_NOT_SET';
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    new_values, metadata
  ) values (
    target_organization_id, actor_id, 'ORDER_FULFILLMENT_MODE_SET', 'order',
    target_order_id::text,
    pg_catalog.jsonb_build_object(
      'fulfillment_mode', requested_mode,
      'delivery_address_id', target_delivery_address_id,
      'delivery_address_recorded', requested_mode = 'delivery'
    ),
    pg_catalog.jsonb_build_object('source', 'database_function')
  );

  return target_order_id;
end;
$$;

revoke all on function public.create_order_with_fulfillment(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_order_with_fulfillment(jsonb) to authenticated;

comment on column public.orders.delivery_address_id is
  'Direccion de entrega del maestro de clientes seleccionada al confirmar el pedido, cuando aplica.';
comment on column public.orders.delivery_address_snapshot is
  'Snapshot inmutable del destino acordado al confirmar el pedido; vacio en pedidos historicos y recojos.';
