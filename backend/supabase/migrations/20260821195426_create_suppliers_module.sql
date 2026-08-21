-- ============================================================
-- SILSANPLEX: maestro multiempresa de proveedores
-- ============================================================

-- ------------------------------------------------------------
-- 1. Capacidades del módulo
-- ------------------------------------------------------------

insert into public.permissions (code, name, description)
values
  (
    'SUPPLIERS_VIEW',
    'Consultar proveedores',
    'Listar y consultar la información fiscal y comercial de proveedores.'
  ),
  (
    'SUPPLIERS_MANAGE',
    'Administrar proveedores',
    'Registrar, editar, clasificar, activar y desactivar proveedores.'
  );

insert into public.role_permissions (role_code, permission_code)
values
  ('ADMIN', 'SUPPLIERS_VIEW'),
  ('ADMIN', 'SUPPLIERS_MANAGE'),
  ('GERENCIA', 'SUPPLIERS_VIEW'),
  ('LOGISTICA', 'SUPPLIERS_VIEW'),
  ('COMPRAS', 'SUPPLIERS_VIEW'),
  ('COMPRAS', 'SUPPLIERS_MANAGE');

-- Comprueba identidad, organización activa, rol activo y capacidad efectiva.
-- La identidad se deriva del JWT y nunca se recibe desde el navegador.
create or replace function public.has_organization_permission(
  requested_organization_id uuid,
  requested_permission_code text
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
    join public.profiles profile
      on profile.id = membership.user_id
    join public.organizations organization
      on organization.id = membership.organization_id
    join public.user_roles user_role
      on user_role.organization_id = membership.organization_id
      and user_role.user_id = membership.user_id
    join public.roles role
      on role.code = user_role.role_code
    join public.role_permissions role_permission
      on role_permission.role_code = role.code
    join public.permissions permission
      on permission.code = role_permission.permission_code
    where membership.user_id = (select auth.uid())
      and membership.organization_id = requested_organization_id
      and membership.is_active
      and profile.is_active
      and organization.is_active
      and role.is_active
      and permission.is_active
      and permission.code = requested_permission_code
  );
$$;

comment on function public.has_organization_permission(uuid, text) is
  'Valida una capacidad efectiva de la identidad autenticada dentro de una organización activa.';

revoke all on function public.has_organization_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function public.has_organization_permission(uuid, text)
  to authenticated;

-- ------------------------------------------------------------
-- 2. Maestro de proveedores
-- ------------------------------------------------------------

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id) on delete restrict,

  code text,
  document_type text not null,
  document_number text not null,
  business_name text not null,
  trade_name text,
  contact_name text,
  contact_position text,
  email text,
  phone text,
  fiscal_address text,
  geographic_zone text,
  product_types text,

  category text not null default 'por-clasificar',
  delivery_frequency text not null default 'segun-demanda',
  performance_rating smallint,

  credit_condition text not null default 'contado',
  credit_days smallint not null default 0,
  currency text not null default 'PEN',
  bank_name text,
  bank_account text,
  detraccion_account text,

  sunat_status text not null default 'no-verificado',
  notes text,
  is_active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint suppliers_code_format
    check (
      code is null
      or code ~ '^[A-Z0-9][A-Z0-9._-]{1,29}$'
    ),

  constraint suppliers_document_type_valid
    check (document_type in ('ruc', 'dni', 'ce', 'pasaporte', 'otro')),

  constraint suppliers_document_number_not_blank
    check (char_length(btrim(document_number)) between 4 and 30),

  constraint suppliers_document_number_format
    check (document_number ~ '^[A-Z0-9-]+$'),

  constraint suppliers_ruc_format
    check (document_type <> 'ruc' or document_number ~ '^\d{11}$'),

  constraint suppliers_dni_format
    check (document_type <> 'dni' or document_number ~ '^\d{8}$'),

  constraint suppliers_business_name_not_blank
    check (char_length(btrim(business_name)) between 2 and 160),

  constraint suppliers_trade_name_length
    check (trade_name is null or char_length(btrim(trade_name)) between 2 and 160),

  constraint suppliers_contact_name_length
    check (contact_name is null or char_length(btrim(contact_name)) between 2 and 120),

  constraint suppliers_contact_position_length
    check (contact_position is null or char_length(btrim(contact_position)) between 2 and 100),

  constraint suppliers_email_format
    check (
      email is null
      or (
        char_length(email) <= 254
        and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),

  constraint suppliers_phone_length
    check (phone is null or char_length(btrim(phone)) between 6 and 30),

  constraint suppliers_fiscal_address_length
    check (fiscal_address is null or char_length(btrim(fiscal_address)) <= 250),

  constraint suppliers_geographic_zone_length
    check (geographic_zone is null or char_length(btrim(geographic_zone)) <= 120),

  constraint suppliers_product_types_length
    check (product_types is null or char_length(btrim(product_types)) <= 250),

  constraint suppliers_category_valid
    check (
      category in (
        'por-clasificar',
        'estrategico',
        'frecuente',
        'ocasional',
        'critico'
      )
    ),

  constraint suppliers_delivery_frequency_valid
    check (
      delivery_frequency in (
        'segun-demanda',
        'semanal',
        'quincenal',
        'mensual',
        'ocasional'
      )
    ),

  constraint suppliers_performance_rating_range
    check (performance_rating is null or performance_rating between 1 and 5),

  constraint suppliers_credit_condition_valid
    check (credit_condition in ('contado', 'credito')),

  constraint suppliers_credit_days_range
    check (credit_days between 0 and 3650),

  constraint suppliers_credit_consistency
    check (
      (credit_condition = 'contado' and credit_days = 0)
      or
      (credit_condition = 'credito' and credit_days > 0)
    ),

  constraint suppliers_currency_valid
    check (currency in ('PEN', 'USD')),

  constraint suppliers_bank_name_length
    check (bank_name is null or char_length(btrim(bank_name)) <= 120),

  constraint suppliers_bank_account_length
    check (bank_account is null or char_length(btrim(bank_account)) <= 80),

  constraint suppliers_detraccion_account_length
    check (detraccion_account is null or char_length(btrim(detraccion_account)) <= 80),

  constraint suppliers_sunat_status_valid
    check (sunat_status in ('no-verificado', 'habido', 'no-habido', 'baja')),

  constraint suppliers_notes_length
    check (notes is null or char_length(btrim(notes)) <= 1000)
);

comment on table public.suppliers is
  'Maestro fiscal y comercial de proveedores aislado por organización.';

comment on column public.suppliers.performance_rating is
  'Evaluación operativa de 1 a 5; nula mientras no exista una evaluación.';

comment on column public.suppliers.is_active is
  'Borrado lógico: un proveedor inactivo conserva historial y no participa en nuevas compras.';

-- Un documento puede repetirse entre organizaciones, nunca dentro de la misma.
create unique index suppliers_organization_document_unique
  on public.suppliers (organization_id, document_type, document_number);

create unique index suppliers_organization_code_unique
  on public.suppliers (organization_id, code)
  where code is not null;

create index suppliers_organization_active_name_idx
  on public.suppliers (organization_id, is_active, business_name, id);

create index suppliers_organization_category_idx
  on public.suppliers (organization_id, category, business_name, id);

create index suppliers_created_by_idx
  on public.suppliers (created_by)
  where created_by is not null;

create index suppliers_updated_by_idx
  on public.suppliers (updated_by)
  where updated_by is not null;

-- ------------------------------------------------------------
-- 3. Integridad y auditoría
-- ------------------------------------------------------------

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row
execute function public.set_updated_at();

create or replace function public.protect_supplier_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = 'P0001',
      message = 'SUPPLIER_IMMUTABLE_FIELDS';
  end if;

  return new;
end;
$$;

create trigger suppliers_protect_immutable_fields
before update on public.suppliers
for each row
execute function public.protect_supplier_immutable_fields();

create or replace function public.audit_supplier_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_action text;
  old_snapshot jsonb;
  new_snapshot jsonb;
begin
  event_action := case
    when tg_op = 'INSERT' then 'SUPPLIER_CREATED'
    else 'SUPPLIER_UPDATED'
  end;

  old_snapshot := case
    when tg_op = 'UPDATE'
      then to_jsonb(old) - 'bank_account' - 'detraccion_account'
    else null
  end;

  new_snapshot := to_jsonb(new) - 'bank_account' - 'detraccion_account';

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    metadata
  )
  values (
    new.organization_id,
    coalesce((select auth.uid()), new.updated_by, new.created_by),
    event_action,
    'supplier',
    new.id::text,
    old_snapshot,
    new_snapshot,
    jsonb_build_object('source', 'database_trigger')
  );

  return new;
end;
$$;

create trigger suppliers_audit_change
after insert or update on public.suppliers
for each row
execute function public.audit_supplier_change();

revoke all on function public.protect_supplier_immutable_fields() from public;
revoke all on function public.audit_supplier_change() from public;

-- ------------------------------------------------------------
-- 4. RLS y privilegios explícitos para Data API
-- ------------------------------------------------------------

alter table public.suppliers enable row level security;

create policy suppliers_select_authorized_organization
on public.suppliers
for select
to authenticated
using (
  (select public.has_organization_permission(
    organization_id,
    'SUPPLIERS_VIEW'
  ))
);

create policy suppliers_insert_authorized_organization
on public.suppliers
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (select public.has_organization_permission(
    organization_id,
    'SUPPLIERS_MANAGE'
  ))
);

create policy suppliers_update_authorized_organization
on public.suppliers
for update
to authenticated
using (
  (select public.has_organization_permission(
    organization_id,
    'SUPPLIERS_MANAGE'
  ))
)
with check (
  updated_by = (select auth.uid())
  and (select public.has_organization_permission(
    organization_id,
    'SUPPLIERS_MANAGE'
  ))
);

revoke all on table public.suppliers from anon, authenticated;
grant select, insert, update on table public.suppliers to authenticated;

grant select, insert, update, delete on table public.suppliers to service_role;
