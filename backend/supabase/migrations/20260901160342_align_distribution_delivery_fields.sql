-- ============================================================
-- SILSANPLEX: completar el contrato persistente de distribución
-- ============================================================

-- Las columnas nuevas son aditivas y conservan los registros creados por la
-- primera versión del módulo mediante valores neutros. Las validaciones de
-- obligatoriedad para nuevas entregas viven en el RPC; los checks de tabla
-- permiten valores vacíos históricos para que las filas antiguas sigan siendo
-- legibles y editables por sus operaciones de seguimiento.
alter table public.distribution_deliveries
  add column if not exists delivery_status text not null default 'programado',
  add column if not exists direction text not null default '',
  add column if not exists numero_despacho text not null default '',
  add column if not exists modalidad text not null default 'movilidad_propia',
  add column if not exists transportista text not null default '',
  add column if not exists conductor text not null default '',
  add column if not exists vehiculo text not null default '',
  add column if not exists placa text not null default '',
  add column if not exists evidencia text not null default '',
  add column if not exists incidencias jsonb not null default '[]'::jsonb;

-- Normaliza instalaciones que pudieran haber creado alguna columna sin los
-- defaults de esta migración antes de fijar la nulabilidad.
update public.distribution_deliveries
set
  delivery_status = coalesce(nullif(btrim(delivery_status), ''), 'programado'),
  direction = coalesce(direction, ''),
  numero_despacho = coalesce(numero_despacho, ''),
  modalidad = coalesce(nullif(btrim(modalidad), ''), 'movilidad_propia'),
  transportista = coalesce(transportista, ''),
  conductor = coalesce(conductor, ''),
  vehiculo = coalesce(vehiculo, ''),
  placa = coalesce(placa, ''),
  evidencia = coalesce(evidencia, ''),
  incidencias = case
    when jsonb_typeof(incidencias) = 'array' then incidencias
    else '[]'::jsonb
  end
where delivery_status is null
   or direction is null
   or numero_despacho is null
   or modalidad is null
   or transportista is null
   or conductor is null
   or vehiculo is null
   or placa is null
   or evidencia is null
   or incidencias is null
   or jsonb_typeof(incidencias) <> 'array';

alter table public.distribution_deliveries
  alter column delivery_status set default 'programado',
  alter column delivery_status set not null,
  alter column direction set default '',
  alter column direction set not null,
  alter column numero_despacho set default '',
  alter column numero_despacho set not null,
  alter column modalidad set default 'movilidad_propia',
  alter column modalidad set not null,
  alter column transportista set default '',
  alter column transportista set not null,
  alter column conductor set default '',
  alter column conductor set not null,
  alter column vehiculo set default '',
  alter column vehiculo set not null,
  alter column placa set default '',
  alter column placa set not null,
  alter column evidencia set default '',
  alter column evidencia set not null,
  alter column incidencias set default '[]'::jsonb,
  alter column incidencias set not null;

alter table public.distribution_deliveries
  add constraint distribution_deliveries_delivery_status_valid
    check (delivery_status in (
      'programado', 'preparando', 'en_curso', 'en_destino',
      'entregado', 'entrega_parcial', 'reprogramado', 'rechazado',
      'devuelto', 'cancelado'
    )),
  add constraint distribution_deliveries_direction_length
    check (char_length(btrim(direction)) <= 500),
  add constraint distribution_deliveries_dispatch_number_length
    check (char_length(btrim(numero_despacho)) <= 40),
  add constraint distribution_deliveries_modality_valid
    check (modalidad in ('movilidad_propia', 'movilidad_externa', 'recojo_cliente')),
  add constraint distribution_deliveries_carrier_length
    check (char_length(btrim(transportista)) <= 120),
  add constraint distribution_deliveries_driver_length
    check (char_length(btrim(conductor)) <= 120),
  add constraint distribution_deliveries_vehicle_length
    check (char_length(btrim(vehiculo)) <= 120),
  add constraint distribution_deliveries_plate_length
    check (char_length(btrim(placa)) <= 20),
  add constraint distribution_deliveries_evidence_length
    check (char_length(btrim(evidencia)) <= 255),
  add constraint distribution_deliveries_incidents_valid
    check (jsonb_typeof(incidencias) = 'array');

comment on column public.distribution_deliveries.delivery_status is
  'Estado operativo de la entrega; tracking_status conserva el seguimiento de ruta.';
comment on column public.distribution_deliveries.direction is
  'Dirección de entrega. Se permite vacía para filas históricas; el RPC la exige en nuevas entregas.';
comment on column public.distribution_deliveries.numero_despacho is
  'Identificador interno de despacho. Se permite vacío para filas históricas; el RPC lo exige en nuevas entregas.';
comment on column public.distribution_deliveries.modalidad is
  'Modalidad operativa; el recojo del cliente se representa aquí, no en transport_type.';

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

    insert into public.distribution_deliveries (
      organization_id, order_id, order_number, customer_name, issue_date,
      delivery_date, guide_number, transport_type, tracking_status,
      delivery_status, direction, numero_despacho, modalidad,
      transportista, conductor, vehiculo, placa, evidencia, incidencias,
      observations, order_items, created_by, updated_by
    ) values (
      target_organization_id, (payload ->> 'order_id')::uuid,
      btrim(payload ->> 'order_number'), btrim(payload ->> 'customer_name'),
      (payload ->> 'issue_date')::date, (payload ->> 'delivery_date')::date,
      normalized_guide_number, normalized_transport_type,
      coalesce(nullif(payload ->> 'tracking_status', ''), 'en_curso'),
      normalized_delivery_status, normalized_direction, normalized_dispatch_number,
      normalized_modality, normalized_carrier, normalized_driver, normalized_vehicle,
      normalized_plate, normalized_evidence, normalized_incidents,
      coalesce(payload ->> 'observations', ''), payload -> 'items', actor_id, actor_id
    ) returning id into target_delivery_id;
  else
    select direction, numero_despacho
      into existing_direction, existing_dispatch_number
    from public.distribution_deliveries
    where id = target_delivery_id
      and organization_id = target_organization_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_NOT_FOUND';
    end if;

    -- Las actualizaciones de seguimiento de filas antiguas no deben fallar
    -- solo porque esas filas no tenían los campos que añadió esta migración.
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

    update public.distribution_deliveries
    set
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
      order_items = payload -> 'items',
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
