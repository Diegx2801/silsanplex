-- ============================================================
-- SILSANPLEX: modulo de reparaciones
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Control de series en productos y restauracion compatible
-- ------------------------------------------------------------

alter table public.products
  add column serial_control boolean not null default false;

comment on column public.products.serial_control is
  'Indica si el producto requiere un numero de serie al registrar una reparacion.';

-- Conserva la firma existente y agrega el campo nuevo al conjunto restaurable.
create or replace function public.restore_product_version(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_version_number integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  version_snapshot jsonb;
begin
  if actor_id is null
    or not public.has_organization_permission(requested_organization_id, 'PRODUCTS_MANAGE')
  then
    raise exception using errcode = '42501', message = 'PRODUCT_VERSION_RESTORE_FORBIDDEN';
  end if;

  select version.snapshot
  into version_snapshot
  from public.product_versions version
  where version.organization_id = requested_organization_id
    and version.product_id = requested_product_id
    and version.version_number = requested_version_number;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRODUCT_VERSION_NOT_FOUND';
  end if;

  perform set_config('app.product_restore_version', requested_version_number::text, true);

  update public.products product
  set code = version_snapshot ->> 'code',
      description = version_snapshot ->> 'description',
      extended_description = version_snapshot ->> 'extended_description',
      barcode = version_snapshot ->> 'barcode',
      category = version_snapshot ->> 'category',
      subline = version_snapshot ->> 'subline',
      laboratory = version_snapshot ->> 'laboratory',
      presentation = version_snapshot ->> 'presentation',
      unit_of_measure = version_snapshot ->> 'unit_of_measure',
      tax_affectation = coalesce(version_snapshot ->> 'tax_affectation', 'por-definir'),
      cost = nullif(version_snapshot ->> 'cost', '')::numeric,
      sale_price = nullif(version_snapshot ->> 'sale_price', '')::numeric,
      minimum_sale_price = nullif(version_snapshot ->> 'minimum_sale_price', '')::numeric,
      maximum_stock = nullif(version_snapshot ->> 'maximum_stock', '')::numeric,
      width_cm = nullif(version_snapshot ->> 'width_cm', '')::numeric,
      height_cm = nullif(version_snapshot ->> 'height_cm', '')::numeric,
      length_cm = nullif(version_snapshot ->> 'length_cm', '')::numeric,
      weight_kg = nullif(version_snapshot ->> 'weight_kg', '')::numeric,
      health_registry = version_snapshot ->> 'health_registry',
      batch_control = coalesce((version_snapshot ->> 'batch_control')::boolean, false),
      expiration_control = coalesce((version_snapshot ->> 'expiration_control')::boolean, false),
      serial_control = coalesce((version_snapshot ->> 'serial_control')::boolean, false),
      prescription_sale = coalesce((version_snapshot ->> 'prescription_sale')::boolean, false),
      is_active = coalesce((version_snapshot ->> 'is_active')::boolean, true),
      updated_by = actor_id
  where product.organization_id = requested_organization_id
    and product.id = requested_product_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRODUCT_VERSION_NOT_FOUND';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 2. Capacidades
-- ------------------------------------------------------------

insert into public.permissions (code, name, description)
values
  ('REPAIRS_VIEW', 'Consultar reparaciones', 'Consultar reparaciones, diagnosticos, cotizaciones y trazabilidad.'),
  ('REPAIRS_CREATE', 'Crear reparaciones', 'Registrar nuevas ordenes de reparacion.'),
  ('REPAIRS_UPDATE', 'Actualizar reparaciones', 'Actualizar datos de reparaciones y preparar cotizaciones.'),
  ('REPAIRS_ASSIGN', 'Asignar reparaciones', 'Asignar tecnicos activos a reparaciones.'),
  ('REPAIRS_CHANGE_STATUS', 'Cambiar estado de reparaciones', 'Avanzar reparaciones y registrar diagnosticos y pruebas.'),
  ('REPAIRS_APPROVE_QUOTE', 'Aprobar cotizaciones de reparacion', 'Aprobar o rechazar cotizaciones pendientes.'),
  ('REPAIRS_USE_PARTS', 'Usar repuestos', 'Reservar, consumir y cancelar repuestos de reparaciones.'),
  ('REPAIRS_DELIVER', 'Entregar reparaciones', 'Confirmar la entrega de reparaciones terminadas.')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
values
  ('ADMIN', 'REPAIRS_VIEW'),
  ('ADMIN', 'REPAIRS_CREATE'),
  ('ADMIN', 'REPAIRS_UPDATE'),
  ('ADMIN', 'REPAIRS_ASSIGN'),
  ('ADMIN', 'REPAIRS_CHANGE_STATUS'),
  ('ADMIN', 'REPAIRS_APPROVE_QUOTE'),
  ('ADMIN', 'REPAIRS_USE_PARTS'),
  ('ADMIN', 'REPAIRS_DELIVER'),
  ('VENTAS', 'REPAIRS_VIEW'),
  ('VENTAS', 'REPAIRS_CREATE'),
  ('VENTAS', 'REPAIRS_UPDATE'),
  ('VENTAS', 'REPAIRS_APPROVE_QUOTE'),
  ('ALMACEN', 'REPAIRS_VIEW'),
  ('ALMACEN', 'REPAIRS_USE_PARTS')
on conflict (role_code, permission_code) do nothing;

-- ------------------------------------------------------------
-- 3. Reparaciones y diagnosticos
-- ------------------------------------------------------------

create sequence public.repairs_code_seq;

create table public.repairs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repair_code text not null default ('REP-' || lpad(nextval('public.repairs_code_seq'::regclass)::text, 8, '0')),
  customer_id uuid not null,
  product_id uuid not null,
  serial_number text,
  serial_control_snapshot boolean not null default false,
  received_at timestamptz not null default now(),
  estimated_delivery_date date,
  delivered_at timestamptz,
  status text not null default 'received',
  priority text not null default 'normal',
  problem_description text not null,
  diagnosis text,
  applied_solution text,
  notes text,
  customer_reference text,
  sale_document_id uuid,
  warranty_reference text,
  assigned_technician_id uuid,
  customer_name_snapshot text not null,
  customer_document_snapshot text not null,
  product_code_snapshot text not null,
  product_description_snapshot text not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint repairs_customer_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint repairs_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint repairs_assigned_technician_fk
    foreign key (organization_id, assigned_technician_id)
    references public.organization_memberships (organization_id, user_id) on delete restrict,
  constraint repairs_organization_id_id_key unique (organization_id, id),
  constraint repairs_repair_code_length check (char_length(btrim(repair_code)) between 8 and 20),
  constraint repairs_repair_code_format check (repair_code ~ '^REP-[0-9]{8,}$'),
  constraint repairs_serial_number_length check (
    serial_number is null or char_length(btrim(serial_number)) between 1 and 120
  ),
  constraint repairs_status_valid check (
    status in (
      'received', 'diagnosis', 'quote_pending', 'waiting_customer_approval',
      'quote_approved', 'in_repair', 'awaiting_parts', 'testing',
      'ready_for_delivery', 'delivered', 'cancelled', 'rejected', 'warranty'
    )
  ),
  constraint repairs_priority_valid check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint repairs_problem_description_length check (
    char_length(btrim(problem_description)) between 3 and 2000
  ),
  constraint repairs_diagnosis_length check (
    diagnosis is null or char_length(btrim(diagnosis)) <= 4000
  ),
  constraint repairs_applied_solution_length check (
    applied_solution is null or char_length(btrim(applied_solution)) <= 4000
  ),
  constraint repairs_notes_length check (
    notes is null or char_length(btrim(notes)) <= 4000
  ),
  constraint repairs_customer_reference_length check (
    customer_reference is null or char_length(btrim(customer_reference)) <= 160
  ),
  constraint repairs_warranty_reference_length check (
    warranty_reference is null or char_length(btrim(warranty_reference)) <= 160
  ),
  constraint repairs_snapshot_lengths check (
    char_length(btrim(customer_name_snapshot)) between 2 and 180
    and char_length(btrim(customer_document_snapshot)) between 1 and 80
    and char_length(btrim(product_code_snapshot)) between 1 and 80
    and char_length(btrim(product_description_snapshot)) between 2 and 240
  ),
  constraint repairs_estimated_date_valid check (
    estimated_delivery_date is null or estimated_delivery_date >= received_at::date
  ),
  constraint repairs_delivery_consistency check (
    (
      status = 'delivered'
      and delivered_at is not null
      and delivered_at >= received_at
    )
    or (
      status <> 'delivered'
      and delivered_at is null
    )
  )
);

create unique index repairs_organization_code_unique
  on public.repairs (organization_id, repair_code);
create index repairs_organization_status_received_idx
  on public.repairs (organization_id, status, received_at desc, id);
create index repairs_organization_customer_idx
  on public.repairs (organization_id, customer_id, received_at desc, id);
create index repairs_organization_product_serial_idx
  on public.repairs (organization_id, product_id, serial_number, received_at desc, id);
create index repairs_organization_technician_idx
  on public.repairs (organization_id, assigned_technician_id, status, received_at desc);
create index repairs_organization_priority_idx
  on public.repairs (organization_id, priority, received_at desc, id);
create index repairs_organization_estimated_delivery_idx
  on public.repairs (organization_id, estimated_delivery_date, status, id)
  where estimated_delivery_date is not null;

create trigger repairs_set_updated_at
before update on public.repairs
for each row execute function public.set_updated_at();

create table public.repair_diagnostics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repair_id uuid not null,
  diagnosed_at timestamptz not null default now(),
  technician_id uuid not null,
  symptoms text not null,
  cause_found text,
  recommended_solution text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint repair_diagnostics_repair_fk
    foreign key (organization_id, repair_id)
    references public.repairs (organization_id, id) on delete restrict,
  constraint repair_diagnostics_technician_fk
    foreign key (organization_id, technician_id)
    references public.organization_memberships (organization_id, user_id) on delete restrict,
  constraint repair_diagnostics_organization_id_id_key unique (organization_id, id),
  constraint repair_diagnostics_symptoms_length check (
    char_length(btrim(symptoms)) between 3 and 4000
  ),
  constraint repair_diagnostics_cause_length check (
    cause_found is null or char_length(btrim(cause_found)) <= 4000
  ),
  constraint repair_diagnostics_solution_length check (
    recommended_solution is null or char_length(btrim(recommended_solution)) <= 4000
  ),
  constraint repair_diagnostics_notes_length check (
    notes is null or char_length(btrim(notes)) <= 4000
  )
);

create index repair_diagnostics_repair_date_idx
  on public.repair_diagnostics (organization_id, repair_id, diagnosed_at desc, id);
create index repair_diagnostics_technician_idx
  on public.repair_diagnostics (organization_id, technician_id, diagnosed_at desc);

-- ------------------------------------------------------------
-- 4. Cotizaciones y detalle
-- ------------------------------------------------------------

create table public.repair_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repair_id uuid not null,
  version_number integer not null,
  status text not null default 'draft',
  currency text not null default 'PEN',
  prices_include_tax boolean not null default false,
  tax_rate numeric(7,4) not null default 0,
  subtotal numeric(20,2) not null default 0,
  tax numeric(20,2) not null default 0,
  total numeric(20,2) not null default 0,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approval_observation text,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_observation text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint repair_quotes_repair_fk
    foreign key (organization_id, repair_id)
    references public.repairs (organization_id, id) on delete restrict,
  constraint repair_quotes_organization_id_id_key unique (organization_id, id),
  constraint repair_quotes_version_positive check (version_number > 0),
  constraint repair_quotes_status_valid check (status in ('draft', 'pending', 'approved', 'rejected')),
  constraint repair_quotes_currency_valid check (currency in ('PEN', 'USD')),
  constraint repair_quotes_tax_rate_valid check (tax_rate between 0 and 100),
  constraint repair_quotes_totals_nonnegative check (subtotal >= 0 and tax >= 0 and total >= 0),
  constraint repair_quotes_observations_length check (
    (approval_observation is null or char_length(btrim(approval_observation)) <= 1000)
    and (rejection_observation is null or char_length(btrim(rejection_observation)) <= 1000)
  ),
  constraint repair_quotes_status_consistency check (
    (
      status in ('draft', 'pending')
      and approved_by is null and approved_at is null and approval_observation is null
      and rejected_by is null and rejected_at is null and rejection_observation is null
    )
    or (
      status = 'approved'
      and approved_by is not null and approved_at is not null
      and rejected_by is null and rejected_at is null and rejection_observation is null
    )
    or (
      status = 'rejected'
      and rejected_by is not null and rejected_at is not null
      and approved_by is null and approved_at is null and approval_observation is null
    )
  ),
  unique (organization_id, repair_id, version_number)
);

create index repair_quotes_repair_status_version_idx
  on public.repair_quotes (organization_id, repair_id, status, version_number desc, id);
create index repair_quotes_organization_created_idx
  on public.repair_quotes (organization_id, created_at desc, id);

create table public.repair_quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  quote_id uuid not null,
  line_type text not null,
  product_id uuid,
  description text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(16,4) not null,
  taxable boolean not null default true,
  line_subtotal numeric(20,2)
    generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),

  constraint repair_quote_items_quote_fk
    foreign key (organization_id, quote_id)
    references public.repair_quotes (organization_id, id) on delete restrict,
  constraint repair_quote_items_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint repair_quote_items_organization_id_id_key unique (organization_id, id),
  constraint repair_quote_items_line_type_valid check (
    line_type in ('labor', 'part', 'external_service')
  ),
  constraint repair_quote_items_product_consistency check (
    (line_type = 'part' and product_id is not null)
    or (line_type <> 'part' and product_id is null)
  ),
  constraint repair_quote_items_description_length check (
    char_length(btrim(description)) between 1 and 500
  ),
  constraint repair_quote_items_quantity_positive check (quantity > 0),
  constraint repair_quote_items_unit_price_nonnegative check (unit_price >= 0)
);

create index repair_quote_items_quote_idx
  on public.repair_quote_items (organization_id, quote_id, id);
create index repair_quote_items_product_idx
  on public.repair_quote_items (organization_id, product_id, created_at desc)
  where product_id is not null;

create trigger repair_quotes_set_updated_at
before update on public.repair_quotes
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 5. Repuestos y consumos
-- ------------------------------------------------------------

alter table public.inventory_movements
  add constraint inventory_movements_organization_id_id_key unique (organization_id, id);

create table public.repair_parts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repair_id uuid not null,
  product_id uuid not null,
  product_code_snapshot text not null,
  product_description_snapshot text not null,
  warehouse_id uuid not null,
  location_id uuid not null,
  stock_status text not null default 'available',
  lot text,
  expiration_date date,
  batch_control_snapshot boolean not null default false,
  expiration_control_snapshot boolean not null default false,
  quantity_requested numeric(14,3) not null,
  quantity_consumed numeric(14,3) not null default 0,
  status text not null default 'reserved',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint repair_parts_repair_fk
    foreign key (organization_id, repair_id)
    references public.repairs (organization_id, id) on delete restrict,
  constraint repair_parts_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint repair_parts_warehouse_fk
    foreign key (organization_id, warehouse_id)
    references public.warehouses (organization_id, id) on delete restrict,
  constraint repair_parts_location_fk
    foreign key (organization_id, warehouse_id, location_id)
    references public.warehouse_locations (organization_id, warehouse_id, id) on delete restrict,
  constraint repair_parts_organization_id_id_key unique (organization_id, id),
  constraint repair_parts_stock_status_valid check (
    stock_status in ('available', 'quarantine', 'damaged')
  ),
  constraint repair_parts_lot_length check (lot is null or char_length(btrim(lot)) between 1 and 60),
  constraint repair_parts_quantity_requested_positive check (quantity_requested > 0),
  constraint repair_parts_quantity_consumed_valid check (
    quantity_consumed >= 0 and quantity_consumed <= quantity_requested
  ),
  constraint repair_parts_status_valid check (status in ('reserved', 'consumed', 'cancelled')),
  constraint repair_parts_status_quantity_consistency check (
    (status = 'reserved' and quantity_consumed < quantity_requested)
    or (status = 'consumed' and quantity_consumed = quantity_requested)
    or (status = 'cancelled')
  ),
  constraint repair_parts_snapshot_lengths check (
    char_length(btrim(product_code_snapshot)) between 1 and 80
    and char_length(btrim(product_description_snapshot)) between 2 and 240
  ),
  constraint repair_parts_notes_length check (
    notes is null or char_length(btrim(notes)) <= 1000
  )
);

create index repair_parts_repair_status_idx
  on public.repair_parts (organization_id, repair_id, status, created_at, id);
create index repair_parts_stock_bucket_idx
  on public.repair_parts (
    organization_id, product_id, warehouse_id, location_id, stock_status,
    (lower(coalesce(lot, ''))), expiration_date, status
  );
create index repair_parts_product_idx
  on public.repair_parts (organization_id, product_id, created_at desc, id);

create table public.repair_part_consumptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repair_part_id uuid not null,
  quantity numeric(14,3) not null,
  warehouse_id uuid not null,
  location_id uuid not null,
  stock_status text not null,
  lot text,
  expiration_date date,
  unit_cost numeric(16,4) not null,
  inventory_movement_id uuid not null,
  operation_key uuid not null,
  consumed_by uuid references auth.users(id) on delete set null,
  consumed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint repair_part_consumptions_part_fk
    foreign key (organization_id, repair_part_id)
    references public.repair_parts (organization_id, id) on delete restrict,
  constraint repair_part_consumptions_warehouse_fk
    foreign key (organization_id, warehouse_id)
    references public.warehouses (organization_id, id) on delete restrict,
  constraint repair_part_consumptions_location_fk
    foreign key (organization_id, warehouse_id, location_id)
    references public.warehouse_locations (organization_id, warehouse_id, id) on delete restrict,
  constraint repair_part_consumptions_movement_fk
    foreign key (organization_id, inventory_movement_id)
    references public.inventory_movements (organization_id, id) on delete restrict,
  constraint repair_part_consumptions_organization_id_id_key unique (organization_id, id),
  constraint repair_part_consumptions_quantity_positive check (quantity > 0),
  constraint repair_part_consumptions_stock_status_valid check (
    stock_status in ('available', 'quarantine', 'damaged')
  ),
  constraint repair_part_consumptions_lot_length check (
    lot is null or char_length(btrim(lot)) between 1 and 60
  ),
  constraint repair_part_consumptions_unit_cost_nonnegative check (unit_cost >= 0),
  constraint repair_part_consumptions_operation_key_unique unique (organization_id, operation_key)
);

create index repair_part_consumptions_part_idx
  on public.repair_part_consumptions (organization_id, repair_part_id, consumed_at, id);
create index repair_part_consumptions_movement_idx
  on public.repair_part_consumptions (organization_id, inventory_movement_id);

create trigger repair_parts_set_updated_at
before update on public.repair_parts
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 6. Pruebas y eventos
-- ------------------------------------------------------------

create table public.repair_tests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repair_id uuid not null,
  test_type text not null,
  result text not null,
  passed boolean not null,
  performed_by uuid not null,
  notes text,
  completed_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint repair_tests_repair_fk
    foreign key (organization_id, repair_id)
    references public.repairs (organization_id, id) on delete restrict,
  constraint repair_tests_performed_by_fk
    foreign key (organization_id, performed_by)
    references public.organization_memberships (organization_id, user_id) on delete restrict,
  constraint repair_tests_organization_id_id_key unique (organization_id, id),
  constraint repair_tests_type_length check (char_length(btrim(test_type)) between 2 and 120),
  constraint repair_tests_result_length check (char_length(btrim(result)) between 1 and 2000),
  constraint repair_tests_notes_length check (notes is null or char_length(btrim(notes)) <= 1000)
);

create index repair_tests_repair_completed_idx
  on public.repair_tests (organization_id, repair_id, completed_at desc, id);
create index repair_tests_repair_result_idx
  on public.repair_tests (organization_id, repair_id, passed, completed_at desc);

create table public.repair_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repair_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid references auth.users(id) on delete set null,
  observation text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint repair_events_repair_fk
    foreign key (organization_id, repair_id)
    references public.repairs (organization_id, id) on delete restrict,
  constraint repair_events_event_type_valid check (
    event_type in (
      'CREATED', 'UPDATED', 'STATUS_CHANGED', 'DIAGNOSIS_CREATED',
      'QUOTE_CREATED', 'QUOTE_SUBMITTED', 'QUOTE_APPROVED', 'QUOTE_REJECTED',
      'PART_RESERVED', 'PART_CONSUMED', 'PART_CANCELLED', 'TEST_COMPLETED',
      'DELIVERED', 'CANCELLED'
    )
  ),
  constraint repair_events_status_lengths check (
    from_status is null or char_length(from_status) between 1 and 40
  ),
  constraint repair_events_to_status_lengths check (
    to_status is null or char_length(to_status) between 1 and 40
  ),
  constraint repair_events_observation_length check (
    observation is null or char_length(btrim(observation)) <= 2000
  )
);

create index repair_events_repair_created_idx
  on public.repair_events (organization_id, repair_id, created_at desc, id desc);
create index repair_events_organization_type_idx
  on public.repair_events (organization_id, event_type, created_at desc, id desc);

-- ------------------------------------------------------------
-- 7. Validaciones y protecciones de dominio
-- ------------------------------------------------------------

alter table public.inventory_movements
  drop constraint inventory_movements_source_valid;

alter table public.inventory_movements
  add constraint inventory_movements_source_valid
    check (source_type in (
      'manual', 'purchase-receipt', 'warehouse-transfer',
      'stock-reclassification', 'supplier-return', 'repair-consumption'
    ));

create unique index inventory_movements_repair_consumption_unique
  on public.inventory_movements (source_type, source_id)
  where source_type = 'repair-consumption';

-- La reserva conserva la configuracion vigente al abrir la orden. La salida
-- correspondiente puede tener un lote nulo si el producto cambio despues a
-- control por lote; la validacion de la reserva ya protege ese caso historico.
create or replace function public.validate_product_tracking_requirements()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
begin
  if new.source_type = 'repair-consumption'
    and coalesce(current_setting('app.repair_consumption_tracking_write', true), '') = 'true'
  then
    return new;
  end if;

  select product.*
  into product_row
  from public.products product
  where product.id = new.product_id
    and product.organization_id = new.organization_id;

  if not found then
    return new;
  end if;

  if product_row.batch_control and nullif(btrim(new.lot), '') is null then
    raise exception using errcode = 'P0001', message = 'INVENTORY_BATCH_REQUIRED';
  end if;

  if product_row.expiration_control
    and new.movement_type in ('entrada', 'ajuste-positivo')
    and new.expiration_date is null
  then
    raise exception using errcode = 'P0001', message = 'INVENTORY_EXPIRATION_REQUIRED';
  end if;

  return new;
end;
$$;

create or replace function public.repair_technician_is_active(
  requested_organization_id uuid,
  requested_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    join public.organizations organization on organization.id = membership.organization_id
    where membership.organization_id = requested_organization_id
      and membership.user_id = requested_user_id
      and membership.is_active
      and profile.is_active
      and organization.is_active
  );
$$;

create or replace function public.repair_status_transition_allowed(
  requested_from_status text,
  requested_to_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case requested_from_status
    when 'received' then requested_to_status in ('diagnosis', 'warranty', 'cancelled')
    when 'warranty' then requested_to_status in ('diagnosis', 'in_repair', 'cancelled')
    when 'diagnosis' then requested_to_status in (
      'quote_pending', 'waiting_customer_approval', 'in_repair', 'cancelled'
    )
    when 'quote_pending' then requested_to_status in (
      'diagnosis', 'waiting_customer_approval', 'cancelled'
    )
    when 'waiting_customer_approval' then requested_to_status in ('quote_approved', 'rejected', 'cancelled')
    when 'quote_approved' then requested_to_status in ('in_repair', 'cancelled')
    when 'in_repair' then requested_to_status in ('awaiting_parts', 'testing', 'cancelled')
    when 'awaiting_parts' then requested_to_status in ('in_repair', 'testing', 'cancelled')
    when 'testing' then requested_to_status in ('in_repair', 'ready_for_delivery', 'cancelled')
    when 'ready_for_delivery' then requested_to_status in ('delivered', 'cancelled')
    else false
  end;
$$;

create or replace function public.validate_repair_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
  customer_row public.customers%rowtype;
begin
  new.serial_number := nullif(btrim(new.serial_number), '');

  select product.*
  into product_row
  from public.products product
  where product.organization_id = new.organization_id
    and product.id = new.product_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_NOT_FOUND';
  end if;

  if tg_op = 'INSERT' then
    if not product_row.is_active then
      raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_UNAVAILABLE';
    end if;
  elsif new.product_id is distinct from old.product_id and not product_row.is_active then
    raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_UNAVAILABLE';
  end if;

  if tg_op = 'INSERT' or new.product_id is distinct from old.product_id then
    new.serial_control_snapshot := product_row.serial_control;
  else
    new.serial_control_snapshot := old.serial_control_snapshot;
  end if;

  if new.serial_control_snapshot <> (new.serial_number is not null) then
    raise exception using errcode = 'P0001', message = 'REPAIR_SERIAL_NUMBER_RULE_VIOLATION';
  end if;

  if tg_op = 'INSERT' then
    select customer.*
    into customer_row
    from public.customers customer
    where customer.organization_id = new.organization_id
      and customer.id = new.customer_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_NOT_FOUND';
    end if;
    if not customer_row.is_active then
      raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_UNAVAILABLE';
    end if;
  elsif new.customer_id is distinct from old.customer_id then
    select customer.*
    into customer_row
    from public.customers customer
    where customer.organization_id = new.organization_id
      and customer.id = new.customer_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_NOT_FOUND';
    end if;
    if not customer_row.is_active then
      raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_UNAVAILABLE';
    end if;
  end if;

  if new.assigned_technician_id is not null
    and (
      tg_op = 'INSERT'
      or new.assigned_technician_id is distinct from old.assigned_technician_id
    )
    and not public.repair_technician_is_active(new.organization_id, new.assigned_technician_id)
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_TECHNICIAN_UNAVAILABLE';
  end if;

  return new;
end;
$$;

create trigger repairs_validate_row
before insert or update on public.repairs
for each row execute function public.validate_repair_row();

create or replace function public.protect_repair_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.repair_code is distinct from old.repair_code
    or new.received_at is distinct from old.received_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_IMMUTABLE_FIELDS';
  end if;
  return new;
end;
$$;

create trigger repairs_protect_immutable_fields
before update on public.repairs
for each row execute function public.protect_repair_immutable_fields();

create or replace function public.protect_repair_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if coalesce(current_setting('app.repairs_status_write', true), '') <> 'true' then
      raise exception using errcode = 'P0001', message = 'REPAIR_STATUS_RPC_REQUIRED';
    end if;
    if not public.repair_status_transition_allowed(old.status, new.status) then
      raise exception using errcode = 'P0001', message = 'REPAIR_STATUS_TRANSITION_INVALID';
    end if;
  end if;
  return new;
end;
$$;

create trigger repairs_protect_status_transition
before update on public.repairs
for each row execute function public.protect_repair_status_transition();

create or replace function public.validate_repair_quote_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_is_active boolean;
begin
  if new.line_type = 'part' then
    select product.is_active
    into product_is_active
    from public.products product
    where product.organization_id = new.organization_id
      and product.id = new.product_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_PRODUCT_NOT_FOUND';
    end if;
    if not product_is_active then
      raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_PRODUCT_UNAVAILABLE';
    end if;
  end if;
  return new;
end;
$$;

create trigger repair_quote_items_validate_product
before insert or update on public.repair_quote_items
for each row execute function public.validate_repair_quote_item();

create or replace function public.protect_repair_quote_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gross_total numeric;
  taxable_gross numeric;
  calculated_subtotal numeric;
  calculated_tax numeric;
begin
  if coalesce(current_setting('app.repair_quote_totals_write', true), '') = 'true' then
    return new;
  end if;

  select
    coalesce(sum(item.line_subtotal), 0),
    coalesce(sum(item.line_subtotal) filter (where item.taxable), 0)
  into gross_total, taxable_gross
  from public.repair_quote_items item
  where item.organization_id = new.organization_id
    and item.quote_id = new.id;

  if new.prices_include_tax then
    calculated_subtotal := round(
      gross_total - taxable_gross
      + taxable_gross / (1 + new.tax_rate / 100),
      2
    );
    calculated_tax := round(gross_total - calculated_subtotal, 2);
  else
    calculated_subtotal := round(gross_total, 2);
    calculated_tax := round(taxable_gross * new.tax_rate / 100, 2);
  end if;

  new.subtotal := calculated_subtotal;
  new.tax := calculated_tax;
  new.total := round(calculated_subtotal + calculated_tax, 2);
  return new;
end;
$$;

create trigger repair_quotes_protect_totals
before insert or update on public.repair_quotes
for each row execute function public.protect_repair_quote_totals();

create or replace function public.recalculate_repair_quote_totals(
  requested_organization_id uuid,
  requested_quote_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  include_tax boolean;
  rate numeric;
  gross_total numeric;
  taxable_gross numeric;
  calculated_subtotal numeric;
  calculated_tax numeric;
begin
  select quote.prices_include_tax, quote.tax_rate
  into include_tax, rate
  from public.repair_quotes quote
  where quote.organization_id = requested_organization_id
    and quote.id = requested_quote_id;

  if not found then
    return;
  end if;

  select
    coalesce(sum(item.line_subtotal), 0),
    coalesce(sum(item.line_subtotal) filter (where item.taxable), 0)
  into gross_total, taxable_gross
  from public.repair_quote_items item
  where item.organization_id = requested_organization_id
    and item.quote_id = requested_quote_id;

  if include_tax then
    calculated_subtotal := round(
      gross_total - taxable_gross
      + taxable_gross / (1 + rate / 100),
      2
    );
    calculated_tax := round(gross_total - calculated_subtotal, 2);
  else
    calculated_subtotal := round(gross_total, 2);
    calculated_tax := round(taxable_gross * rate / 100, 2);
  end if;

  perform set_config('app.repair_quote_totals_write', 'true', true);
  update public.repair_quotes quote
  set subtotal = calculated_subtotal,
      tax = calculated_tax,
      total = round(calculated_subtotal + calculated_tax, 2)
  where quote.organization_id = requested_organization_id
    and quote.id = requested_quote_id;
  perform set_config('app.repair_quote_totals_write', 'false', true);
end;
$$;

create or replace function public.repair_quote_items_recalculate_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_repair_quote_totals(old.organization_id, old.quote_id);
    return old;
  end if;

  perform public.recalculate_repair_quote_totals(new.organization_id, new.quote_id);
  return new;
end;
$$;

create trigger repair_quote_items_recalculate_totals
after insert or update or delete on public.repair_quote_items
for each row execute function public.repair_quote_items_recalculate_totals();

create or replace function public.repair_quote_settings_recalculate_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recalculate_repair_quote_totals(new.organization_id, new.id);
  return new;
end;
$$;

create trigger repair_quotes_settings_recalculate_totals
after insert or update of prices_include_tax, tax_rate on public.repair_quotes
for each row execute function public.repair_quote_settings_recalculate_totals();

create or replace function public.validate_repair_part_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
  warehouse_is_active boolean;
  location_is_active boolean;
begin
  select product.*
  into product_row
  from public.products product
  where product.organization_id = new.organization_id
    and product.id = new.product_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_PRODUCT_NOT_FOUND';
  end if;
  if tg_op = 'INSERT' or new.product_id is distinct from old.product_id then
    if not product_row.is_active then
      raise exception using errcode = 'P0001', message = 'REPAIR_PART_PRODUCT_UNAVAILABLE';
    end if;
  end if;
  if tg_op = 'INSERT' or new.product_id is distinct from old.product_id then
    new.batch_control_snapshot := product_row.batch_control;
    new.expiration_control_snapshot := product_row.expiration_control;
  else
    new.batch_control_snapshot := old.batch_control_snapshot;
    new.expiration_control_snapshot := old.expiration_control_snapshot;
  end if;

  if new.batch_control_snapshot and nullif(btrim(new.lot), '') is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_LOT_REQUIRED';
  end if;
  if new.expiration_control_snapshot and new.expiration_date is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_EXPIRATION_REQUIRED';
  end if;

  select warehouse.is_active
  into warehouse_is_active
  from public.warehouses warehouse
  where warehouse.organization_id = new.organization_id
    and warehouse.id = new.warehouse_id;
  if not found or not warehouse_is_active then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_WAREHOUSE_UNAVAILABLE';
  end if;

  select location.is_active
  into location_is_active
  from public.warehouse_locations location
  where location.organization_id = new.organization_id
    and location.warehouse_id = new.warehouse_id
    and location.id = new.location_id;
  if not found or not location_is_active then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_LOCATION_UNAVAILABLE';
  end if;

  new.lot := nullif(btrim(new.lot), '');
  return new;
end;
$$;

create trigger repair_parts_validate_row
before insert or update on public.repair_parts
for each row execute function public.validate_repair_part_row();

create or replace function public.protect_repair_part_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.quantity_consumed is distinct from old.quantity_consumed
    or new.status is distinct from old.status
  )
  and coalesce(current_setting('app.repair_part_state_write', true), '') <> 'true'
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_STATE_RPC_REQUIRED';
  end if;
  return new;
end;
$$;

create trigger repair_parts_protect_state
before update on public.repair_parts
for each row execute function public.protect_repair_part_state();

create or replace function public.validate_repair_part_consumption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  part_row public.repair_parts%rowtype;
  movement_row public.inventory_movements%rowtype;
begin
  select part.*
  into part_row
  from public.repair_parts part
  where part.organization_id = new.organization_id
    and part.id = new.repair_part_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_NOT_FOUND';
  end if;
  if new.warehouse_id is distinct from part_row.warehouse_id
    or new.location_id is distinct from part_row.location_id
    or new.stock_status is distinct from part_row.stock_status
    or lower(coalesce(new.lot, '')) <> lower(coalesce(part_row.lot, ''))
    or new.expiration_date is distinct from part_row.expiration_date
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_BUCKET_MISMATCH';
  end if;

  select movement.*
  into movement_row
  from public.inventory_movements movement
  where movement.organization_id = new.organization_id
    and movement.id = new.inventory_movement_id;

  if not found
    or movement_row.source_type <> 'repair-consumption'
    or movement_row.source_id is distinct from new.id
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_CONSUMPTION_MOVEMENT_INVALID';
  end if;
  return new;
end;
$$;

create trigger repair_part_consumptions_validate
before insert on public.repair_part_consumptions
for each row execute function public.validate_repair_part_consumption();

create or replace function public.prevent_repair_part_consumption_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'REPAIR_PART_CONSUMPTION_IMMUTABLE';
end;
$$;

create trigger repair_part_consumptions_immutable
before update or delete on public.repair_part_consumptions
for each row execute function public.prevent_repair_part_consumption_mutation();

create or replace function public.prevent_repair_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'REPAIR_EVENT_IMMUTABLE';
end;
$$;

create trigger repair_events_immutable
before update or delete on public.repair_events
for each row execute function public.prevent_repair_event_mutation();

-- ------------------------------------------------------------
-- 8. Autorizacion y trazabilidad interna
-- ------------------------------------------------------------

create or replace function public.assert_repair_actor(
  requested_organization_id uuid,
  requested_permission text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if requested_organization_id is null or requested_permission is null then
    raise exception using errcode = '42501', message = 'REPAIR_FORBIDDEN';
  end if;

  -- Las funciones siguen disponibles para integraciones server-to-server.
  -- Una llamada authenticated siempre debe revalidar la sesion actual.
  if jwt_role = 'service_role' then
    return actor_id;
  end if;

  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not public.current_auth_session_is_active() then
    raise exception using errcode = '42501', message = 'AUTH_SESSION_INACTIVE';
  end if;
  if not public.has_organization_permission(requested_organization_id, requested_permission) then
    raise exception using errcode = '42501', message = 'REPAIR_FORBIDDEN';
  end if;
  return actor_id;
end;
$$;

create or replace function public.record_repair_event(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_event_type text,
  requested_from_status text,
  requested_to_status text,
  requested_actor_user_id uuid,
  requested_observation text,
  requested_metadata jsonb,
  requested_audit_action text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  repair_event_id bigint;
  event_metadata jsonb := coalesce(requested_metadata, '{}'::jsonb);
begin
  insert into public.repair_events (
    organization_id, repair_id, event_type, from_status, to_status,
    actor_user_id, observation, metadata
  ) values (
    requested_organization_id, requested_repair_id, requested_event_type,
    requested_from_status, requested_to_status, requested_actor_user_id,
    nullif(btrim(requested_observation), ''), event_metadata
  ) returning id into repair_event_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    requested_organization_id,
    requested_actor_user_id,
    requested_audit_action,
    'repair',
    requested_repair_id::text,
    case
      when requested_from_status is null then null
      else jsonb_build_object('status', requested_from_status)
    end,
    case
      when requested_to_status is null then '{}'::jsonb
      else jsonb_build_object('status', requested_to_status)
    end,
    event_metadata || jsonb_build_object(
      'repair_event_id', repair_event_id,
      'event_type', requested_event_type
    )
  );

  return repair_event_id;
end;
$$;

-- ------------------------------------------------------------
-- 9. Operaciones transaccionales de reparaciones
-- ------------------------------------------------------------

create function public.create_repair(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  customer_id uuid := nullif(payload ->> 'customer_id', '')::uuid;
  product_id uuid := nullif(payload ->> 'product_id', '')::uuid;
  assigned_technician_id uuid := nullif(payload ->> 'assigned_technician_id', '')::uuid;
  received_at_value timestamptz := coalesce(nullif(payload ->> 'received_at', '')::timestamptz, now());
  estimated_delivery_date_value date := nullif(payload ->> 'estimated_delivery_date', '')::date;
  serial_number_value text := nullif(btrim(payload ->> 'serial_number'), '');
  repair_status text := coalesce(nullif(lower(btrim(payload ->> 'status')), ''), 'received');
  priority_value text := coalesce(nullif(lower(btrim(payload ->> 'priority')), ''), 'normal');
  problem_value text := btrim(payload ->> 'problem_description');
  customer_row public.customers%rowtype;
  product_row public.products%rowtype;
  repair_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;

  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_CREATE');

  if customer_id is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_REQUIRED';
  end if;
  if product_id is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_REQUIRED';
  end if;
  if repair_status not in ('received', 'warranty') then
    raise exception using errcode = 'P0001', message = 'REPAIR_INITIAL_STATUS_INVALID';
  end if;

  select customer.*
  into customer_row
  from public.customers customer
  where customer.organization_id = organization_id
    and customer.id = customer_id
    and customer.is_active;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_UNAVAILABLE';
  end if;

  select product.*
  into product_row
  from public.products product
  where product.organization_id = organization_id
    and product.id = product_id
    and product.is_active;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_UNAVAILABLE';
  end if;

  if assigned_technician_id is not null then
    perform public.assert_repair_actor(organization_id, 'REPAIRS_ASSIGN');
    if not public.repair_technician_is_active(organization_id, assigned_technician_id) then
      raise exception using errcode = 'P0001', message = 'REPAIR_TECHNICIAN_UNAVAILABLE';
    end if;
  end if;

  if problem_value is null or char_length(problem_value) < 3 then
    raise exception using errcode = 'P0001', message = 'REPAIR_PROBLEM_REQUIRED';
  end if;

  insert into public.repairs (
    organization_id, customer_id, product_id, serial_number, received_at,
    estimated_delivery_date, status, priority, problem_description,
    notes, customer_reference, sale_document_id, warranty_reference,
    assigned_technician_id, customer_name_snapshot, customer_document_snapshot,
    product_code_snapshot, product_description_snapshot, created_by, updated_by
  ) values (
    organization_id, customer_id, product_id, serial_number_value, received_at_value,
    estimated_delivery_date_value, repair_status, priority_value, problem_value,
    nullif(btrim(payload ->> 'notes'), ''),
    nullif(btrim(payload ->> 'customer_reference'), ''),
    nullif(payload ->> 'sale_document_id', '')::uuid,
    nullif(btrim(payload ->> 'warranty_reference'), ''),
    assigned_technician_id,
    coalesce(nullif(btrim(customer_row.trade_name), ''), btrim(customer_row.legal_name)),
    customer_row.document_type || ' ' || customer_row.document_number,
    product_row.code,
    product_row.description,
    actor_id,
    actor_id
  ) returning id into repair_id;

  perform public.record_repair_event(
    organization_id,
    repair_id,
    'CREATED',
    null,
    repair_status,
    actor_id,
    null,
    jsonb_build_object('repair_code', (select repair.repair_code from public.repairs repair where repair.id = repair_id)),
    'REPAIR_CREATED'
  );

  return repair_id;
end;
$$;

create function public.update_repair(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id uuid := nullif(payload ->> 'id', '')::uuid;
  old_repair public.repairs%rowtype;
  new_repair public.repairs%rowtype;
  customer_row public.customers%rowtype;
  product_row public.products%rowtype;
  customer_id_value uuid;
  product_id_value uuid;
  serial_number_value text;
  estimated_delivery_date_value date;
  priority_value text;
  problem_value text;
  diagnosis_value text;
  applied_solution_value text;
  notes_value text;
  customer_reference_value text;
  sale_document_id_value uuid;
  warranty_reference_value text;
  customer_name_snapshot_value text;
  customer_document_snapshot_value text;
  product_code_snapshot_value text;
  product_description_snapshot_value text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');

  select repair.*
  into old_repair
  from public.repairs repair
  where repair.organization_id = organization_id
    and repair.id = repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if old_repair.status in ('delivered', 'cancelled', 'rejected') then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_EDITABLE';
  end if;
  if payload ? 'status' and (payload ->> 'status') is distinct from old_repair.status then
    raise exception using errcode = 'P0001', message = 'REPAIR_STATUS_USE_STATUS_RPC';
  end if;
  if payload ? 'assigned_technician_id' then
    raise exception using errcode = 'P0001', message = 'REPAIR_ASSIGN_USE_ASSIGN_RPC';
  end if;
  if payload ? 'received_at' and (payload ->> 'received_at')::timestamptz is distinct from old_repair.received_at then
    raise exception using errcode = 'P0001', message = 'REPAIR_RECEIVED_AT_IMMUTABLE';
  end if;

  customer_id_value := old_repair.customer_id;
  if payload ? 'customer_id' then
    customer_id_value := nullif(payload ->> 'customer_id', '')::uuid;
  end if;
  product_id_value := old_repair.product_id;
  if payload ? 'product_id' then
    product_id_value := nullif(payload ->> 'product_id', '')::uuid;
  end if;
  serial_number_value := old_repair.serial_number;
  if payload ? 'serial_number' then
    serial_number_value := nullif(btrim(payload ->> 'serial_number'), '');
  end if;
  estimated_delivery_date_value := old_repair.estimated_delivery_date;
  if payload ? 'estimated_delivery_date' then
    estimated_delivery_date_value := nullif(payload ->> 'estimated_delivery_date', '')::date;
  end if;
  priority_value := old_repair.priority;
  if payload ? 'priority' then
    priority_value := lower(btrim(payload ->> 'priority'));
  end if;
  problem_value := old_repair.problem_description;
  if payload ? 'problem_description' then problem_value := btrim(payload ->> 'problem_description'); end if;
  diagnosis_value := old_repair.diagnosis;
  if payload ? 'diagnosis' then diagnosis_value := nullif(btrim(payload ->> 'diagnosis'), ''); end if;
  applied_solution_value := old_repair.applied_solution;
  if payload ? 'applied_solution' then applied_solution_value := nullif(btrim(payload ->> 'applied_solution'), ''); end if;
  notes_value := old_repair.notes;
  if payload ? 'notes' then notes_value := nullif(btrim(payload ->> 'notes'), ''); end if;
  customer_reference_value := old_repair.customer_reference;
  if payload ? 'customer_reference' then customer_reference_value := nullif(btrim(payload ->> 'customer_reference'), ''); end if;
  sale_document_id_value := old_repair.sale_document_id;
  if payload ? 'sale_document_id' then sale_document_id_value := nullif(payload ->> 'sale_document_id', '')::uuid; end if;
  warranty_reference_value := old_repair.warranty_reference;
  if payload ? 'warranty_reference' then warranty_reference_value := nullif(btrim(payload ->> 'warranty_reference'), ''); end if;

  if customer_id_value is distinct from old_repair.customer_id then
    select customer.*
    into customer_row
    from public.customers customer
    where customer.organization_id = organization_id
      and customer.id = customer_id_value
      and customer.is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'REPAIR_CUSTOMER_UNAVAILABLE';
    end if;
    customer_name_snapshot_value := coalesce(nullif(btrim(customer_row.trade_name), ''), btrim(customer_row.legal_name));
    customer_document_snapshot_value := customer_row.document_type || ' ' || customer_row.document_number;
  else
    customer_name_snapshot_value := old_repair.customer_name_snapshot;
    customer_document_snapshot_value := old_repair.customer_document_snapshot;
  end if;

  if product_id_value is distinct from old_repair.product_id then
    select product.*
    into product_row
    from public.products product
    where product.organization_id = organization_id
      and product.id = product_id_value
      and product.is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'REPAIR_PRODUCT_UNAVAILABLE';
    end if;
    product_code_snapshot_value := product_row.code;
    product_description_snapshot_value := product_row.description;
  else
    product_code_snapshot_value := old_repair.product_code_snapshot;
    product_description_snapshot_value := old_repair.product_description_snapshot;
  end if;

  update public.repairs repair
  set customer_id = customer_id_value,
      product_id = product_id_value,
      serial_number = serial_number_value,
      estimated_delivery_date = estimated_delivery_date_value,
      priority = priority_value,
      problem_description = problem_value,
      diagnosis = diagnosis_value,
      applied_solution = applied_solution_value,
      notes = notes_value,
      customer_reference = customer_reference_value,
      sale_document_id = sale_document_id_value,
      warranty_reference = warranty_reference_value,
      customer_name_snapshot = customer_name_snapshot_value,
      customer_document_snapshot = customer_document_snapshot_value,
      product_code_snapshot = product_code_snapshot_value,
      product_description_snapshot = product_description_snapshot_value,
      updated_by = actor_id
  where repair.organization_id = organization_id
    and repair.id = repair_id;

  select repair.* into new_repair
  from public.repairs repair
  where repair.organization_id = organization_id and repair.id = repair_id;

  perform public.record_repair_event(
    organization_id,
    repair_id,
    'UPDATED',
    old_repair.status,
    new_repair.status,
    actor_id,
    null,
    jsonb_build_object('old_values', to_jsonb(old_repair), 'new_values', to_jsonb(new_repair)),
    'REPAIR_UPDATED'
  );
end;
$$;

create function public.assign_repair(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_technician_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  repair_row public.repairs%rowtype;
begin
  actor_id := public.assert_repair_actor(requested_organization_id, 'REPAIRS_ASSIGN');
  if requested_technician_id is null
    or not public.repair_technician_is_active(requested_organization_id, requested_technician_id)
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_TECHNICIAN_UNAVAILABLE';
  end if;

  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if repair_row.status in ('delivered', 'cancelled', 'rejected') then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_ASSIGNABLE';
  end if;

  update public.repairs repair
  set assigned_technician_id = requested_technician_id,
      updated_by = actor_id
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id;

  perform public.record_repair_event(
    requested_organization_id,
    requested_repair_id,
    'UPDATED',
    repair_row.status,
    repair_row.status,
    actor_id,
    null,
    jsonb_build_object(
      'assigned_technician_before', repair_row.assigned_technician_id,
      'assigned_technician_after', requested_technician_id
    ),
    'REPAIR_UPDATED'
  );
end;
$$;

create function public.change_repair_status(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_status text,
  requested_observation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  repair_row public.repairs%rowtype;
  target_status text := lower(btrim(requested_status));
begin
  actor_id := public.assert_repair_actor(requested_organization_id, 'REPAIRS_CHANGE_STATUS');
  if target_status in ('quote_approved', 'rejected', 'delivered', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'REPAIR_SPECIALIZED_STATUS_REQUIRED';
  end if;

  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND';
  end if;
  if not public.repair_status_transition_allowed(repair_row.status, target_status) then
    raise exception using errcode = 'P0001', message = 'REPAIR_STATUS_TRANSITION_INVALID';
  end if;
  if target_status = 'waiting_customer_approval'
    and not exists (
      select 1
      from public.repair_quotes quote
      where quote.organization_id = requested_organization_id
        and quote.repair_id = requested_repair_id
        and quote.status = 'pending'
    )
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_PENDING_QUOTE_REQUIRED';
  end if;

  perform set_config('app.repairs_status_write', 'true', true);
  update public.repairs repair
  set status = target_status,
      updated_by = actor_id
  where repair.organization_id = requested_organization_id
    and repair.id = requested_repair_id;
  perform set_config('app.repairs_status_write', 'false', true);

  perform public.record_repair_event(
    requested_organization_id,
    requested_repair_id,
    'STATUS_CHANGED',
    repair_row.status,
    target_status,
    actor_id,
    requested_observation,
    '{}'::jsonb,
    'REPAIR_STATUS_CHANGED'
  );
end;
$$;

create function public.record_repair_diagnosis(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id uuid := nullif(payload ->> 'repair_id', '')::uuid;
  technician_id uuid;
  diagnosed_at_value timestamptz := coalesce(nullif(payload ->> 'diagnosed_at', '')::timestamptz, now());
  symptoms_value text := nullif(btrim(payload ->> 'symptoms'), '');
  cause_value text := nullif(btrim(payload ->> 'cause_found'), '');
  solution_value text := nullif(btrim(payload ->> 'recommended_solution'), '');
  notes_value text := nullif(btrim(payload ->> 'notes'), '');
  repair_row public.repairs%rowtype;
  diagnosis_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_CHANGE_STATUS');

  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = organization_id and repair.id = repair_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_row.status <> 'diagnosis' then
    raise exception using errcode = 'P0001', message = 'REPAIR_DIAGNOSIS_STATE_REQUIRED';
  end if;
  if symptoms_value is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_DIAGNOSIS_SYMPTOMS_REQUIRED';
  end if;

  technician_id := nullif(payload ->> 'technician_id', '')::uuid;
  technician_id := coalesce(technician_id, repair_row.assigned_technician_id, actor_id);
  if technician_id is null or not public.repair_technician_is_active(organization_id, technician_id) then
    raise exception using errcode = 'P0001', message = 'REPAIR_TECHNICIAN_UNAVAILABLE';
  end if;

  insert into public.repair_diagnostics (
    organization_id, repair_id, diagnosed_at, technician_id, symptoms,
    cause_found, recommended_solution, notes, created_by
  ) values (
    organization_id, repair_id, diagnosed_at_value, technician_id, symptoms_value,
    cause_value, solution_value, notes_value, actor_id
  ) returning id into diagnosis_id;

  update public.repairs repair
  set diagnosis = coalesce(solution_value, cause_value, repair.diagnosis),
      updated_by = actor_id
  where repair.organization_id = organization_id and repair.id = repair_id;

  perform public.record_repair_event(
    organization_id,
    repair_id,
    'DIAGNOSIS_CREATED',
    repair_row.status,
    repair_row.status,
    actor_id,
    notes_value,
    jsonb_build_object('diagnosis_id', diagnosis_id, 'technician_id', technician_id),
    'REPAIR_DIAGNOSIS_CREATED'
  );
  return diagnosis_id;
end;
$$;

create function public.save_repair_quote(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id uuid := nullif(payload ->> 'repair_id', '')::uuid;
  quote_id uuid := nullif(payload ->> 'id', '')::uuid;
  version_number_value integer;
  quote_status text;
  currency_value text := coalesce(nullif(upper(btrim(payload ->> 'currency')), ''), 'PEN');
  include_tax boolean := coalesce((payload ->> 'prices_include_tax')::boolean, false);
  tax_rate_value numeric := coalesce(nullif(payload ->> 'tax_rate', '')::numeric, 0);
  submit_quote boolean := coalesce((payload ->> 'submit')::boolean, false);
  items_value jsonb := payload -> 'items';
  repair_row public.repairs%rowtype;
  quote_row public.repair_quotes%rowtype;
  item jsonb;
  line_type_value text;
  product_id_value uuid;
  description_value text;
  product_row public.products%rowtype;
  old_status text;
  new_status text;
  is_new_quote boolean := false;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');
  if jsonb_typeof(items_value) <> 'array' or jsonb_array_length(items_value) = 0 then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_ITEMS_REQUIRED';
  end if;

  select repair.*
  into repair_row
  from public.repairs repair
  where repair.organization_id = organization_id and repair.id = repair_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_row.status not in ('diagnosis', 'quote_pending') then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_STATE_INVALID';
  end if;
  old_status := repair_row.status;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(organization_id::text || ':quote:' || repair_id::text, 0)
  );

  if quote_id is null then
    select coalesce(max(quote.version_number), 0) + 1
    into version_number_value
    from public.repair_quotes quote
    where quote.organization_id = organization_id and quote.repair_id = repair_id;
    quote_status := case when submit_quote then 'pending' else 'draft' end;
    insert into public.repair_quotes (
      organization_id, repair_id, version_number, status, currency,
      prices_include_tax, tax_rate, created_by, updated_by
    ) values (
      organization_id, repair_id, version_number_value, quote_status, currency_value,
      include_tax, tax_rate_value, actor_id, actor_id
    ) returning * into quote_row;
    quote_id := quote_row.id;
    is_new_quote := true;
  else
    select quote.*
    into quote_row
    from public.repair_quotes quote
    where quote.organization_id = organization_id
      and quote.id = quote_id
      and quote.repair_id = repair_id
    for update;
    if not found then raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_NOT_FOUND'; end if;
    if quote_row.status <> 'draft' then
      raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_NOT_EDITABLE';
    end if;
    quote_status := case when submit_quote then 'pending' else 'draft' end;
    update public.repair_quotes quote
    set status = quote_status,
        currency = currency_value,
        prices_include_tax = include_tax,
        tax_rate = tax_rate_value,
        approved_by = null,
        approved_at = null,
        approval_observation = null,
        rejected_by = null,
        rejected_at = null,
        rejection_observation = null,
        updated_by = actor_id
    where quote.organization_id = organization_id and quote.id = quote_id;
    select quote.* into quote_row
    from public.repair_quotes quote
    where quote.organization_id = organization_id and quote.id = quote_id;
  end if;

  delete from public.repair_quote_items item
  where item.organization_id = organization_id and item.quote_id = quote_id;

  for item in select value from jsonb_array_elements(items_value)
  loop
    line_type_value := lower(btrim(item ->> 'line_type'));
    product_id_value := nullif(item ->> 'product_id', '')::uuid;
    description_value := nullif(btrim(item ->> 'description'), '');

    if line_type_value = 'part' then
      select product.*
      into product_row
      from public.products product
      where product.organization_id = organization_id
        and product.id = product_id_value
        and product.is_active;
      if not found then
        raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_PRODUCT_UNAVAILABLE';
      end if;
      description_value := coalesce(description_value, product_row.description);
    end if;

    insert into public.repair_quote_items (
      organization_id, quote_id, line_type, product_id, description,
      quantity, unit_price, taxable
    ) values (
      organization_id, quote_id, line_type_value, product_id_value,
      description_value, (item ->> 'quantity')::numeric,
      (item ->> 'unit_price')::numeric,
      coalesce((item ->> 'taxable')::boolean, true)
    );
  end loop;

  perform public.recalculate_repair_quote_totals(organization_id, quote_id);

  new_status := case when submit_quote then 'waiting_customer_approval' else 'quote_pending' end;
  if old_status is distinct from new_status then
    perform set_config('app.repairs_status_write', 'true', true);
    update public.repairs repair
    set status = new_status, updated_by = actor_id
    where repair.organization_id = organization_id and repair.id = repair_id;
    perform set_config('app.repairs_status_write', 'false', true);
  end if;

  perform public.record_repair_event(
    organization_id,
    repair_id,
    'QUOTE_CREATED',
    old_status,
    new_status,
    actor_id,
    null,
    jsonb_build_object(
      'quote_id', quote_id,
      'version_number', quote_row.version_number,
      'created', is_new_quote,
      'submitted', submit_quote
    ),
    'REPAIR_QUOTE_CREATED'
  );

  if submit_quote then
    perform public.record_repair_event(
      organization_id,
      repair_id,
      'QUOTE_SUBMITTED',
      new_status,
      new_status,
      actor_id,
      null,
      jsonb_build_object('quote_id', quote_id, 'version_number', quote_row.version_number),
      'REPAIR_QUOTE_SUBMITTED'
    );
  end if;

  return quote_id;
end;
$$;

create function public.approve_repair_quote(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_quote_id uuid,
  requested_observation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  repair_row public.repairs%rowtype;
  quote_row public.repair_quotes%rowtype;
begin
  actor_id := public.assert_repair_actor(requested_organization_id, 'REPAIRS_APPROVE_QUOTE');
  select repair.* into repair_row
  from public.repairs repair
  where repair.organization_id = requested_organization_id and repair.id = requested_repair_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_row.status <> 'waiting_customer_approval' then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_APPROVAL_STATE_INVALID';
  end if;

  select quote.* into quote_row
  from public.repair_quotes quote
  where quote.organization_id = requested_organization_id
    and quote.id = requested_quote_id
    and quote.repair_id = requested_repair_id
  for update;
  if not found or quote_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_NOT_PENDING';
  end if;

  update public.repair_quotes quote
  set status = 'approved', approved_by = actor_id, approved_at = now(),
      approval_observation = nullif(btrim(requested_observation), ''), updated_by = actor_id
  where quote.organization_id = requested_organization_id and quote.id = requested_quote_id;

  perform set_config('app.repairs_status_write', 'true', true);
  update public.repairs repair
  set status = 'quote_approved', updated_by = actor_id
  where repair.organization_id = requested_organization_id and repair.id = requested_repair_id;
  perform set_config('app.repairs_status_write', 'false', true);

  perform public.record_repair_event(
    requested_organization_id,
    requested_repair_id,
    'QUOTE_APPROVED',
    repair_row.status,
    'quote_approved',
    actor_id,
    requested_observation,
    jsonb_build_object('quote_id', requested_quote_id, 'version_number', quote_row.version_number),
    'REPAIR_QUOTE_APPROVED'
  );
end;
$$;

create function public.reject_repair_quote(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_quote_id uuid,
  requested_observation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  repair_row public.repairs%rowtype;
  quote_row public.repair_quotes%rowtype;
begin
  actor_id := public.assert_repair_actor(requested_organization_id, 'REPAIRS_APPROVE_QUOTE');
  select repair.* into repair_row
  from public.repairs repair
  where repair.organization_id = requested_organization_id and repair.id = requested_repair_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_row.status <> 'waiting_customer_approval' then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_REJECTION_STATE_INVALID';
  end if;

  select quote.* into quote_row
  from public.repair_quotes quote
  where quote.organization_id = requested_organization_id
    and quote.id = requested_quote_id
    and quote.repair_id = requested_repair_id
  for update;
  if not found or quote_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_NOT_PENDING';
  end if;

  update public.repair_quotes quote
  set status = 'rejected', rejected_by = actor_id, rejected_at = now(),
      rejection_observation = nullif(btrim(requested_observation), ''), updated_by = actor_id
  where quote.organization_id = requested_organization_id and quote.id = requested_quote_id;

  perform set_config('app.repairs_status_write', 'true', true);
  update public.repairs repair
  set status = 'rejected', updated_by = actor_id
  where repair.organization_id = requested_organization_id and repair.id = requested_repair_id;
  perform set_config('app.repairs_status_write', 'false', true);

  perform public.record_repair_event(
    requested_organization_id,
    requested_repair_id,
    'QUOTE_REJECTED',
    repair_row.status,
    'rejected',
    actor_id,
    requested_observation,
    jsonb_build_object('quote_id', requested_quote_id, 'version_number', quote_row.version_number),
    'REPAIR_QUOTE_REJECTED'
  );
end;
$$;

create function public.reserve_repair_part(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id uuid := nullif(payload ->> 'repair_id', '')::uuid;
  product_id uuid := nullif(payload ->> 'product_id', '')::uuid;
  warehouse_id uuid := nullif(payload ->> 'warehouse_id', '')::uuid;
  location_id uuid := nullif(payload ->> 'location_id', '')::uuid;
  stock_status_value text := coalesce(nullif(lower(btrim(payload ->> 'stock_status')), ''), 'available');
  lot_value text := nullif(btrim(payload ->> 'lot'), '');
  expiration_date_value date := nullif(payload ->> 'expiration_date', '')::date;
  quantity_value numeric := (payload ->> 'quantity_requested')::numeric;
  available_quantity numeric;
  reserved_quantity numeric;
  repair_row public.repairs%rowtype;
  product_row public.products%rowtype;
  part_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_USE_PARTS');

  select repair.* into repair_row
  from public.repairs repair
  where repair.organization_id = organization_id and repair.id = repair_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_row.status not in ('quote_approved', 'warranty', 'in_repair', 'awaiting_parts') then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_RESERVATION_STATE_INVALID';
  end if;

  select product.* into product_row
  from public.products product
  where product.organization_id = organization_id
    and product.id = product_id
    and product.is_active;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_PART_PRODUCT_UNAVAILABLE'; end if;
  if product_row.batch_control and lot_value is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_LOT_REQUIRED';
  end if;
  if product_row.expiration_control and expiration_date_value is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_EXPIRATION_REQUIRED';
  end if;
  if expiration_date_value < current_date then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_EXPIRED';
  end if;

  if not exists (
    select 1
    from public.warehouses warehouse
    where warehouse.organization_id = organization_id
      and warehouse.id = warehouse_id
      and warehouse.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_WAREHOUSE_UNAVAILABLE';
  end if;
  if not exists (
    select 1 from public.warehouse_locations location
    where location.organization_id = organization_id
      and location.warehouse_id = warehouse_id
      and location.id = location_id
      and location.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_LOCATION_UNAVAILABLE';
  end if;
  if quantity_value is null or quantity_value <= 0 then
    raise exception using errcode = '22023', message = 'REPAIR_PART_QUANTITY_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      organization_id::text || ':' || product_id::text || ':' || warehouse_id::text || ':'
      || location_id::text || ':' || stock_status_value || ':' || lower(coalesce(lot_value, '')) || ':'
      || coalesce(expiration_date_value::text, ''),
      0
    )
  );

  select coalesce(sum(
    case when movement.movement_type in ('entrada', 'ajuste-positivo')
      then movement.quantity else -movement.quantity end
  ), 0)
  into available_quantity
  from public.inventory_movements movement
  where movement.organization_id = organization_id
    and movement.product_id = product_id
    and movement.warehouse_id = warehouse_id
    and movement.location_id = location_id
    and movement.stock_status = stock_status_value
    and lower(coalesce(movement.lot, '')) = lower(coalesce(lot_value, ''))
    and movement.expiration_date is not distinct from expiration_date_value;

  select coalesce(sum(part.quantity_requested - part.quantity_consumed), 0)
  into reserved_quantity
  from public.repair_parts part
  where part.organization_id = organization_id
    and part.product_id = product_id
    and part.warehouse_id = warehouse_id
    and part.location_id = location_id
    and part.stock_status = stock_status_value
    and lower(coalesce(part.lot, '')) = lower(coalesce(lot_value, ''))
    and part.expiration_date is not distinct from expiration_date_value
    and part.status = 'reserved'
    and part.quantity_consumed < part.quantity_requested;

  if quantity_value > available_quantity - reserved_quantity then
    raise exception using errcode = 'P0001', message = 'REPAIR_INSUFFICIENT_STOCK';
  end if;

  insert into public.repair_parts (
    organization_id, repair_id, product_id, product_code_snapshot,
    product_description_snapshot, warehouse_id, location_id, stock_status,
    lot, expiration_date, batch_control_snapshot, expiration_control_snapshot,
    quantity_requested, quantity_consumed, status, notes, created_by, updated_by
  ) values (
    organization_id, repair_id, product_id, product_row.code,
    product_row.description, warehouse_id, location_id, stock_status_value,
    lot_value, expiration_date_value, product_row.batch_control, product_row.expiration_control,
    quantity_value, 0, 'reserved', nullif(btrim(payload ->> 'notes'), ''),
    actor_id, actor_id
  ) returning id into part_id;

  perform public.record_repair_event(
    organization_id,
    repair_id,
    'PART_RESERVED',
    repair_row.status,
    repair_row.status,
    actor_id,
    payload ->> 'notes',
    jsonb_build_object(
      'repair_part_id', part_id,
      'product_id', product_id,
      'quantity', quantity_value,
      'expiration_date', expiration_date_value
    ),
    'REPAIR_PART_RESERVED'
  );
  return part_id;
end;
$$;

create function public.consume_repair_part(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  repair_part_id uuid := nullif(payload ->> 'repair_part_id', '')::uuid;
  quantity_value numeric := (payload ->> 'quantity')::numeric;
  operation_key_value uuid := nullif(payload ->> 'operation_key', '')::uuid;
  existing_consumption public.repair_part_consumptions%rowtype;
  repair_part_row public.repair_parts%rowtype;
  repair_row public.repairs%rowtype;
  product_row public.products%rowtype;
  warehouse_row public.warehouses%rowtype;
  available_quantity numeric;
  reserved_quantity numeric;
  average_cost numeric;
  remaining_quantity numeric;
  movement_id uuid := gen_random_uuid();
  consumption_id uuid := gen_random_uuid();
  repair_reason text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_USE_PARTS');
  if repair_part_id is null or operation_key_value is null then
    raise exception using errcode = '22023', message = 'REPAIR_CONSUMPTION_KEYS_REQUIRED';
  end if;
  if quantity_value is null or quantity_value <= 0 then
    raise exception using errcode = '22023', message = 'REPAIR_CONSUMPTION_QUANTITY_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      organization_id::text || ':repair-operation:' || operation_key_value::text,
      0
    )
  );

  select consumption.*
  into existing_consumption
  from public.repair_part_consumptions consumption
  where consumption.organization_id = organization_id
    and consumption.operation_key = operation_key_value
  for update;
  if found then
    if existing_consumption.repair_part_id is distinct from repair_part_id
      or existing_consumption.quantity <> quantity_value
    then
      raise exception using errcode = 'P0001', message = 'REPAIR_OPERATION_KEY_REUSED';
    end if;
    return existing_consumption.id;
  end if;

  select repair.* into repair_row
  from public.repairs repair
  join public.repair_parts part
    on part.organization_id = repair.organization_id and part.repair_id = repair.id
  where repair.organization_id = organization_id
    and part.id = repair_part_id
  for update of repair;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;

  select part.* into repair_part_row
  from public.repair_parts part
  where part.organization_id = organization_id and part.id = repair_part_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_PART_NOT_FOUND'; end if;
  if repair_row.status not in ('quote_approved', 'warranty', 'in_repair', 'awaiting_parts', 'testing') then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_CONSUMPTION_STATE_INVALID';
  end if;
  if repair_part_row.status <> 'reserved' then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_NOT_CONSUMABLE';
  end if;

  remaining_quantity := repair_part_row.quantity_requested - repair_part_row.quantity_consumed;
  if quantity_value > remaining_quantity then
    raise exception using errcode = 'P0001', message = 'REPAIR_CONSUMPTION_QUANTITY_EXCEEDED';
  end if;

  select product.* into product_row
  from public.products product
  where product.organization_id = organization_id
    and product.id = repair_part_row.product_id
    and product.is_active;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_PART_PRODUCT_UNAVAILABLE'; end if;
  if repair_part_row.batch_control_snapshot and repair_part_row.lot is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_LOT_REQUIRED';
  end if;
  if repair_part_row.expiration_control_snapshot and repair_part_row.expiration_date is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_EXPIRATION_REQUIRED';
  end if;
  if repair_part_row.expiration_date < current_date then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_EXPIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      organization_id::text || ':' || repair_part_row.product_id::text || ':'
      || repair_part_row.warehouse_id::text || ':' || repair_part_row.location_id::text || ':'
      || repair_part_row.stock_status || ':' || lower(coalesce(repair_part_row.lot, '')) || ':'
      || coalesce(repair_part_row.expiration_date::text, ''),
      0
    )
  );

  select
    coalesce(sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
      then movement.quantity else -movement.quantity end), 0),
    coalesce(
      sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
        then movement.quantity * movement.unit_cost else -(movement.quantity * movement.unit_cost) end)
      / nullif(sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
        then movement.quantity else -movement.quantity end), 0),
      0
    )
  into available_quantity, average_cost
  from public.inventory_movements movement
  where movement.organization_id = organization_id
    and movement.product_id = repair_part_row.product_id
    and movement.warehouse_id = repair_part_row.warehouse_id
    and movement.location_id = repair_part_row.location_id
    and movement.stock_status = repair_part_row.stock_status
    and lower(coalesce(movement.lot, '')) = lower(coalesce(repair_part_row.lot, ''))
    and movement.expiration_date is not distinct from repair_part_row.expiration_date;

  select coalesce(sum(part.quantity_requested - part.quantity_consumed), 0)
  into reserved_quantity
  from public.repair_parts part
  where part.organization_id = organization_id
    and part.id <> repair_part_id
    and part.product_id = repair_part_row.product_id
    and part.warehouse_id = repair_part_row.warehouse_id
    and part.location_id = repair_part_row.location_id
    and part.stock_status = repair_part_row.stock_status
    and lower(coalesce(part.lot, '')) = lower(coalesce(repair_part_row.lot, ''))
    and part.expiration_date is not distinct from repair_part_row.expiration_date
    and part.status = 'reserved'
    and part.quantity_consumed < part.quantity_requested;

  if quantity_value > available_quantity - reserved_quantity then
    raise exception using errcode = 'P0001', message = 'REPAIR_INSUFFICIENT_STOCK';
  end if;

  select warehouse.* into warehouse_row
  from public.warehouses warehouse
  where warehouse.organization_id = organization_id and warehouse.id = repair_part_row.warehouse_id;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_PART_WAREHOUSE_UNAVAILABLE'; end if;

  repair_reason := 'Reparacion ' || repair_row.repair_code;

  -- El movimiento se inserta antes del consumo para satisfacer la FK. Todo
  -- ocurre en la misma transaccion y se revierte junto con la reserva.
  perform set_config('app.repair_consumption_tracking_write', 'true', true);
  insert into public.inventory_movements (
    id, organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, lot, expiration_date, operation_date, reason, source_type, source_id, created_by
  ) values (
    movement_id, organization_id, repair_part_row.product_id, product_row.code,
    product_row.description, product_row.unit_of_measure, 'salida', quantity_value,
    warehouse_row.name, repair_part_row.warehouse_id, repair_part_row.location_id,
    repair_part_row.stock_status, greatest(coalesce(average_cost, 0), 0), repair_part_row.lot,
    repair_part_row.expiration_date,
    current_date, repair_reason, 'repair-consumption', consumption_id, actor_id
  );
  perform set_config('app.repair_consumption_tracking_write', 'false', true);

  insert into public.repair_part_consumptions (
    id, organization_id, repair_part_id, quantity, warehouse_id, location_id,
    stock_status, lot, expiration_date, unit_cost, inventory_movement_id, operation_key,
    consumed_by, consumed_at
  ) values (
    consumption_id, organization_id, repair_part_id, quantity_value,
    repair_part_row.warehouse_id, repair_part_row.location_id, repair_part_row.stock_status,
    repair_part_row.lot, repair_part_row.expiration_date,
    greatest(coalesce(average_cost, 0), 0), movement_id,
    operation_key_value, actor_id, now()
  );

  perform set_config('app.repair_part_state_write', 'true', true);
  update public.repair_parts part
  set quantity_consumed = part.quantity_consumed + quantity_value,
      status = case
        when part.quantity_consumed + quantity_value = part.quantity_requested then 'consumed'
        else 'reserved'
      end,
      updated_by = actor_id
  where part.organization_id = organization_id and part.id = repair_part_id;
  perform set_config('app.repair_part_state_write', 'false', true);

  perform public.record_repair_event(
    organization_id,
    repair_part_row.repair_id,
    'PART_CONSUMED',
    repair_row.status,
    repair_row.status,
    actor_id,
    null,
    jsonb_build_object(
      'repair_part_id', repair_part_id,
      'consumption_id', consumption_id,
      'inventory_movement_id', movement_id,
      'quantity', quantity_value,
      'operation_key', operation_key_value,
      'expiration_date', repair_part_row.expiration_date
    ),
    'REPAIR_PART_CONSUMED'
  );
  return consumption_id;
end;
$$;

create function public.cancel_repair_part(
  requested_organization_id uuid,
  requested_repair_part_id uuid,
  requested_observation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  repair_part_row public.repair_parts%rowtype;
  repair_row public.repairs%rowtype;
begin
  actor_id := public.assert_repair_actor(requested_organization_id, 'REPAIRS_USE_PARTS');

  select repair.* into repair_row
  from public.repairs repair
  join public.repair_parts part
    on part.organization_id = repair.organization_id and part.repair_id = repair.id
  where repair.organization_id = requested_organization_id
    and part.id = requested_repair_part_id
  for update of repair;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_PART_NOT_FOUND'; end if;

  select part.* into repair_part_row
  from public.repair_parts part
  where part.organization_id = requested_organization_id and part.id = requested_repair_part_id
  for update;
  if not found or repair_part_row.status <> 'reserved' then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_NOT_CANCELLABLE';
  end if;
  if repair_row.status in ('delivered', 'rejected') then
    raise exception using errcode = 'P0001', message = 'REPAIR_PART_NOT_CANCELLABLE';
  end if;

  perform set_config('app.repair_part_state_write', 'true', true);
  update public.repair_parts part
  set status = 'cancelled', updated_by = actor_id
  where part.organization_id = requested_organization_id and part.id = requested_repair_part_id;
  perform set_config('app.repair_part_state_write', 'false', true);

  perform public.record_repair_event(
    requested_organization_id,
    repair_part_row.repair_id,
    'PART_CANCELLED',
    repair_row.status,
    repair_row.status,
    actor_id,
    requested_observation,
    jsonb_build_object('repair_part_id', requested_repair_part_id),
    'REPAIR_PART_CANCELLED'
  );
end;
$$;

create function public.record_repair_test(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid;
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id uuid := nullif(payload ->> 'repair_id', '')::uuid;
  performed_by_id uuid;
  test_type_value text := nullif(btrim(payload ->> 'test_type'), '');
  result_value text := nullif(btrim(payload ->> 'result'), '');
  passed_value boolean;
  notes_value text := nullif(btrim(payload ->> 'notes'), '');
  completed_at_value timestamptz := coalesce(nullif(payload ->> 'completed_at', '')::timestamptz, now());
  repair_row public.repairs%rowtype;
  test_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  actor_id := public.assert_repair_actor(organization_id, 'REPAIRS_CHANGE_STATUS');
  if not (payload ? 'passed') or jsonb_typeof(payload -> 'passed') <> 'boolean' then
    raise exception using errcode = '22023', message = 'REPAIR_TEST_RESULT_REQUIRED';
  end if;
  passed_value := (payload ->> 'passed')::boolean;

  select repair.* into repair_row
  from public.repairs repair
  where repair.organization_id = organization_id and repair.id = repair_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_row.status <> 'testing' then
    raise exception using errcode = 'P0001', message = 'REPAIR_TESTING_STATE_REQUIRED';
  end if;
  if test_type_value is null or result_value is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_TEST_DATA_REQUIRED';
  end if;

  performed_by_id := nullif(payload ->> 'performed_by', '')::uuid;
  performed_by_id := coalesce(performed_by_id, repair_row.assigned_technician_id, actor_id);
  if performed_by_id is null or not public.repair_technician_is_active(organization_id, performed_by_id) then
    raise exception using errcode = 'P0001', message = 'REPAIR_TECHNICIAN_UNAVAILABLE';
  end if;

  insert into public.repair_tests (
    organization_id, repair_id, test_type, result, passed, performed_by,
    notes, completed_at, created_by
  ) values (
    organization_id, repair_id, test_type_value, result_value, passed_value,
    performed_by_id, notes_value, completed_at_value, actor_id
  ) returning id into test_id;

  perform public.record_repair_event(
    organization_id,
    repair_id,
    'TEST_COMPLETED',
    repair_row.status,
    repair_row.status,
    actor_id,
    notes_value,
    jsonb_build_object('test_id', test_id, 'passed', passed_value, 'test_type', test_type_value),
    'REPAIR_TEST_COMPLETED'
  );
  return test_id;
end;
$$;

create function public.deliver_repair(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_observation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  repair_row public.repairs%rowtype;
begin
  actor_id := public.assert_repair_actor(requested_organization_id, 'REPAIRS_DELIVER');
  select repair.* into repair_row
  from public.repairs repair
  where repair.organization_id = requested_organization_id and repair.id = requested_repair_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_row.status <> 'ready_for_delivery' then
    raise exception using errcode = 'P0001', message = 'REPAIR_DELIVERY_STATE_REQUIRED';
  end if;
  if repair_row.assigned_technician_id is null
    or not public.repair_technician_is_active(requested_organization_id, repair_row.assigned_technician_id)
  then
    raise exception using errcode = 'P0001', message = 'REPAIR_ASSIGNED_TECHNICIAN_REQUIRED';
  end if;
  if not exists (
    select 1 from public.repair_tests test
    where test.organization_id = requested_organization_id
      and test.repair_id = requested_repair_id
      and test.passed
  ) then
    raise exception using errcode = 'P0001', message = 'REPAIR_APPROVED_TEST_REQUIRED';
  end if;
  if exists (
    select 1 from public.repair_tests test
    where test.organization_id = requested_organization_id
      and test.repair_id = requested_repair_id
      and not test.passed
  ) then
    raise exception using errcode = 'P0001', message = 'REPAIR_FAILED_TEST_PRESENT';
  end if;
  if exists (
    select 1 from public.repair_parts part
    where part.organization_id = requested_organization_id
      and part.repair_id = requested_repair_id
      and part.status = 'reserved'
      and part.quantity_consumed < part.quantity_requested
  ) then
    raise exception using errcode = 'P0001', message = 'REPAIR_PENDING_PARTS';
  end if;

  perform set_config('app.repairs_status_write', 'true', true);
  update public.repairs repair
  set status = 'delivered', delivered_at = now(), updated_by = actor_id
  where repair.organization_id = requested_organization_id and repair.id = requested_repair_id;
  perform set_config('app.repairs_status_write', 'false', true);

  perform public.record_repair_event(
    requested_organization_id,
    requested_repair_id,
    'DELIVERED',
    repair_row.status,
    'delivered',
    actor_id,
    requested_observation,
    '{}'::jsonb,
    'REPAIR_DELIVERED'
  );
end;
$$;

create function public.cancel_repair(
  requested_organization_id uuid,
  requested_repair_id uuid,
  requested_observation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  repair_row public.repairs%rowtype;
  part_row public.repair_parts%rowtype;
begin
  actor_id := public.assert_repair_actor(requested_organization_id, 'REPAIRS_CHANGE_STATUS');
  select repair.* into repair_row
  from public.repairs repair
  where repair.organization_id = requested_organization_id and repair.id = requested_repair_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REPAIR_NOT_FOUND'; end if;
  if repair_row.status not in (
    'received', 'diagnosis', 'quote_pending', 'waiting_customer_approval',
    'quote_approved', 'in_repair', 'awaiting_parts', 'testing', 'ready_for_delivery', 'warranty'
  ) then
    raise exception using errcode = 'P0001', message = 'REPAIR_NOT_CANCELLABLE';
  end if;

  perform set_config('app.repairs_status_write', 'true', true);
  update public.repairs repair
  set status = 'cancelled', updated_by = actor_id
  where repair.organization_id = requested_organization_id and repair.id = requested_repair_id;
  perform set_config('app.repairs_status_write', 'false', true);

  for part_row in
    select part.*
     from public.repair_parts part
     where part.organization_id = requested_organization_id
       and part.repair_id = requested_repair_id
       and part.status = 'reserved'
     order by part.id
     for update
  loop
    perform set_config('app.repair_part_state_write', 'true', true);
    update public.repair_parts part
    set status = 'cancelled', updated_by = actor_id
    where part.organization_id = requested_organization_id and part.id = part_row.id;
    perform set_config('app.repair_part_state_write', 'false', true);

    perform public.record_repair_event(
      requested_organization_id,
      requested_repair_id,
      'PART_CANCELLED',
      repair_row.status,
      repair_row.status,
      actor_id,
      requested_observation,
      jsonb_build_object('repair_part_id', part_row.id, 'source', 'repair_cancellation'),
      'REPAIR_PART_CANCELLED'
    );
  end loop;

  perform public.record_repair_event(
    requested_organization_id,
    requested_repair_id,
    'CANCELLED',
    repair_row.status,
    'cancelled',
    actor_id,
    requested_observation,
    '{}'::jsonb,
    'REPAIR_CANCELLED'
  );
end;
$$;

create function public.list_repair_technicians(
  requested_organization_id uuid,
  requested_search text default '',
  requested_limit integer default 100
)
returns table (
  user_id uuid,
  full_name text,
  email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_search text := lower(btrim(coalesce(requested_search, '')));
  result_limit integer := least(greatest(coalesce(requested_limit, 100), 1), 500);
begin
  perform public.assert_repair_actor(requested_organization_id, 'REPAIRS_ASSIGN');

  return query
  select profile.id, profile.full_name, profile.email
  from public.organization_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  join public.organizations organization on organization.id = membership.organization_id
  where membership.organization_id = requested_organization_id
    and membership.is_active
    and profile.is_active
    and organization.is_active
    and (
      normalized_search = ''
      or lower(profile.full_name) like '%' || normalized_search || '%'
      or lower(profile.email) like '%' || normalized_search || '%'
    )
  order by profile.full_name, profile.email, profile.id
  limit result_limit;
end;
$$;

-- ------------------------------------------------------------
-- 10. Vista de lista y seguridad del modulo
-- ------------------------------------------------------------

create view public.repair_list
with (security_invoker = true)
as
select
  repair.id,
  repair.organization_id,
  repair.repair_code,
  repair.customer_id,
  repair.product_id,
  repair.serial_number,
  repair.received_at,
  repair.estimated_delivery_date,
  repair.delivered_at,
  repair.status,
  repair.priority,
  repair.problem_description,
  repair.diagnosis,
  repair.applied_solution,
  repair.notes,
  repair.customer_reference,
  repair.sale_document_id,
  repair.warranty_reference,
  repair.assigned_technician_id,
  repair.customer_name_snapshot,
  repair.customer_document_snapshot,
  repair.product_code_snapshot,
  repair.product_description_snapshot,
  repair.created_by,
  repair.updated_by,
  repair.created_at,
  repair.updated_at
from public.repairs repair;

alter table public.repairs enable row level security;
alter table public.repair_diagnostics enable row level security;
alter table public.repair_quotes enable row level security;
alter table public.repair_quote_items enable row level security;
alter table public.repair_parts enable row level security;
alter table public.repair_part_consumptions enable row level security;
alter table public.repair_tests enable row level security;
alter table public.repair_events enable row level security;

create policy repairs_select_authorized
on public.repairs
for select to authenticated
using (
  (select public.current_auth_session_is_active())
  and (select public.has_organization_permission(organization_id, 'REPAIRS_VIEW'))
);

create policy repair_diagnostics_select_authorized
on public.repair_diagnostics
for select to authenticated
using (
  (select public.current_auth_session_is_active())
  and (select public.has_organization_permission(organization_id, 'REPAIRS_VIEW'))
);

create policy repair_quotes_select_authorized
on public.repair_quotes
for select to authenticated
using (
  (select public.current_auth_session_is_active())
  and (select public.has_organization_permission(organization_id, 'REPAIRS_VIEW'))
);

create policy repair_quote_items_select_authorized
on public.repair_quote_items
for select to authenticated
using (
  (select public.current_auth_session_is_active())
  and (select public.has_organization_permission(organization_id, 'REPAIRS_VIEW'))
);

create policy repair_parts_select_authorized
on public.repair_parts
for select to authenticated
using (
  (select public.current_auth_session_is_active())
  and (select public.has_organization_permission(organization_id, 'REPAIRS_VIEW'))
);

create policy repair_part_consumptions_select_authorized
on public.repair_part_consumptions
for select to authenticated
using (
  (select public.current_auth_session_is_active())
  and (select public.has_organization_permission(organization_id, 'REPAIRS_VIEW'))
);

create policy repair_tests_select_authorized
on public.repair_tests
for select to authenticated
using (
  (select public.current_auth_session_is_active())
  and (select public.has_organization_permission(organization_id, 'REPAIRS_VIEW'))
);

create policy repair_events_select_authorized
on public.repair_events
for select to authenticated
using (
  (select public.current_auth_session_is_active())
  and (select public.has_organization_permission(organization_id, 'REPAIRS_VIEW'))
);

revoke all on table
  public.repairs,
  public.repair_diagnostics,
  public.repair_quotes,
  public.repair_quote_items,
  public.repair_parts,
  public.repair_part_consumptions,
  public.repair_tests,
  public.repair_events,
  public.repair_list
from public, anon, authenticated, service_role;

grant select on table
  public.repairs,
  public.repair_diagnostics,
  public.repair_quotes,
  public.repair_quote_items,
  public.repair_parts,
  public.repair_part_consumptions,
  public.repair_tests,
  public.repair_events,
  public.repair_list
to authenticated, service_role;

revoke all on sequence public.repairs_code_seq from public, anon, authenticated, service_role;

revoke all on function public.create_repair(jsonb) from public, anon, authenticated;
revoke all on function public.update_repair(jsonb) from public, anon, authenticated;
revoke all on function public.assign_repair(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.change_repair_status(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.record_repair_diagnosis(jsonb) from public, anon, authenticated;
revoke all on function public.save_repair_quote(jsonb) from public, anon, authenticated;
revoke all on function public.approve_repair_quote(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_repair_quote(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reserve_repair_part(jsonb) from public, anon, authenticated;
revoke all on function public.consume_repair_part(jsonb) from public, anon, authenticated;
revoke all on function public.cancel_repair_part(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_repair_test(jsonb) from public, anon, authenticated;
revoke all on function public.deliver_repair(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_repair(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.list_repair_technicians(uuid, text, integer) from public, anon, authenticated;

grant execute on function public.create_repair(jsonb) to authenticated, service_role;
grant execute on function public.update_repair(jsonb) to authenticated, service_role;
grant execute on function public.assign_repair(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.change_repair_status(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.record_repair_diagnosis(jsonb) to authenticated, service_role;
grant execute on function public.save_repair_quote(jsonb) to authenticated, service_role;
grant execute on function public.approve_repair_quote(uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.reject_repair_quote(uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.reserve_repair_part(jsonb) to authenticated, service_role;
grant execute on function public.consume_repair_part(jsonb) to authenticated, service_role;
grant execute on function public.cancel_repair_part(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.record_repair_test(jsonb) to authenticated, service_role;
grant execute on function public.deliver_repair(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.cancel_repair(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.list_repair_technicians(uuid, text, integer) to authenticated, service_role;

revoke all on function public.assert_repair_actor(uuid, text) from public, anon, authenticated;
revoke all on function public.record_repair_event(uuid, uuid, text, text, text, uuid, text, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.repair_technician_is_active(uuid, uuid) from public, anon, authenticated;
revoke all on function public.repair_status_transition_allowed(text, text) from public, anon, authenticated;
revoke all on function public.recalculate_repair_quote_totals(uuid, uuid) from public, anon, authenticated;
revoke all on function public.repair_quote_items_recalculate_totals() from public, anon, authenticated;
revoke all on function public.repair_quote_settings_recalculate_totals() from public, anon, authenticated;
revoke all on function public.protect_repair_quote_totals() from public, anon, authenticated;
revoke all on function public.validate_repair_row() from public, anon, authenticated;
revoke all on function public.validate_repair_quote_item() from public, anon, authenticated;
revoke all on function public.validate_repair_part_row() from public, anon, authenticated;
revoke all on function public.validate_repair_part_consumption() from public, anon, authenticated;
revoke all on function public.protect_repair_status_transition() from public, anon, authenticated;
revoke all on function public.protect_repair_immutable_fields() from public, anon, authenticated;
revoke all on function public.protect_repair_part_state() from public, anon, authenticated;
revoke all on function public.prevent_repair_event_mutation() from public, anon, authenticated;
revoke all on function public.prevent_repair_part_consumption_mutation() from public, anon, authenticated;

-- Completa la envoltura de importacion creada antes de serial_control. El
-- nucleo conserva el contrato legado y esta capa persiste el control nuevo
-- solo para productos que realmente se crean en esta importacion.
alter function public.import_products(uuid, jsonb)
  rename to import_products_extended_core;

revoke all on function public.import_products_extended_core(uuid, jsonb)
  from public, anon, authenticated, service_role;

create function public.import_products(
  requested_organization_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_product_codes text[] := array[]::text[];
  import_result jsonb;
  product_item jsonb;
begin
  if payload is not null and jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'productos') = 'array'
  then
    select coalesce(
      array_agg(upper(btrim(source.item ->> 'codigo'))),
      array[]::text[]
    )
    into existing_product_codes
    from jsonb_array_elements(payload -> 'productos') source(item)
    where exists (
      select 1
      from public.products product
      where product.organization_id = requested_organization_id
        and product.code = upper(btrim(source.item ->> 'codigo'))
    );

    if exists (
      select 1
      from jsonb_array_elements(payload -> 'productos') source(item)
      where source.item ? 'control_serie'
        and jsonb_typeof(source.item -> 'control_serie') <> 'boolean'
    ) then
      raise exception using errcode = 'P0001', message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
    end if;
  end if;

  import_result := public.import_products_extended_core(
    requested_organization_id,
    payload
  );

  if import_result ->> 'estado' = 'completado'
    and payload is not null
    and jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'productos') = 'array'
  then
    for product_item in
      select source.item
      from jsonb_array_elements(payload -> 'productos') source(item)
      where not (upper(btrim(source.item ->> 'codigo')) = any(existing_product_codes))
    loop
      update public.products product
      set serial_control = coalesce(
        (product_item ->> 'control_serie')::boolean,
        false
      )
      where product.organization_id = requested_organization_id
        and product.code = upper(btrim(product_item ->> 'codigo'))
        and product.serial_control is distinct from coalesce(
          (product_item ->> 'control_serie')::boolean,
          false
        );
    end loop;
  end if;

  return import_result;
end;
$$;

revoke all on function public.import_products(uuid, jsonb)
  from public, anon;
grant execute on function public.import_products(uuid, jsonb)
  to authenticated, service_role;

comment on function public.import_products(uuid, jsonb) is
  'Importa el contrato extendido y persiste serial_control en productos nuevos.';

comment on table public.repairs is
  'Ordenes de reparacion multiempresa con snapshots historicos de cliente y producto.';
comment on table public.repair_events is
  'Linea de tiempo append-only de reparaciones; solo se escribe desde RPCs autorizadas.';
comment on table public.repair_part_consumptions is
  'Consumos atomicos e idempotentes que generan salidas en inventory_movements.';

commit;
