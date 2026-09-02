-- ============================================================
-- SILSANPLEX: distribución sobre pedidos y ventas persistentes
-- ============================================================

alter table public.distribution_deliveries
  add column if not exists sale_id uuid,
  add column if not exists sale_number text not null default '';

update public.distribution_deliveries delivery
set
  sale_id = sale.id,
  sale_number = sale.internal_number
from public.sales sale
where delivery.sale_id is null
  and sale.organization_id = delivery.organization_id
  and sale.order_id = delivery.order_id;

create index if not exists distribution_deliveries_organization_sale_idx
  on public.distribution_deliveries (organization_id, sale_id, id);

comment on column public.distribution_deliveries.order_items is
  'Snapshot legado de líneas. Las lecturas integradas usan public.order_items.';
comment on column public.distribution_deliveries.sale_id is
  'Venta persistente asociada al pedido; puede ser nula únicamente para histórico no regularizado.';
comment on column public.distribution_deliveries.sale_number is
  'Snapshot de identificación de la venta persistente; no reemplaza sales.internal_number.';

do $$
declare
  blockers text;
begin
  select string_agg(
    format('delivery=%s organization=%s order=%s', delivery.id, delivery.organization_id, delivery.order_id),
    '; ' order by delivery.id
  )
  into blockers
  from (
    select delivery.id, delivery.organization_id, delivery.order_id
    from public.distribution_deliveries delivery
    left join public.orders order_row
      on order_row.organization_id = delivery.organization_id
     and order_row.id = delivery.order_id
    where order_row.id is null
    order by delivery.id
    limit 20
  ) delivery;

  if blockers is null then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_order_same_organization
      foreign key (organization_id, order_id)
      references public.orders (organization_id, id)
      on delete restrict;
  else
    raise warning 'No se agrega FK distribution_deliveries -> orders. Registros incompatibles: %', blockers;
    raise warning 'Regularización: corregir order_id/organization_id o archivar cada delivery reportada y volver a ejecutar la migración de FK.';
  end if;
end;
$$;

do $$
declare
  blockers text;
begin
  select string_agg(
    format('delivery=%s organization=%s sale=%s', delivery.id, delivery.organization_id, delivery.sale_id),
    '; ' order by delivery.id
  )
  into blockers
  from (
    select delivery.id, delivery.organization_id, delivery.sale_id
    from public.distribution_deliveries delivery
    left join public.sales sale
      on sale.organization_id = delivery.organization_id
     and sale.id = delivery.sale_id
    where delivery.sale_id is not null
      and sale.id is null
    order by delivery.id
    limit 20
  ) delivery;

  if blockers is null then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_sale_same_organization
      foreign key (organization_id, sale_id)
      references public.sales (organization_id, id)
      on delete restrict;
  else
    raise warning 'No se agrega FK distribution_deliveries -> sales. Registros incompatibles: %', blockers;
    raise warning 'Regularización: completar sale_id con la venta del pedido o dejarlo nulo como histórico no vinculado.';
  end if;
end;
$$;

create or replace function public.save_distribution_delivery(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid := (payload ->> 'organization_id')::uuid;
  target_delivery_id uuid := nullif(payload ->> 'id', '')::uuid;
  target_order_id uuid := nullif(payload ->> 'order_id', '')::uuid;
  target_sale_id uuid := nullif(payload ->> 'sale_id', '')::uuid;
  existing_order_id uuid;
  existing_sale_id uuid;
  existing_direction text;
  existing_dispatch_number text;
  normalized_delivery_status text := coalesce(nullif(btrim(payload ->> 'delivery_status'), ''), 'programado');
  normalized_direction text := btrim(coalesce(payload ->> 'direction', ''));
  normalized_dispatch_number text := btrim(coalesce(payload ->> 'numero_despacho', ''));
  normalized_guide_number text := upper(btrim(coalesce(payload ->> 'guide_number', '')));
  normalized_transport_type text := btrim(coalesce(payload ->> 'transport_type', ''));
  normalized_modality text := coalesce(nullif(btrim(payload ->> 'modalidad'), ''), 'movilidad_propia');
  normalized_carrier text := btrim(coalesce(payload ->> 'transportista', ''));
  normalized_driver text := btrim(coalesce(payload ->> 'conductor', ''));
  normalized_vehicle text := btrim(coalesce(payload ->> 'vehiculo', ''));
  normalized_plate text := upper(btrim(coalesce(payload ->> 'placa', '')));
  normalized_evidence text := btrim(coalesce(payload ->> 'evidencia', ''));
  normalized_incidents jsonb := coalesce(payload -> 'incidencias', '[]'::jsonb);
  order_row public.orders%rowtype;
  sale_row public.sales%rowtype;
  canonical_items jsonb;
  canonical_customer_name text;
  has_persistent_order boolean := false;
begin
  if actor_id is null or not public.has_organization_permission(target_organization_id, 'DISTRIBUTION_MANAGE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_ITEMS_REQUIRED';
  end if;
  if normalized_transport_type not in ('interno', 'externo') then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_TRANSPORT_INVALID';
  end if;
  if normalized_delivery_status not in (
    'programado', 'preparando', 'en_curso', 'en_destino',
    'entregado', 'entrega_parcial', 'reprogramado', 'rechazado',
    'devuelto', 'cancelado'
  ) then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_STATUS_INVALID';
  end if;
  if normalized_modality not in ('movilidad_propia', 'movilidad_externa', 'recojo_cliente') then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_MODALITY_INVALID';
  end if;
  if jsonb_typeof(normalized_incidents) <> 'array' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_INCIDENTS_INVALID';
  end if;
  if char_length(normalized_direction) > 500 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_DIRECTION_TOO_LONG';
  end if;
  if char_length(normalized_dispatch_number) > 40 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_DISPATCH_NUMBER_TOO_LONG';
  end if;
  if char_length(normalized_guide_number) = 0 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_GUIDE_REQUIRED';
  end if;
  if char_length(normalized_carrier) > 120
    or char_length(normalized_driver) > 120
    or char_length(normalized_vehicle) > 120
    or char_length(normalized_plate) > 20
    or char_length(normalized_evidence) > 255 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_TRANSPORT_DATA_TOO_LONG';
  end if;

  if target_delivery_id is null then
    if normalized_direction = '' then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_DIRECTION_REQUIRED';
    end if;
    if normalized_dispatch_number = '' then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_DISPATCH_NUMBER_REQUIRED';
    end if;
  else
    select order_id, sale_id, direction, numero_despacho
      into existing_order_id, existing_sale_id, existing_direction, existing_dispatch_number
    from public.distribution_deliveries
    where id = target_delivery_id
      and organization_id = target_organization_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_NOT_FOUND';
    end if;
    if existing_order_id is distinct from target_order_id then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ORDER_MISMATCH';
    end if;
    normalized_direction := case
      when normalized_direction = '' and existing_direction = '' then ''
      when normalized_direction = '' then existing_direction
      else normalized_direction
    end;
    normalized_dispatch_number := case
      when normalized_dispatch_number = '' and existing_dispatch_number = '' then ''
      when normalized_dispatch_number = '' then existing_dispatch_number
      else normalized_dispatch_number
    end;
  end if;

  select order_data.*
    into order_row
  from public.orders order_data
  where order_data.organization_id = target_organization_id
    and order_data.id = target_order_id
  for share;
  has_persistent_order := found;

  if target_delivery_id is null and not has_persistent_order then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ORDER_NOT_FOUND';
  end if;
  if has_persistent_order then
    if order_row.status = 'cancelado' then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ORDER_NOT_AVAILABLE';
    end if;

    select customer.legal_name
      into canonical_customer_name
    from public.customers customer
    where customer.organization_id = target_organization_id
      and customer.id = order_row.customer_id;

    select sale_data.*
      into sale_row
    from public.sales sale_data
    where sale_data.organization_id = target_organization_id
      and sale_data.order_id = target_order_id
      and (target_sale_id is null or sale_data.id = target_sale_id)
    for share;
    if not found then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_SALE_REQUIRED';
    end if;
    if target_sale_id is not null and sale_row.order_id is distinct from target_order_id then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_SALE_MISMATCH';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'productoId', item.product_id,
      'productoCodigo', item.product_code,
      'productoDescripcion', item.product_description,
      'unidadMedida', coalesce(item.unit_of_measure, ''),
      'cantidad', item.quantity,
      'precioUnitario', item.unit_price,
      'lote', '',
      'fechaVencimiento', ''
    ) order by item.id), '[]'::jsonb)
      into canonical_items
    from public.order_items item
    where item.organization_id = target_organization_id
      and item.order_id = target_order_id;

    if jsonb_array_length(canonical_items) = 0 then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_ORDER_ITEMS_REQUIRED';
    end if;
  end if;

  if target_delivery_id is null then
    insert into public.distribution_deliveries (
      organization_id, order_id, sale_id, sale_number, order_number, customer_name, issue_date,
      delivery_date, guide_number, transport_type, tracking_status,
      delivery_status, direction, numero_despacho, modalidad,
      transportista, conductor, vehiculo, placa, evidencia, incidencias,
      observations, order_items, created_by, updated_by
    ) values (
      target_organization_id, target_order_id, sale_row.id, sale_row.internal_number,
      order_row.order_number, canonical_customer_name, (payload ->> 'issue_date')::date,
      (payload ->> 'delivery_date')::date, normalized_guide_number, normalized_transport_type,
      coalesce(nullif(payload ->> 'tracking_status', ''), 'en_curso'), normalized_delivery_status,
      normalized_direction, normalized_dispatch_number, normalized_modality,
      normalized_carrier, normalized_driver, normalized_vehicle, normalized_plate,
      normalized_evidence, normalized_incidents, coalesce(payload ->> 'observations', ''),
      canonical_items, actor_id, actor_id
    ) returning id into target_delivery_id;
  else
    update public.distribution_deliveries
    set
      sale_id = case when has_persistent_order then sale_row.id else existing_sale_id end,
      sale_number = case when has_persistent_order then sale_row.internal_number else sale_number end,
      order_number = case when has_persistent_order then order_row.order_number else order_number end,
      customer_name = case when has_persistent_order then canonical_customer_name else customer_name end,
      delivery_date = (payload ->> 'delivery_date')::date,
      guide_number = normalized_guide_number,
      transport_type = normalized_transport_type,
      tracking_status = coalesce(nullif(payload ->> 'tracking_status', ''), 'en_curso'),
      delivery_status = normalized_delivery_status,
      direction = normalized_direction,
      numero_despacho = normalized_dispatch_number,
      modalidad = normalized_modality,
      transportista = normalized_carrier,
      conductor = normalized_driver,
      vehiculo = normalized_vehicle,
      placa = normalized_plate,
      evidencia = normalized_evidence,
      incidencias = normalized_incidents,
      observations = coalesce(payload ->> 'observations', ''),
      order_items = case when has_persistent_order then canonical_items else order_items end,
      updated_by = actor_id
    where id = target_delivery_id;
  end if;

  return target_delivery_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'DISTRIBUTION_DUPLICATE_GUIDE_OR_ORDER';
end;
$$;

revoke all on function public.save_distribution_delivery(jsonb)
  from public, anon, authenticated;
grant execute on function public.save_distribution_delivery(jsonb) to authenticated;
