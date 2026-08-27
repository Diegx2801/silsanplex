-- ============================================================
-- SILSANPLEX: tipo de ítem, unidades normalizadas y conversiones
-- ============================================================

begin;

create table public.measurement_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint measurement_units_code_format check (code ~ '^[A-Z][A-Z0-9_]{0,29}$'),
  constraint measurement_units_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint measurement_units_organization_id_unique unique (organization_id, id),
  constraint measurement_units_organization_code_unique unique (organization_id, code),
  constraint measurement_units_organization_name_unique unique (organization_id, name)
);

create unique index measurement_units_organization_name_ci_unique
  on public.measurement_units (organization_id, lower(btrim(name)));

create trigger measurement_units_set_updated_at
before update on public.measurement_units
for each row execute function public.set_updated_at();

create or replace function public.seed_default_measurement_units(target_organization_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.measurement_units (organization_id, code, name)
  values
    (target_organization_id, 'UNIT', 'Unidad'),
    (target_organization_id, 'BOX', 'Caja'),
    (target_organization_id, 'PACK', 'Paquete'),
    (target_organization_id, 'PAIR', 'Par'),
    (target_organization_id, 'PIECE', 'Pieza'),
    (target_organization_id, 'BOTTLE', 'Frasco'),
    (target_organization_id, 'BAG', 'Bolsa'),
    (target_organization_id, 'ROLL', 'Rollo'),
    (target_organization_id, 'DOZEN', 'Docena'),
    (target_organization_id, 'HUNDRED', 'Ciento'),
    (target_organization_id, 'THOUSAND', 'Millar'),
    (target_organization_id, 'LITER', 'Litro'),
    (target_organization_id, 'GALLON', 'Galón'),
    (target_organization_id, 'KILOGRAM', 'Kilogramo'),
    (target_organization_id, 'METER', 'Metro'),
    (target_organization_id, 'CUBIC_METER', 'Metro cúbico'),
    (target_organization_id, 'BUCKET', 'Balde'),
    (target_organization_id, 'SERVICE', 'Servicio')
  on conflict (organization_id, code) do nothing;
$$;

revoke all on function public.seed_default_measurement_units(uuid) from public, anon, authenticated;
grant execute on function public.seed_default_measurement_units(uuid) to service_role;

select public.seed_default_measurement_units(organization.id)
from public.organizations organization;

create or replace function public.seed_measurement_units_for_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_default_measurement_units(new.id);
  return new;
end;
$$;

revoke all on function public.seed_measurement_units_for_organization() from public, anon, authenticated;

create trigger organizations_seed_measurement_units
after insert on public.organizations
for each row execute function public.seed_measurement_units_for_organization();

alter table public.products
  add column product_type text not null default 'good',
  add column base_unit_id uuid,
  add constraint products_type_valid check (product_type in ('good', 'service')),
  add constraint products_service_tracking_disabled check (
    product_type = 'good' or (not batch_control and not expiration_control)
  ),
  add constraint products_base_unit_fk foreign key (organization_id, base_unit_id)
    references public.measurement_units (organization_id, id) on delete restrict;

create or replace function public.normalized_measurement_unit_code(unit_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(btrim(coalesce(unit_name, '')))
    when 'UND' then 'UNIT' when 'UNIDAD' then 'UNIT'
    when 'CAJA' then 'BOX' when 'CJA' then 'BOX'
    when 'PAQUETE' then 'PACK' when 'PAQ' then 'PACK' when 'PQT' then 'PACK'
    when 'PAR' then 'PAIR' when 'PIEZA' then 'PIECE'
    when 'FRASCO' then 'BOTTLE' when 'BOLSA' then 'BAG'
    when 'ROLLO' then 'ROLL' when 'DOCENA' then 'DOZEN'
    when 'CIENTO' then 'HUNDRED' when 'MILLAR' then 'THOUSAND'
    when 'LITRO' then 'LITER' when 'LITROS' then 'LITER'
    when 'GALON' then 'GALLON' when 'GALÓN' then 'GALLON' when 'GALONES' then 'GALLON'
    when 'KILO' then 'KILOGRAM' when 'KILOS' then 'KILOGRAM' when 'KILOGRAMO' then 'KILOGRAM'
    when 'METRO' then 'METER' when 'METROS' then 'METER'
    when 'METRO CUBICO' then 'CUBIC_METER' when 'METRO CÚBICO' then 'CUBIC_METER'
    when 'METROS CUB' then 'CUBIC_METER' when 'METROS CÚB' then 'CUBIC_METER'
    when 'BALDE' then 'BUCKET' when 'SERVICIO' then 'SERVICE'
    else null
  end;
$$;

revoke all on function public.normalized_measurement_unit_code(text) from public, anon, authenticated;

-- Conserva unidades históricas no reconocidas sin convertirlas silenciosamente
-- en "Unidad". Luego podrán depurarse desde el maestro de cada organización.
insert into public.measurement_units (organization_id, code, name)
select distinct
  product.organization_id,
  'LEGACY_' || upper(substr(md5(upper(btrim(product.unit_of_measure))), 1, 12)),
  btrim(product.unit_of_measure)
from public.products product
where nullif(btrim(product.unit_of_measure), '') is not null
  and public.normalized_measurement_unit_code(product.unit_of_measure) is null
on conflict (organization_id, code) do nothing;

update public.products product
set base_unit_id = unit.id,
    unit_of_measure = unit.name
from public.measurement_units unit
where unit.organization_id = product.organization_id
  and unit.code = case
    when nullif(btrim(product.unit_of_measure), '') is null then 'UNIT'
    else coalesce(
      public.normalized_measurement_unit_code(product.unit_of_measure),
      'LEGACY_' || upper(substr(md5(upper(btrim(product.unit_of_measure))), 1, 12))
    )
  end;

alter table public.products alter column base_unit_id set not null;

create or replace function public.synchronize_product_base_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_unit public.measurement_units%rowtype;
  normalized_code text;
begin
  if new.product_type = 'service' then
    new.batch_control := false;
    new.expiration_control := false;
  end if;

  if new.base_unit_id is not null
    and (tg_op = 'INSERT' or new.base_unit_id is distinct from old.base_unit_id)
  then
    select unit.* into resolved_unit
    from public.measurement_units unit
    where unit.organization_id = new.organization_id
      and unit.id = new.base_unit_id
      and unit.is_active;
  else
    normalized_code := public.normalized_measurement_unit_code(new.unit_of_measure);
    if nullif(btrim(new.unit_of_measure), '') is null then
      normalized_code := 'UNIT';
    elsif normalized_code is null then
      raise exception using errcode = '22023', message = 'PRODUCT_BASE_UNIT_INVALID';
    end if;
    select unit.* into resolved_unit
    from public.measurement_units unit
    where unit.organization_id = new.organization_id
      and unit.code = normalized_code
      and unit.is_active;
  end if;

  if not found then
    raise exception using errcode = '22023', message = 'PRODUCT_BASE_UNIT_INVALID';
  end if;

  new.base_unit_id := resolved_unit.id;
  new.unit_of_measure := resolved_unit.name;
  return new;
end;
$$;

revoke all on function public.synchronize_product_base_unit() from public, anon, authenticated;

create trigger products_synchronize_base_unit
before insert or update of organization_id, base_unit_id, unit_of_measure, product_type,
  batch_control, expiration_control on public.products
for each row execute function public.synchronize_product_base_unit();

create table public.product_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  product_id uuid not null,
  unit_id uuid not null,
  conversion_factor numeric(16,6) not null,
  barcode text,
  sale_price numeric(14,2),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_unit_conversions_product_fk foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete cascade,
  constraint product_unit_conversions_unit_fk foreign key (organization_id, unit_id)
    references public.measurement_units (organization_id, id) on delete restrict,
  constraint product_unit_conversions_factor_positive check (conversion_factor > 0),
  constraint product_unit_conversions_barcode_length check (
    barcode is null or char_length(btrim(barcode)) between 3 and 50
  ),
  constraint product_unit_conversions_sale_price_nonnegative check (sale_price is null or sale_price >= 0),
  constraint product_unit_conversions_product_unit_unique unique (organization_id, product_id, unit_id)
);

create unique index product_unit_conversions_barcode_unique
  on public.product_unit_conversions (organization_id, barcode)
  where barcode is not null;
create index product_unit_conversions_product_idx
  on public.product_unit_conversions (organization_id, product_id, is_active);

create trigger product_unit_conversions_set_updated_at
before update on public.product_unit_conversions
for each row execute function public.set_updated_at();

create or replace function public.validate_product_unit_conversion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.products product
    where product.organization_id = new.organization_id
      and product.id = new.product_id
      and product.base_unit_id = new.unit_id
  ) then
    raise exception using errcode = '22023', message = 'PRODUCT_ALTERNATE_UNIT_MATCHES_BASE';
  end if;
  if new.barcode is not null and exists (
    select 1 from public.products product
    where product.organization_id = new.organization_id
      and product.barcode = new.barcode
  ) then
    raise exception using errcode = '23505', message = 'PRODUCT_BARCODE_DUPLICATE';
  end if;
  return new;
end;
$$;

create trigger product_unit_conversions_validate
before insert or update on public.product_unit_conversions
for each row execute function public.validate_product_unit_conversion();

create or replace function public.validate_product_base_barcode()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.barcode is not null and exists (
    select 1 from public.product_unit_conversions conversion
    where conversion.organization_id = new.organization_id
      and conversion.product_id <> new.id
      and conversion.barcode = new.barcode
  ) then
    raise exception using errcode = '23505', message = 'PRODUCT_BARCODE_DUPLICATE';
  end if;
  return new;
end;
$$;

create trigger products_validate_base_barcode
before insert or update of organization_id, barcode on public.products
for each row execute function public.validate_product_base_barcode();

alter table public.measurement_units enable row level security;
alter table public.product_unit_conversions enable row level security;

create policy measurement_units_select_authorized on public.measurement_units
for select to authenticated using (
  (select public.has_organization_permission(organization_id, 'PRODUCTS_VIEW'))
  or (select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE'))
);
create policy measurement_units_manage_authorized on public.measurement_units
for all to authenticated using (
  (select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE'))
) with check (
  (select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE'))
);

create policy product_unit_conversions_select_authorized on public.product_unit_conversions
for select to authenticated using (
  (select public.has_organization_permission(organization_id, 'PRODUCTS_VIEW'))
  or (select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE'))
);
create policy product_unit_conversions_insert_authorized on public.product_unit_conversions
for insert to authenticated with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE'))
);
create policy product_unit_conversions_update_authorized on public.product_unit_conversions
for update to authenticated using (
  (select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE'))
) with check (
  updated_by = (select auth.uid())
  and (select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE'))
);
create policy product_unit_conversions_delete_authorized on public.product_unit_conversions
for delete to authenticated using (
  (select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE'))
);

revoke all on table public.measurement_units, public.product_unit_conversions from public, anon;
grant select, insert, update on table public.measurement_units to authenticated;
grant select, insert, update, delete on table public.product_unit_conversions to authenticated;
grant all on table public.measurement_units, public.product_unit_conversions to service_role;

create or replace function public.save_product_catalog(
  requested_organization_id uuid,
  requested_product_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_product_id uuid;
  alternate_unit jsonb;
begin
  if actor_id is null or not public.has_organization_permission(
    requested_organization_id,
    'PRODUCTS_MANAGE'
  ) then
    raise exception using errcode = '42501', message = 'PRODUCT_PERMISSION_REQUIRED';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object'
    or nullif(btrim(payload ->> 'code'), '') is null
    or nullif(btrim(payload ->> 'description'), '') is null
    or nullif(payload ->> 'base_unit_id', '') is null
    or jsonb_typeof(coalesce(payload -> 'alternate_units', '[]'::jsonb)) <> 'array'
  then
    raise exception using errcode = '22023', message = 'PRODUCT_PAYLOAD_INVALID';
  end if;

  if requested_product_id is null then
    insert into public.products (
      organization_id, code, description, extended_description, barcode,
      category, subline, laboratory, presentation, base_unit_id,
      tax_affectation, cost, sale_price, minimum_sale_price, maximum_stock,
      width_cm, height_cm, length_cm, weight_kg, health_registry,
      product_type, batch_control, expiration_control, prescription_sale,
      is_active, created_by, updated_by
    ) values (
      requested_organization_id,
      upper(btrim(payload ->> 'code')),
      btrim(payload ->> 'description'),
      nullif(btrim(payload ->> 'extended_description'), ''),
      nullif(btrim(payload ->> 'barcode'), ''),
      nullif(btrim(payload ->> 'category'), ''),
      nullif(btrim(payload ->> 'subline'), ''),
      nullif(btrim(payload ->> 'laboratory'), ''),
      nullif(btrim(payload ->> 'presentation'), ''),
      (payload ->> 'base_unit_id')::uuid,
      coalesce(nullif(payload ->> 'tax_affectation', ''), 'por-definir'),
      nullif(payload ->> 'cost', '')::numeric,
      nullif(payload ->> 'sale_price', '')::numeric,
      nullif(payload ->> 'minimum_sale_price', '')::numeric,
      nullif(payload ->> 'maximum_stock', '')::numeric,
      nullif(payload ->> 'width_cm', '')::numeric,
      nullif(payload ->> 'height_cm', '')::numeric,
      nullif(payload ->> 'length_cm', '')::numeric,
      nullif(payload ->> 'weight_kg', '')::numeric,
      nullif(btrim(payload ->> 'health_registry'), ''),
      coalesce(nullif(payload ->> 'product_type', ''), 'good'),
      coalesce((payload ->> 'batch_control')::boolean, false),
      coalesce((payload ->> 'expiration_control')::boolean, false),
      coalesce((payload ->> 'prescription_sale')::boolean, false),
      coalesce((payload ->> 'is_active')::boolean, true),
      actor_id,
      actor_id
    ) returning id into saved_product_id;
  else
    update public.products product set
      code = upper(btrim(payload ->> 'code')),
      description = btrim(payload ->> 'description'),
      extended_description = nullif(btrim(payload ->> 'extended_description'), ''),
      barcode = nullif(btrim(payload ->> 'barcode'), ''),
      category = nullif(btrim(payload ->> 'category'), ''),
      subline = nullif(btrim(payload ->> 'subline'), ''),
      laboratory = nullif(btrim(payload ->> 'laboratory'), ''),
      presentation = nullif(btrim(payload ->> 'presentation'), ''),
      base_unit_id = (payload ->> 'base_unit_id')::uuid,
      tax_affectation = coalesce(nullif(payload ->> 'tax_affectation', ''), 'por-definir'),
      cost = nullif(payload ->> 'cost', '')::numeric,
      sale_price = nullif(payload ->> 'sale_price', '')::numeric,
      minimum_sale_price = nullif(payload ->> 'minimum_sale_price', '')::numeric,
      maximum_stock = nullif(payload ->> 'maximum_stock', '')::numeric,
      width_cm = nullif(payload ->> 'width_cm', '')::numeric,
      height_cm = nullif(payload ->> 'height_cm', '')::numeric,
      length_cm = nullif(payload ->> 'length_cm', '')::numeric,
      weight_kg = nullif(payload ->> 'weight_kg', '')::numeric,
      health_registry = nullif(btrim(payload ->> 'health_registry'), ''),
      product_type = coalesce(nullif(payload ->> 'product_type', ''), 'good'),
      batch_control = coalesce((payload ->> 'batch_control')::boolean, false),
      expiration_control = coalesce((payload ->> 'expiration_control')::boolean, false),
      prescription_sale = coalesce((payload ->> 'prescription_sale')::boolean, false),
      is_active = coalesce((payload ->> 'is_active')::boolean, true),
      updated_by = actor_id
    where product.organization_id = requested_organization_id
      and product.id = requested_product_id
    returning product.id into saved_product_id;

    if saved_product_id is null then
      raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
    end if;

    delete from public.product_unit_conversions conversion
    where conversion.organization_id = requested_organization_id
      and conversion.product_id = saved_product_id;
  end if;

  for alternate_unit in
    select value from jsonb_array_elements(payload -> 'alternate_units')
  loop
    insert into public.product_unit_conversions (
      organization_id, product_id, unit_id, conversion_factor,
      barcode, sale_price, is_active, created_by, updated_by
    ) values (
      requested_organization_id,
      saved_product_id,
      (alternate_unit ->> 'unit_id')::uuid,
      (alternate_unit ->> 'conversion_factor')::numeric,
      nullif(btrim(alternate_unit ->> 'barcode'), ''),
      nullif(alternate_unit ->> 'sale_price', '')::numeric,
      true,
      actor_id,
      actor_id
    );
  end loop;

  return saved_product_id;
end;
$$;

revoke all on function public.save_product_catalog(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_product_catalog(uuid, uuid, jsonb)
  to authenticated, service_role;

comment on column public.products.code is
  'SKU único dentro de la organización; identifica una presentación almacenada.';
comment on column public.products.unit_of_measure is
  'Instantánea textual compatible de la unidad base; base_unit_id es la referencia canónica.';
comment on table public.product_unit_conversions is
  'Unidades alternativas de compra o venta expresadas como cantidad de unidades base.';

commit;
