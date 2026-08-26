-- ============================================================
-- SILSANPLEX: distribución operativa completa
-- Órdenes logísticas, despachos parciales, trazabilidad,
-- incidencias, devoluciones y evidencias privadas.
-- ============================================================

-- 1. Permisos granulares
insert into public.permissions (code, name, description)
values
  ('DISTRIBUTION_TRACK', 'Actualizar seguimiento', 'Registrar salidas, resultados, reprogramaciones e incidencias.'),
  ('DISTRIBUTION_EVIDENCE', 'Gestionar evidencias', 'Adjuntar evidencias privadas a las entregas.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

insert into public.role_permissions (role_code, permission_code)
values
  ('ADMIN', 'DISTRIBUTION_TRACK'),
  ('ADMIN', 'DISTRIBUTION_EVIDENCE'),
  ('LOGISTICA', 'DISTRIBUTION_TRACK'),
  ('LOGISTICA', 'DISTRIBUTION_EVIDENCE')
on conflict (role_code, permission_code) do nothing;

-- 2. Órdenes de distribución persistidas
create table public.distribution_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  source_order_id uuid not null,
  order_number text not null,
  customer_id uuid,
  customer_document text,
  customer_name text not null,
  order_date date not null,
  delivery_address text not null,
  delivery_reference text,
  contact_name text,
  contact_phone text,
  status text not null default 'pendiente',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint distribution_orders_number_length
    check (char_length(btrim(order_number)) between 1 and 30),
  constraint distribution_orders_customer_length
    check (char_length(btrim(customer_name)) between 2 and 160),
  constraint distribution_orders_address_length
    check (char_length(btrim(delivery_address)) between 3 and 240),
  constraint distribution_orders_reference_length
    check (delivery_reference is null or char_length(delivery_reference) <= 200),
  constraint distribution_orders_contact_name_length
    check (contact_name is null or char_length(contact_name) <= 120),
  constraint distribution_orders_contact_phone_length
    check (contact_phone is null or char_length(contact_phone) <= 30),
  constraint distribution_orders_status_valid
    check (status in ('pendiente', 'parcial', 'completado', 'cancelado')),
  constraint distribution_orders_organization_id_id_key unique (organization_id, id),
  constraint distribution_orders_source_unique unique (organization_id, source_order_id),
  constraint distribution_orders_number_unique unique (organization_id, order_number),
  constraint distribution_orders_customer_same_organization
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict
);

create index distribution_orders_organization_status_idx
  on public.distribution_orders (organization_id, status, order_date desc);

create trigger distribution_orders_set_updated_at
before update on public.distribution_orders
for each row execute function public.set_updated_at();

create table public.distribution_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  distribution_order_id uuid not null,
  source_item_id text not null,
  product_id uuid,
  product_code text not null,
  product_description text not null,
  unit_of_measure text not null,
  ordered_quantity numeric(14, 3) not null,
  created_at timestamptz not null default now(),

  constraint distribution_order_items_order_same_organization
    foreign key (organization_id, distribution_order_id)
    references public.distribution_orders (organization_id, id) on delete cascade,
  constraint distribution_order_items_product_same_organization
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint distribution_order_items_source_not_blank
    check (char_length(btrim(source_item_id)) > 0),
  constraint distribution_order_items_code_not_blank
    check (char_length(btrim(product_code)) > 0),
  constraint distribution_order_items_description_not_blank
    check (char_length(btrim(product_description)) > 0),
  constraint distribution_order_items_unit_not_blank
    check (char_length(btrim(unit_of_measure)) > 0),
  constraint distribution_order_items_quantity_positive
    check (ordered_quantity > 0),
  constraint distribution_order_items_source_unique
    unique (distribution_order_id, source_item_id),
  constraint distribution_order_items_organization_id_id_key
    unique (organization_id, id)
);

create index distribution_order_items_order_idx
  on public.distribution_order_items (distribution_order_id, id);

-- 3. Evolución compatible de las entregas existentes
alter table public.distribution_deliveries
  drop constraint distribution_deliveries_tracking_valid;

drop index public.distribution_deliveries_organization_order_unique;

alter table public.distribution_deliveries
  add column distribution_order_id uuid,
  add column sequence_number integer not null default 1,
  add column destination_address text,
  add column destination_reference text,
  add column contact_name text,
  add column contact_phone text,
  add column carrier_name text,
  add column carrier_document text,
  add column driver_name text,
  add column driver_document text,
  add column driver_license text,
  add column vehicle_plate text,
  add column started_at timestamptz,
  add column completed_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancellation_reason text;

update public.distribution_deliveries
set tracking_status = case tracking_status
  when 'en_curso' then 'en_transito'
  when 'en_destino' then 'entregada'
  else tracking_status
end;

insert into public.distribution_orders (
  organization_id, source_order_id, order_number, customer_name, order_date,
  delivery_address, status, created_by, updated_by, created_at, updated_at
)
select distinct on (delivery.organization_id, delivery.order_id)
  delivery.organization_id,
  delivery.order_id,
  delivery.order_number,
  delivery.customer_name,
  delivery.issue_date,
  'Dirección por confirmar',
  case when delivery.tracking_status = 'entregada' then 'completado' else 'parcial' end,
  delivery.created_by,
  delivery.updated_by,
  delivery.created_at,
  delivery.updated_at
from public.distribution_deliveries delivery
order by delivery.organization_id, delivery.order_id, delivery.created_at;

insert into public.distribution_order_items (
  organization_id, distribution_order_id, source_item_id, product_id,
  product_code, product_description, unit_of_measure, ordered_quantity
)
select
  delivery.organization_id,
  distribution_order.id,
  coalesce(nullif(item.value->>'id', ''), gen_random_uuid()::text),
  case
    when coalesce(item.value->>'productoId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (item.value->>'productoId')::uuid
    else null
  end,
  coalesce(nullif(btrim(item.value->>'productoCodigo'), ''), 'SIN-CODIGO'),
  coalesce(nullif(btrim(item.value->>'productoDescripcion'), ''), 'Producto sin descripción'),
  coalesce(nullif(btrim(item.value->>'unidadMedida'), ''), 'UND'),
  greatest(coalesce((item.value->>'cantidad')::numeric, 0), 0.001)
from public.distribution_deliveries delivery
join public.distribution_orders distribution_order
  on distribution_order.organization_id = delivery.organization_id
 and distribution_order.source_order_id = delivery.order_id
cross join lateral jsonb_array_elements(delivery.order_items) item(value)
on conflict (distribution_order_id, source_item_id) do nothing;

update public.distribution_deliveries delivery
set
  distribution_order_id = distribution_order.id,
  destination_address = 'Dirección por confirmar'
from public.distribution_orders distribution_order
where distribution_order.organization_id = delivery.organization_id
  and distribution_order.source_order_id = delivery.order_id;

alter table public.distribution_deliveries
  alter column distribution_order_id set not null,
  alter column destination_address set not null,
  add constraint distribution_deliveries_order_same_organization
    foreign key (organization_id, distribution_order_id)
    references public.distribution_orders (organization_id, id) on delete restrict,
  add constraint distribution_deliveries_tracking_valid
    check (tracking_status in (
      'programada', 'reprogramada', 'en_transito', 'entrega_parcial',
      'entregada', 'rechazada', 'devuelta', 'cancelada'
    )),
  add constraint distribution_deliveries_sequence_positive
    check (sequence_number > 0),
  add constraint distribution_deliveries_destination_length
    check (char_length(btrim(destination_address)) between 3 and 240),
  add constraint distribution_deliveries_carrier_length
    check (carrier_name is null or char_length(carrier_name) <= 160),
  add constraint distribution_deliveries_driver_length
    check (driver_name is null or char_length(driver_name) <= 160),
  add constraint distribution_deliveries_vehicle_plate_length
    check (vehicle_plate is null or char_length(vehicle_plate) <= 20),
  add constraint distribution_deliveries_cancellation_reason_length
    check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  add constraint distribution_deliveries_organization_id_id_key
    unique (organization_id, id),
  add constraint distribution_deliveries_order_sequence_unique
    unique (distribution_order_id, sequence_number);

create index distribution_deliveries_order_status_idx
  on public.distribution_deliveries (distribution_order_id, tracking_status, delivery_date);

create table public.distribution_delivery_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  delivery_id uuid not null,
  order_item_id uuid not null,
  shipped_quantity numeric(14, 3) not null,
  delivered_quantity numeric(14, 3) not null default 0,
  rejected_quantity numeric(14, 3) not null default 0,
  returned_quantity numeric(14, 3) not null default 0,
  lot_number text,
  expiration_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint distribution_delivery_items_delivery_same_organization
    foreign key (organization_id, delivery_id)
    references public.distribution_deliveries (organization_id, id) on delete restrict,
  constraint distribution_delivery_items_order_item_same_organization
    foreign key (organization_id, order_item_id)
    references public.distribution_order_items (organization_id, id) on delete restrict,
  constraint distribution_delivery_items_quantities_valid
    check (
      shipped_quantity > 0
      and delivered_quantity >= 0
      and rejected_quantity >= 0
      and returned_quantity >= 0
      and delivered_quantity + rejected_quantity <= shipped_quantity
      and returned_quantity <= delivered_quantity
    ),
  constraint distribution_delivery_items_delivery_order_item_unique
    unique (delivery_id, order_item_id),
  constraint distribution_delivery_items_organization_id_id_key
    unique (organization_id, id)
);

create index distribution_delivery_items_delivery_idx
  on public.distribution_delivery_items (delivery_id, id);

create trigger distribution_delivery_items_set_updated_at
before update on public.distribution_delivery_items
for each row execute function public.set_updated_at();

insert into public.distribution_delivery_items (
  organization_id, delivery_id, order_item_id, shipped_quantity, delivered_quantity
)
select
  delivery.organization_id,
  delivery.id,
  order_item.id,
  order_item.ordered_quantity,
  case when delivery.tracking_status = 'entregada' then order_item.ordered_quantity else 0 end
from public.distribution_deliveries delivery
join public.distribution_order_items order_item
  on order_item.distribution_order_id = delivery.distribution_order_id
on conflict (delivery_id, order_item_id) do nothing;

-- 4. Bitácora, incidencias, evidencias y devoluciones
create table public.distribution_delivery_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  delivery_id uuid not null,
  event_type text not null,
  previous_status text,
  new_status text,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,

  constraint distribution_delivery_events_delivery_same_organization
    foreign key (organization_id, delivery_id)
    references public.distribution_deliveries (organization_id, id) on delete restrict,
  constraint distribution_delivery_events_type_valid
    check (event_type in (
      'programada', 'actualizada', 'salida', 'reprogramada', 'resultado',
      'incidencia', 'incidencia_resuelta', 'evidencia', 'devolucion', 'cancelada'
    )),
  constraint distribution_delivery_events_description_length
    check (char_length(btrim(description)) between 2 and 500)
);

create index distribution_delivery_events_delivery_occurred_idx
  on public.distribution_delivery_events (delivery_id, occurred_at desc, id desc);

create table public.distribution_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  delivery_id uuid not null,
  incident_type text not null,
  severity text not null,
  description text not null,
  status text not null default 'abierta',
  resolution text,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint distribution_incidents_delivery_same_organization
    foreign key (organization_id, delivery_id)
    references public.distribution_deliveries (organization_id, id) on delete restrict,
  constraint distribution_incidents_type_valid
    check (incident_type in ('demora', 'danio', 'perdida', 'documentacion', 'cliente_ausente', 'vehiculo', 'otro')),
  constraint distribution_incidents_severity_valid
    check (severity in ('baja', 'media', 'alta', 'critica')),
  constraint distribution_incidents_status_valid
    check (status in ('abierta', 'investigando', 'resuelta', 'cerrada')),
  constraint distribution_incidents_description_length
    check (char_length(btrim(description)) between 3 and 500),
  constraint distribution_incidents_resolution_length
    check (resolution is null or char_length(resolution) <= 500)
);

create index distribution_incidents_delivery_status_idx
  on public.distribution_incidents (delivery_id, status, occurred_at desc);

create trigger distribution_incidents_set_updated_at
before update on public.distribution_incidents
for each row execute function public.set_updated_at();

create table public.distribution_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  delivery_id uuid not null,
  evidence_type text not null,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size bigint not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint distribution_evidence_delivery_same_organization
    foreign key (organization_id, delivery_id)
    references public.distribution_deliveries (organization_id, id) on delete restrict,
  constraint distribution_evidence_type_valid
    check (evidence_type in ('despacho', 'entrega', 'rechazo', 'devolucion', 'incidencia')),
  constraint distribution_evidence_file_name_length
    check (char_length(btrim(file_name)) between 1 and 220),
  constraint distribution_evidence_path_length
    check (char_length(btrim(storage_path)) between 5 and 500),
  constraint distribution_evidence_size_valid
    check (file_size > 0 and file_size <= 10485760),
  constraint distribution_evidence_notes_length
    check (notes is null or char_length(notes) <= 500),
  constraint distribution_evidence_storage_unique unique (storage_path)
);

create index distribution_evidence_delivery_created_idx
  on public.distribution_evidence (delivery_id, created_at desc);

create table public.distribution_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  delivery_id uuid not null,
  reason text not null,
  notes text,
  status text not null default 'registrada',
  occurred_at timestamptz not null default now(),
  received_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint distribution_returns_delivery_same_organization
    foreign key (organization_id, delivery_id)
    references public.distribution_deliveries (organization_id, id) on delete restrict,
  constraint distribution_returns_reason_length
    check (char_length(btrim(reason)) between 3 and 300),
  constraint distribution_returns_notes_length
    check (notes is null or char_length(notes) <= 500),
  constraint distribution_returns_status_valid
    check (status in ('registrada', 'recibida', 'cerrada')),
  constraint distribution_returns_organization_id_id_key
    unique (organization_id, id)
);

create index distribution_returns_delivery_created_idx
  on public.distribution_returns (delivery_id, created_at desc);

create trigger distribution_returns_set_updated_at
before update on public.distribution_returns
for each row execute function public.set_updated_at();

create table public.distribution_return_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  return_id uuid not null,
  delivery_item_id uuid not null,
  quantity numeric(14, 3) not null,
  item_condition text not null,

  constraint distribution_return_items_return_same_organization
    foreign key (organization_id, return_id)
    references public.distribution_returns (organization_id, id) on delete restrict,
  constraint distribution_return_items_delivery_item_same_organization
    foreign key (organization_id, delivery_item_id)
    references public.distribution_delivery_items (organization_id, id) on delete restrict,
  constraint distribution_return_items_quantity_positive check (quantity > 0),
  constraint distribution_return_items_condition_valid
    check (item_condition in ('conforme', 'danado', 'vencido', 'abierto', 'otro')),
  constraint distribution_return_items_unique unique (return_id, delivery_item_id)
);

-- 5. Funciones auxiliares y operaciones transaccionales
create or replace function public.refresh_distribution_order_status(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ordered_total numeric;
  delivered_total numeric;
  active_total numeric;
begin
  select coalesce(sum(item.ordered_quantity), 0)
    into ordered_total
  from public.distribution_order_items item
  where item.distribution_order_id = target_order_id;

  select
    coalesce(sum(item.delivered_quantity - item.returned_quantity), 0),
    coalesce(sum(case when delivery.tracking_status not in ('cancelada', 'rechazada', 'devuelta') then item.shipped_quantity else 0 end), 0)
    into delivered_total, active_total
  from public.distribution_delivery_items item
  join public.distribution_deliveries delivery on delivery.id = item.delivery_id
  where delivery.distribution_order_id = target_order_id;

  update public.distribution_orders
  set status = case
    when ordered_total > 0 and delivered_total >= ordered_total then 'completado'
    when delivered_total > 0 or active_total > 0 then 'parcial'
    else 'pendiente'
  end
  where id = target_order_id;
end;
$$;

revoke all on function public.refresh_distribution_order_status(uuid) from public, anon, authenticated;

create or replace function public.save_distribution_delivery(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  v_organization_id uuid := (payload->>'organization_id')::uuid;
  v_delivery_id uuid := nullif(payload->>'id', '')::uuid;
  order_payload jsonb := coalesce(payload->'order', payload);
  v_source_order_id uuid := coalesce(nullif(order_payload->>'id', '')::uuid, nullif(payload->>'order_id', '')::uuid);
  v_order_id uuid;
  item_payload jsonb;
  v_order_item_id uuid;
  requested_quantity numeric;
  allocated_quantity numeric;
  ordered_quantity numeric;
  current_status text;
  next_sequence integer;
  event_kind text;
  v_customer_id uuid;
  v_product_id uuid;
begin
  if actor_id is null or not public.has_organization_permission(v_organization_id, 'DISTRIBUTION_MANAGE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  if v_source_order_id is null then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_ORDER_REQUIRED';
  end if;

  if jsonb_typeof(order_payload->'items') <> 'array' or jsonb_array_length(order_payload->'items') = 0 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_ITEMS_REQUIRED';
  end if;

  if nullif(btrim(coalesce(payload->>'destination_address', order_payload->>'delivery_address', '')), '') is null then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_ADDRESS_REQUIRED';
  end if;

  if nullif(payload->>'delivery_date', '') is null or (payload->>'delivery_date')::date < current_date then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_DATE_INVALID';
  end if;

  if nullif(btrim(payload->>'driver_name'), '') is null
    or nullif(btrim(payload->>'vehicle_plate'), '') is null
  then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_TRANSPORT_DETAILS_REQUIRED';
  end if;

  if payload->>'transport_type' = 'externo'
    and nullif(btrim(payload->>'carrier_name'), '') is null
  then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_CARRIER_REQUIRED';
  end if;

  if nullif(order_payload->>'customer_id', '') is not null then
    select customer.id into v_customer_id
    from public.customers customer
    where customer.organization_id = v_organization_id
      and customer.id = (order_payload->>'customer_id')::uuid;
  end if;

  insert into public.distribution_orders (
    organization_id, source_order_id, order_number, customer_id, customer_document,
    customer_name, order_date, delivery_address, delivery_reference,
    contact_name, contact_phone, created_by, updated_by
  ) values (
    v_organization_id,
    v_source_order_id,
    btrim(coalesce(order_payload->>'number', payload->>'order_number')),
    v_customer_id,
    nullif(btrim(order_payload->>'customer_document'), ''),
    btrim(coalesce(order_payload->>'customer_name', payload->>'customer_name')),
    coalesce(nullif(order_payload->>'order_date', '')::date, current_date),
    btrim(coalesce(payload->>'destination_address', order_payload->>'delivery_address')),
    nullif(btrim(coalesce(payload->>'destination_reference', order_payload->>'delivery_reference')), ''),
    nullif(btrim(coalesce(payload->>'contact_name', order_payload->>'contact_name')), ''),
    nullif(btrim(coalesce(payload->>'contact_phone', order_payload->>'contact_phone')), ''),
    actor_id,
    actor_id
  )
  on conflict (organization_id, source_order_id) do update set
    customer_id = coalesce(excluded.customer_id, public.distribution_orders.customer_id),
    customer_document = coalesce(excluded.customer_document, public.distribution_orders.customer_document),
    customer_name = excluded.customer_name,
    delivery_address = excluded.delivery_address,
    delivery_reference = excluded.delivery_reference,
    contact_name = excluded.contact_name,
    contact_phone = excluded.contact_phone,
    updated_by = actor_id
  returning id into v_order_id;

  for item_payload in
    select value from jsonb_array_elements(order_payload->'items')
  loop
    v_product_id := null;
    if nullif(coalesce(item_payload->>'product_id', item_payload->>'productoId'), '') is not null then
      select product.id into v_product_id
      from public.products product
      where product.organization_id = v_organization_id
        and product.id = coalesce(item_payload->>'product_id', item_payload->>'productoId')::uuid;
    end if;
    insert into public.distribution_order_items (
      organization_id, distribution_order_id, source_item_id, product_id,
      product_code, product_description, unit_of_measure, ordered_quantity
    ) values (
      v_organization_id,
      v_order_id,
      coalesce(nullif(item_payload->>'source_item_id', ''), item_payload->>'id'),
      v_product_id,
      btrim(coalesce(item_payload->>'product_code', item_payload->>'productoCodigo')),
      btrim(coalesce(item_payload->>'product_description', item_payload->>'productoDescripcion')),
      upper(btrim(coalesce(item_payload->>'unit_of_measure', item_payload->>'unidadMedida', 'UND'))),
      coalesce(nullif(item_payload->>'ordered_quantity', '')::numeric, (item_payload->>'cantidad')::numeric)
    )
    on conflict (distribution_order_id, source_item_id) do update set
      product_id = coalesce(excluded.product_id, public.distribution_order_items.product_id),
      product_code = excluded.product_code,
      product_description = excluded.product_description,
      unit_of_measure = excluded.unit_of_measure,
      ordered_quantity = greatest(excluded.ordered_quantity, public.distribution_order_items.ordered_quantity);
  end loop;

  if v_delivery_id is null then
    select coalesce(max(delivery.sequence_number), 0) + 1
      into next_sequence
    from public.distribution_deliveries delivery
    where delivery.distribution_order_id = v_order_id;

    insert into public.distribution_deliveries (
      organization_id, distribution_order_id, order_id, order_number, customer_name,
      issue_date, delivery_date, guide_number, transport_type, tracking_status,
      observations, order_items, sequence_number, destination_address,
      destination_reference, contact_name, contact_phone, carrier_name,
      carrier_document, driver_name, driver_document, driver_license,
      vehicle_plate, created_by, updated_by
    ) values (
      v_organization_id, v_order_id, v_source_order_id,
      btrim(coalesce(order_payload->>'number', payload->>'order_number')),
      btrim(coalesce(order_payload->>'customer_name', payload->>'customer_name')),
      current_date, (payload->>'delivery_date')::date,
      upper(btrim(payload->>'guide_number')), payload->>'transport_type', 'programada',
      coalesce(payload->>'observations', ''), order_payload->'items', next_sequence,
      btrim(coalesce(payload->>'destination_address', order_payload->>'delivery_address')),
      nullif(btrim(coalesce(payload->>'destination_reference', order_payload->>'delivery_reference')), ''),
      nullif(btrim(coalesce(payload->>'contact_name', order_payload->>'contact_name')), ''),
      nullif(btrim(coalesce(payload->>'contact_phone', order_payload->>'contact_phone')), ''),
      nullif(btrim(payload->>'carrier_name'), ''), nullif(btrim(payload->>'carrier_document'), ''),
      nullif(btrim(payload->>'driver_name'), ''), nullif(btrim(payload->>'driver_document'), ''),
      nullif(btrim(payload->>'driver_license'), ''), upper(nullif(btrim(payload->>'vehicle_plate'), '')),
      actor_id, actor_id
    ) returning id into v_delivery_id;
    event_kind := 'programada';
  else
    select tracking_status into current_status
    from public.distribution_deliveries
    where id = v_delivery_id and organization_id = v_organization_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_NOT_FOUND';
    end if;
    if current_status not in ('programada', 'reprogramada') then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_NOT_EDITABLE';
    end if;

    update public.distribution_deliveries set
      delivery_date = (payload->>'delivery_date')::date,
      guide_number = upper(btrim(payload->>'guide_number')),
      transport_type = payload->>'transport_type',
      observations = coalesce(payload->>'observations', ''),
      destination_address = btrim(coalesce(payload->>'destination_address', order_payload->>'delivery_address')),
      destination_reference = nullif(btrim(coalesce(payload->>'destination_reference', order_payload->>'delivery_reference')), ''),
      contact_name = nullif(btrim(coalesce(payload->>'contact_name', order_payload->>'contact_name')), ''),
      contact_phone = nullif(btrim(coalesce(payload->>'contact_phone', order_payload->>'contact_phone')), ''),
      carrier_name = nullif(btrim(payload->>'carrier_name'), ''),
      carrier_document = nullif(btrim(payload->>'carrier_document'), ''),
      driver_name = nullif(btrim(payload->>'driver_name'), ''),
      driver_document = nullif(btrim(payload->>'driver_document'), ''),
      driver_license = nullif(btrim(payload->>'driver_license'), ''),
      vehicle_plate = upper(nullif(btrim(payload->>'vehicle_plate'), '')),
      updated_by = actor_id
    where id = v_delivery_id;
    delete from public.distribution_delivery_items item where item.delivery_id = v_delivery_id;
    event_kind := 'actualizada';
  end if;

  for item_payload in
    select value from jsonb_array_elements(coalesce(payload->'delivery_items', order_payload->'items'))
  loop
    select item.id, item.ordered_quantity
      into v_order_item_id, ordered_quantity
    from public.distribution_order_items item
    where item.distribution_order_id = v_order_id
      and item.source_item_id = coalesce(nullif(item_payload->>'source_item_id', ''), item_payload->>'id');

    requested_quantity := coalesce(
      nullif(item_payload->>'shipped_quantity', '')::numeric,
      nullif(item_payload->>'quantity', '')::numeric,
      nullif(item_payload->>'cantidad', '')::numeric
    );
    if v_order_item_id is null or requested_quantity is null or requested_quantity <= 0 then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_ITEM_INVALID';
    end if;

    select coalesce(sum(
      case
        when existing_delivery.tracking_status in ('programada', 'reprogramada', 'en_transito')
          then existing.shipped_quantity
        when existing_delivery.tracking_status in ('entregada', 'entrega_parcial')
          then existing.delivered_quantity - existing.returned_quantity
        else 0
      end
    ), 0)
      into allocated_quantity
    from public.distribution_delivery_items existing
    join public.distribution_deliveries existing_delivery on existing_delivery.id = existing.delivery_id
    where existing.order_item_id = v_order_item_id
      and existing_delivery.id <> v_delivery_id
      and existing_delivery.tracking_status not in ('cancelada', 'rechazada', 'devuelta');

    if allocated_quantity + requested_quantity > ordered_quantity then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_QUANTITY_EXCEEDED';
    end if;

    insert into public.distribution_delivery_items (
      organization_id, delivery_id, order_item_id, shipped_quantity, lot_number, expiration_date
    ) values (
      v_organization_id, v_delivery_id, v_order_item_id, requested_quantity,
      nullif(btrim(coalesce(item_payload->>'lot_number', item_payload->>'lote')), ''),
      nullif(coalesce(item_payload->>'expiration_date', item_payload->>'fechaVencimiento'), '')::date
    );
  end loop;

  if not exists (select 1 from public.distribution_delivery_items item where item.delivery_id = v_delivery_id) then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_ITEMS_REQUIRED';
  end if;

  insert into public.distribution_delivery_events (
    organization_id, delivery_id, event_type, new_status, description, created_by
  ) values (
    v_organization_id, v_delivery_id, event_kind, 'programada',
    case when event_kind = 'programada' then 'Entrega programada.' else 'Datos de la entrega actualizados.' end,
    actor_id
  );

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values
  ) values (
    v_organization_id, actor_id, 'distribution.' || event_kind,
    'distribution_delivery', v_delivery_id::text,
    jsonb_build_object('order_id', v_order_id, 'delivery_date', payload->>'delivery_date')
  );

  perform public.refresh_distribution_order_status(v_order_id);
  return v_delivery_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'DISTRIBUTION_DUPLICATE_GUIDE_OR_ORDER';
end;
$$;

create or replace function public.transition_distribution_delivery(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  v_organization_id uuid := (payload->>'organization_id')::uuid;
  v_delivery_id uuid := (payload->>'delivery_id')::uuid;
  old_status text;
  new_status text := payload->>'status';
  v_order_id uuid;
  result_item jsonb;
  target_item public.distribution_delivery_items%rowtype;
  delivered numeric;
  rejected numeric;
  event_type text;
  description text := nullif(btrim(payload->>'description'), '');
begin
  if actor_id is null or not public.has_organization_permission(v_organization_id, 'DISTRIBUTION_TRACK') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  select delivery.tracking_status, delivery.distribution_order_id
    into old_status, v_order_id
  from public.distribution_deliveries delivery
  where delivery.id = v_delivery_id and delivery.organization_id = v_organization_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'DISTRIBUTION_NOT_FOUND'; end if;

  if not (
    (old_status in ('programada', 'reprogramada') and new_status in ('en_transito', 'reprogramada', 'cancelada'))
    or (old_status = 'en_transito' and new_status in ('entregada', 'entrega_parcial', 'rechazada', 'reprogramada'))
    or (old_status in ('entregada', 'entrega_parcial', 'rechazada') and new_status = 'devuelta')
  ) then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_TRANSITION_INVALID';
  end if;

  if new_status = 'reprogramada' then
    if nullif(payload->>'delivery_date', '') is null or description is null then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_REPROGRAM_REASON_REQUIRED';
    end if;
    update public.distribution_deliveries
    set tracking_status = new_status, delivery_date = (payload->>'delivery_date')::date,
        observations = concat_ws(E'\n', nullif(observations, ''), description), updated_by = actor_id
    where id = v_delivery_id;
    event_type := 'reprogramada';
  elsif new_status in ('entregada', 'entrega_parcial', 'rechazada') then
    if new_status = 'entregada' then
      update public.distribution_delivery_items
      set delivered_quantity = shipped_quantity, rejected_quantity = 0
      where distribution_delivery_items.delivery_id = v_delivery_id;
    elsif new_status = 'rechazada' then
      update public.distribution_delivery_items
      set delivered_quantity = 0, rejected_quantity = shipped_quantity
      where distribution_delivery_items.delivery_id = v_delivery_id;
    else
      if jsonb_typeof(payload->'items') <> 'array' then
        raise exception using errcode = '22023', message = 'DISTRIBUTION_RESULT_ITEMS_REQUIRED';
      end if;
      for result_item in select value from jsonb_array_elements(payload->'items') loop
        select * into target_item
        from public.distribution_delivery_items item
        where item.id = (result_item->>'id')::uuid
          and item.delivery_id = v_delivery_id
          and item.organization_id = v_organization_id
        for update;
        if not found then raise exception using errcode = '22023', message = 'DISTRIBUTION_ITEM_INVALID'; end if;
        delivered := coalesce((result_item->>'delivered_quantity')::numeric, 0);
        rejected := coalesce((result_item->>'rejected_quantity')::numeric, 0);
        if delivered < 0 or rejected < 0 or delivered + rejected <> target_item.shipped_quantity then
          raise exception using errcode = '22023', message = 'DISTRIBUTION_RESULT_QUANTITY_INVALID';
        end if;
        update public.distribution_delivery_items
        set delivered_quantity = delivered, rejected_quantity = rejected
        where id = target_item.id;
      end loop;
    end if;
    update public.distribution_deliveries
    set tracking_status = new_status, completed_at = now(), updated_by = actor_id
    where id = v_delivery_id;
    event_type := 'resultado';
  else
    update public.distribution_deliveries
    set tracking_status = new_status,
        started_at = case when new_status = 'en_transito' then now() else started_at end,
        cancelled_at = case when new_status = 'cancelada' then now() else cancelled_at end,
        cancellation_reason = case when new_status = 'cancelada' then description else cancellation_reason end,
        completed_at = case when new_status = 'devuelta' then now() else completed_at end,
        updated_by = actor_id
    where id = v_delivery_id;
    event_type := case new_status when 'en_transito' then 'salida' when 'cancelada' then 'cancelada' else 'devolucion' end;
  end if;

  insert into public.distribution_delivery_events (
    organization_id, delivery_id, event_type, previous_status, new_status,
    description, metadata, created_by
  ) values (
    v_organization_id, v_delivery_id, event_type, old_status, new_status,
    coalesce(description, 'Estado actualizado a ' || replace(new_status, '_', ' ') || '.'),
    jsonb_build_object('delivery_date', payload->>'delivery_date'), actor_id
  );

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, old_values, new_values
  ) values (
    v_organization_id, actor_id, 'distribution.status_changed', 'distribution_delivery', v_delivery_id::text,
    jsonb_build_object('status', old_status), jsonb_build_object('status', new_status)
  );
  perform public.refresh_distribution_order_status(v_order_id);
end;
$$;

create or replace function public.save_distribution_incident(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  v_organization_id uuid := (payload->>'organization_id')::uuid;
  v_delivery_id uuid := (payload->>'delivery_id')::uuid;
  v_incident_id uuid := nullif(payload->>'id', '')::uuid;
  target_status text := coalesce(nullif(payload->>'status', ''), 'abierta');
begin
  if actor_id is null or not public.has_organization_permission(v_organization_id, 'DISTRIBUTION_TRACK') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;
  if not exists (select 1 from public.distribution_deliveries d where d.id = v_delivery_id and d.organization_id = v_organization_id) then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_NOT_FOUND';
  end if;

  if v_incident_id is null then
    insert into public.distribution_incidents (
      organization_id, delivery_id, incident_type, severity, description, status, created_by, updated_by
    ) values (
      v_organization_id, v_delivery_id, payload->>'incident_type', payload->>'severity',
      btrim(payload->>'description'), target_status, actor_id, actor_id
    ) returning id into v_incident_id;
  else
    update public.distribution_incidents set
      status = target_status,
      resolution = nullif(btrim(payload->>'resolution'), ''),
      resolved_at = case when target_status in ('resuelta', 'cerrada') then now() else null end,
      updated_by = actor_id
    where id = v_incident_id and delivery_id = v_delivery_id and organization_id = v_organization_id;
    if not found then raise exception using errcode = 'P0001', message = 'DISTRIBUTION_INCIDENT_NOT_FOUND'; end if;
  end if;

  insert into public.distribution_delivery_events (
    organization_id, delivery_id, event_type, description, metadata, created_by
  ) values (
    v_organization_id, v_delivery_id,
    case when target_status in ('resuelta', 'cerrada') then 'incidencia_resuelta' else 'incidencia' end,
    case when target_status in ('resuelta', 'cerrada') then 'Incidencia resuelta.' else btrim(payload->>'description') end,
    jsonb_build_object('incident_id', v_incident_id, 'severity', payload->>'severity'), actor_id
  );
  return v_incident_id;
end;
$$;

create or replace function public.register_distribution_return(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  v_organization_id uuid := (payload->>'organization_id')::uuid;
  v_delivery_id uuid := (payload->>'delivery_id')::uuid;
  v_return_id uuid;
  v_order_id uuid;
  item_payload jsonb;
  target_item public.distribution_delivery_items%rowtype;
  quantity numeric;
  already_returned numeric;
  delivered_total numeric;
  returned_total numeric;
  v_old_status text;
  v_new_status text;
begin
  if actor_id is null or not public.has_organization_permission(v_organization_id, 'DISTRIBUTION_TRACK') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;
  select delivery.distribution_order_id, delivery.tracking_status into v_order_id, v_old_status
  from public.distribution_deliveries delivery
  where delivery.id = v_delivery_id and delivery.organization_id = v_organization_id
    and tracking_status in ('entregada', 'entrega_parcial', 'rechazada')
  for update;
  if not found then raise exception using errcode = '22023', message = 'DISTRIBUTION_RETURN_INVALID'; end if;

  insert into public.distribution_returns (
    organization_id, delivery_id, reason, notes, created_by, updated_by
  ) values (
    v_organization_id, v_delivery_id, btrim(payload->>'reason'),
    nullif(btrim(payload->>'notes'), ''), actor_id, actor_id
  ) returning id into v_return_id;

  if jsonb_typeof(payload->'items') <> 'array' or jsonb_array_length(payload->'items') = 0 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_RETURN_ITEMS_REQUIRED';
  end if;
  for item_payload in select value from jsonb_array_elements(payload->'items') loop
    select * into target_item from public.distribution_delivery_items item
    where item.id = (item_payload->>'delivery_item_id')::uuid
      and item.delivery_id = v_delivery_id and item.organization_id = v_organization_id
    for update;
    if not found then raise exception using errcode = '22023', message = 'DISTRIBUTION_ITEM_INVALID'; end if;
    quantity := (item_payload->>'quantity')::numeric;
    select coalesce(sum(return_item.quantity), 0) into already_returned
    from public.distribution_return_items return_item
    where return_item.delivery_item_id = target_item.id;
    if quantity <= 0 or already_returned + quantity > target_item.delivered_quantity then
      raise exception using errcode = '22023', message = 'DISTRIBUTION_RETURN_QUANTITY_INVALID';
    end if;
    insert into public.distribution_return_items (
      organization_id, return_id, delivery_item_id, quantity, item_condition
    ) values (
      v_organization_id, v_return_id, target_item.id, quantity, item_payload->>'item_condition'
    );
    update public.distribution_delivery_items
    set returned_quantity = returned_quantity + quantity
    where id = target_item.id;
  end loop;

  select coalesce(sum(item.delivered_quantity), 0), coalesce(sum(item.returned_quantity), 0)
    into delivered_total, returned_total
  from public.distribution_delivery_items item
  where item.delivery_id = v_delivery_id;

  v_new_status := case
    when delivered_total > 0 and returned_total >= delivered_total then 'devuelta'
    else v_old_status
  end;

  update public.distribution_deliveries
  set tracking_status = v_new_status,
      completed_at = case when v_new_status = 'devuelta' then now() else completed_at end,
      updated_by = actor_id
  where id = v_delivery_id;
  insert into public.distribution_delivery_events (
    organization_id, delivery_id, event_type, previous_status, new_status,
    description, metadata, created_by
  ) values (
    v_organization_id, v_delivery_id, 'devolucion', v_old_status, v_new_status,
    btrim(payload->>'reason'), jsonb_build_object('return_id', v_return_id), actor_id
  );
  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values
  ) values (
    v_organization_id, actor_id, 'distribution.return_registered', 'distribution_return', v_return_id::text,
    jsonb_build_object('delivery_id', v_delivery_id)
  );
  perform public.refresh_distribution_order_status(v_order_id);
  return v_return_id;
end;
$$;

create or replace function public.register_distribution_evidence(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  v_organization_id uuid := (payload->>'organization_id')::uuid;
  v_delivery_id uuid := (payload->>'delivery_id')::uuid;
  v_evidence_id uuid;
  storage_path text := payload->>'storage_path';
begin
  if actor_id is null or not public.has_organization_permission(v_organization_id, 'DISTRIBUTION_EVIDENCE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;
  if not exists (select 1 from public.distribution_deliveries d where d.id = v_delivery_id and d.organization_id = v_organization_id) then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_NOT_FOUND';
  end if;
  if storage_path not like v_organization_id::text || '/' || v_delivery_id::text || '/%' then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_EVIDENCE_PATH_INVALID';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'distribution-evidence'
      and object.name = storage_path
      and object.owner_id = actor_id::text
  ) then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_EVIDENCE_FILE_NOT_FOUND';
  end if;
  insert into public.distribution_evidence (
    organization_id, delivery_id, evidence_type, file_name, storage_path,
    mime_type, file_size, notes, created_by
  ) values (
    v_organization_id, v_delivery_id, payload->>'evidence_type', btrim(payload->>'file_name'),
    storage_path, payload->>'mime_type', (payload->>'file_size')::bigint,
    nullif(btrim(payload->>'notes'), ''), actor_id
  ) returning id into v_evidence_id;
  insert into public.distribution_delivery_events (
    organization_id, delivery_id, event_type, description, metadata, created_by
  ) values (
    v_organization_id, v_delivery_id, 'evidencia', 'Evidencia adjuntada: ' || btrim(payload->>'file_name'),
    jsonb_build_object('evidence_id', v_evidence_id, 'evidence_type', payload->>'evidence_type'), actor_id
  );
  return v_evidence_id;
end;
$$;

-- 6. Bucket privado y validación de rutas de Storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'distribution-evidence', 'distribution-evidence', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.can_access_distribution_object(object_name text, permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (storage.foldername(object_name))[1] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(object_name))[2] ~* '^[0-9a-f-]{36}$'
    and public.has_organization_permission(((storage.foldername(object_name))[1])::uuid, permission_code)
    and exists (
      select 1
      from public.distribution_deliveries delivery
      where delivery.organization_id = ((storage.foldername(object_name))[1])::uuid
        and delivery.id = ((storage.foldername(object_name))[2])::uuid
    );
$$;

revoke all on function private.can_access_distribution_object(text, text) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.can_access_distribution_object(text, text) to authenticated;

create policy distribution_evidence_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'distribution-evidence'
  and private.can_access_distribution_object(name, 'DISTRIBUTION_VIEW')
);

create policy distribution_evidence_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'distribution-evidence'
  and private.can_access_distribution_object(name, 'DISTRIBUTION_EVIDENCE')
);

-- 7. RLS y privilegios explícitos
alter table public.distribution_orders enable row level security;
alter table public.distribution_order_items enable row level security;
alter table public.distribution_delivery_items enable row level security;
alter table public.distribution_delivery_events enable row level security;
alter table public.distribution_incidents enable row level security;
alter table public.distribution_evidence enable row level security;
alter table public.distribution_returns enable row level security;
alter table public.distribution_return_items enable row level security;

create policy distribution_orders_select on public.distribution_orders
for select to authenticated using (public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'));
create policy distribution_order_items_select on public.distribution_order_items
for select to authenticated using (public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'));
create policy distribution_delivery_items_select on public.distribution_delivery_items
for select to authenticated using (public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'));
create policy distribution_delivery_events_select on public.distribution_delivery_events
for select to authenticated using (public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'));
create policy distribution_incidents_select on public.distribution_incidents
for select to authenticated using (public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'));
create policy distribution_evidence_select on public.distribution_evidence
for select to authenticated using (public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'));
create policy distribution_returns_select on public.distribution_returns
for select to authenticated using (public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'));
create policy distribution_return_items_select on public.distribution_return_items
for select to authenticated using (public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'));

revoke all on table
  public.distribution_orders,
  public.distribution_order_items,
  public.distribution_delivery_items,
  public.distribution_delivery_events,
  public.distribution_incidents,
  public.distribution_evidence,
  public.distribution_returns,
  public.distribution_return_items
from anon, authenticated;

grant select on table
  public.distribution_orders,
  public.distribution_order_items,
  public.distribution_delivery_items,
  public.distribution_delivery_events,
  public.distribution_incidents,
  public.distribution_evidence,
  public.distribution_returns,
  public.distribution_return_items
to authenticated;

revoke all on function public.save_distribution_delivery(jsonb) from public, anon, authenticated;
revoke all on function public.transition_distribution_delivery(jsonb) from public, anon, authenticated;
revoke all on function public.save_distribution_incident(jsonb) from public, anon, authenticated;
revoke all on function public.register_distribution_return(jsonb) from public, anon, authenticated;
revoke all on function public.register_distribution_evidence(jsonb) from public, anon, authenticated;

grant execute on function public.save_distribution_delivery(jsonb) to authenticated;
grant execute on function public.transition_distribution_delivery(jsonb) to authenticated;
grant execute on function public.save_distribution_incident(jsonb) to authenticated;
grant execute on function public.register_distribution_return(jsonb) to authenticated;
grant execute on function public.register_distribution_evidence(jsonb) to authenticated;
