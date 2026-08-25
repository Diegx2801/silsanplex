-- ============================================================
-- SILSANPLEX: ficha completa, archivos y versiones de productos
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Ficha comercial, fisica y control de vencimiento
-- ------------------------------------------------------------

alter table public.products
  add column extended_description text,
  add column width_cm numeric(10,3),
  add column height_cm numeric(10,3),
  add column length_cm numeric(10,3),
  add column weight_kg numeric(10,3),
  add column minimum_sale_price numeric(14,2),
  add column maximum_stock numeric(14,3),
  add column expiration_control boolean;

update public.products
set expiration_control = batch_control;

-- Recupera el stock maximo del contrato legado cuando estuvo informado.
update public.products product
set maximum_stock = nullif(trace.source_snapshot ->> 'stock_maximo', '')::numeric
from public.legacy_model_migration_trace trace
where trace.legacy_table = 'productos'
  and trace.canonical_table = 'products'
  and trace.canonical_id = product.id
  and nullif(trace.source_snapshot ->> 'stock_maximo', '') is not null
  and (trace.source_snapshot ->> 'stock_maximo')::numeric >= 0;

alter table public.products
  alter column expiration_control set default false,
  alter column expiration_control set not null,
  add constraint products_extended_description_length
    check (extended_description is null or char_length(btrim(extended_description)) <= 5000),
  add constraint products_dimensions_positive
    check (
      (width_cm is null or width_cm > 0)
      and (height_cm is null or height_cm > 0)
      and (length_cm is null or length_cm > 0)
      and (weight_kg is null or weight_kg > 0)
    ),
  add constraint products_minimum_sale_price_nonnegative
    check (minimum_sale_price is null or minimum_sale_price >= 0),
  add constraint products_minimum_sale_price_consistent
    check (
      minimum_sale_price is null
      or sale_price is null
      or minimum_sale_price <= sale_price
    ),
  add constraint products_maximum_stock_nonnegative
    check (maximum_stock is null or maximum_stock >= 0);

comment on column public.products.expiration_control is
  'Control de fecha de vencimiento independiente del control por lote.';
comment on column public.products.maximum_stock is
  'Tope global referencial del producto; los minimos operativos siguen configurandose por almacen.';

create or replace function public.validate_product_tracking_requirements()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
begin
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

revoke all on function public.validate_product_tracking_requirements() from public;

create trigger inventory_movements_validate_product_tracking
before insert on public.inventory_movements
for each row execute function public.validate_product_tracking_requirements();

create or replace function public.validate_purchase_item_expiration()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.products product
    where product.id = new.product_id
      and product.organization_id = new.organization_id
      and product.expiration_control
  ) and new.expiration_date is null then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_EXPIRATION_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_purchase_item_expiration() from public;

create trigger purchase_order_items_validate_expiration
before insert or update on public.purchase_order_items
for each row execute function public.validate_purchase_item_expiration();

-- ------------------------------------------------------------
-- 2. Metadata de archivos en un bucket privado
-- ------------------------------------------------------------

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'product-files',
  'product-files',
  false,
  6291456,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.product_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null,
  kind text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  description text,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_by uuid references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  constraint product_files_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint product_files_kind_valid
    check (kind in ('image', 'technical-sheet', 'attachment')),
  constraint product_files_path_valid
    check (
      char_length(storage_path) between 10 and 500
      and split_part(storage_path, '/', 1) = organization_id::text
      and split_part(storage_path, '/', 2) = product_id::text
    ),
  constraint product_files_name_length
    check (char_length(btrim(file_name)) between 1 and 180),
  constraint product_files_mime_length
    check (char_length(btrim(mime_type)) between 3 and 150),
  constraint product_files_size_valid
    check (byte_size between 1 and 6291456),
  constraint product_files_description_length
    check (description is null or char_length(btrim(description)) <= 240),
  constraint product_files_sort_order_valid
    check (sort_order between 0 and 1000),
  constraint product_files_primary_image_only
    check (not is_primary or kind = 'image'),
  constraint product_files_deletion_consistent
    check (
      (deleted_at is null and deleted_by is null)
      or (deleted_at is not null and deleted_by is not null)
    ),
  unique (storage_path),
  unique (organization_id, product_id, id)
);

create unique index product_files_one_primary_image_uidx
  on public.product_files (organization_id, product_id)
  where kind = 'image' and is_primary and deleted_at is null;
create index product_files_product_active_idx
  on public.product_files (organization_id, product_id, kind, sort_order, created_at, id)
  where deleted_at is null;

create or replace function public.protect_product_file_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    return new;
  end if;

  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.product_id is distinct from old.product_id
    or new.kind is distinct from old.kind
    or new.storage_path is distinct from old.storage_path
    or new.file_name is distinct from old.file_name
    or new.mime_type is distinct from old.mime_type
    or new.byte_size is distinct from old.byte_size
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or old.deleted_at is not null
  then
    raise exception using errcode = 'P0001', message = 'PRODUCT_FILE_IMMUTABLE_FIELDS';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if new.deleted_at is null then
      raise exception using errcode = 'P0001', message = 'PRODUCT_FILE_CANNOT_RESTORE';
    end if;
    new.deleted_by := coalesce(auth.uid(), new.deleted_by);
    new.is_primary := false;
  else
    new.deleted_by := old.deleted_by;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_product_file_fields() from public;

create trigger product_files_protect_fields
before insert or update on public.product_files
for each row execute function public.protect_product_file_fields();

-- ------------------------------------------------------------
-- 3. Versiones e historial integrado append-only
-- ------------------------------------------------------------

create table public.product_versions (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null,
  version_number integer not null,
  event_type text not null,
  summary text not null,
  snapshot jsonb not null,
  changes jsonb not null default '{}'::jsonb,
  file_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint product_versions_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint product_versions_file_fk
    foreign key (organization_id, product_id, file_id)
    references public.product_files (organization_id, product_id, id) on delete restrict,
  constraint product_versions_number_positive check (version_number > 0),
  constraint product_versions_event_valid
    check (event_type in ('baseline', 'created', 'updated', 'status-changed', 'file-added', 'file-removed')),
  constraint product_versions_summary_length
    check (char_length(btrim(summary)) between 2 and 240),
  unique (organization_id, product_id, version_number)
);

create index product_versions_product_created_idx
  on public.product_versions (organization_id, product_id, version_number desc);

insert into public.product_versions (
  organization_id, product_id, version_number, event_type, summary,
  snapshot, actor_user_id, created_at
)
select
  product.organization_id,
  product.id,
  1,
  'baseline',
  'Versión inicial al habilitar el historial',
  to_jsonb(product),
  coalesce(product.updated_by, product.created_by),
  product.updated_at
from public.products product;

create or replace function public.next_product_version(
  requested_organization_id uuid,
  requested_product_id uuid
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  next_version integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(requested_product_id::text, 0));

  select coalesce(max(version.version_number), 0) + 1
  into next_version
  from public.product_versions version
  where version.organization_id = requested_organization_id
    and version.product_id = requested_product_id;

  return next_version;
end;
$$;

revoke all on function public.next_product_version(uuid, uuid) from public;

create or replace function public.record_product_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_snapshot jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  new_snapshot jsonb := to_jsonb(new);
  changed_fields jsonb := '{}'::jsonb;
  event_name text;
  event_summary text;
begin
  if tg_op = 'UPDATE' then
    select coalesce(
      jsonb_object_agg(
        current_value.key,
        jsonb_build_object('before', old_snapshot -> current_value.key, 'after', current_value.value)
      ),
      '{}'::jsonb
    )
    into changed_fields
    from jsonb_each(new_snapshot) current_value
    where old_snapshot -> current_value.key is distinct from current_value.value;
  end if;

  event_name := case
    when tg_op = 'INSERT' then 'created'
    when new.is_active is distinct from old.is_active then 'status-changed'
    else 'updated'
  end;
  event_summary := case event_name
    when 'created' then 'Producto registrado'
    when 'status-changed' then case when new.is_active then 'Producto activado' else 'Producto desactivado' end
    else 'Ficha del producto actualizada'
  end;

  insert into public.product_versions (
    organization_id, product_id, version_number, event_type, summary,
    snapshot, changes, actor_user_id
  )
  values (
    new.organization_id,
    new.id,
    public.next_product_version(new.organization_id, new.id),
    event_name,
    event_summary,
    new_snapshot,
    changed_fields,
    coalesce(auth.uid(), new.updated_by, new.created_by)
  );

  return new;
end;
$$;

revoke all on function public.record_product_version() from public;

create trigger products_record_version
after insert or update on public.products
for each row execute function public.record_product_version();

create or replace function public.record_product_file_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_snapshot jsonb;
  event_name text;
  event_summary text;
begin
  if tg_op = 'UPDATE' and not (new.deleted_at is distinct from old.deleted_at) then
    return new;
  end if;

  select to_jsonb(product)
  into product_snapshot
  from public.products product
  where product.organization_id = new.organization_id
    and product.id = new.product_id;

  event_name := case when tg_op = 'INSERT' then 'file-added' else 'file-removed' end;
  event_summary := case when tg_op = 'INSERT'
    then 'Archivo agregado: ' || left(new.file_name, 220)
    else 'Archivo retirado: ' || left(new.file_name, 220)
  end;

  insert into public.product_versions (
    organization_id, product_id, version_number, event_type, summary,
    snapshot, changes, file_id, actor_user_id
  )
  values (
    new.organization_id,
    new.product_id,
    public.next_product_version(new.organization_id, new.product_id),
    event_name,
    event_summary,
    product_snapshot,
    jsonb_build_object(
      'file', jsonb_build_object(
        'id', new.id,
        'kind', new.kind,
        'name', new.file_name,
        'mime_type', new.mime_type,
        'byte_size', new.byte_size,
        'storage_path', new.storage_path
      )
    ),
    new.id,
    coalesce(auth.uid(), new.deleted_by, new.created_by)
  );

  return new;
end;
$$;

revoke all on function public.record_product_file_version() from public;

create trigger product_files_record_version
after insert or update on public.product_files
for each row execute function public.record_product_file_version();

create or replace function public.prevent_product_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'PRODUCT_VERSION_IMMUTABLE';
end;
$$;

revoke all on function public.prevent_product_version_mutation() from public;

create trigger product_versions_immutable
before update or delete on public.product_versions
for each row execute function public.prevent_product_version_mutation();

-- ------------------------------------------------------------
-- 4. RLS, Data API y Storage
-- ------------------------------------------------------------

alter table public.product_files enable row level security;
alter table public.product_versions enable row level security;

create policy product_files_select_authorized
on public.product_files for select to authenticated
using ((select public.has_organization_permission(organization_id, 'PRODUCTS_VIEW')));

create policy product_files_insert_authorized
on public.product_files for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE'))
);

create policy product_files_update_authorized
on public.product_files for update to authenticated
using ((select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE')))
with check ((select public.has_organization_permission(organization_id, 'PRODUCTS_MANAGE')));

create policy product_versions_select_authorized
on public.product_versions for select to authenticated
using ((select public.has_organization_permission(organization_id, 'PRODUCTS_VIEW')));

revoke all on table public.product_files, public.product_versions from anon;
grant select, insert, update on table public.product_files to authenticated;
grant select on table public.product_versions to authenticated;
grant select, insert, update, delete on table public.product_files, public.product_versions to service_role;
grant usage, select on sequence public.product_versions_id_seq to service_role;

create policy product_files_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'product-files'
  and exists (
    select 1
    from public.product_files file
    where file.storage_path = name
      and file.deleted_at is null
      and (select public.has_organization_permission(file.organization_id, 'PRODUCTS_VIEW'))
  )
);

create policy product_files_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-files'
  and exists (
    select 1
    from public.products product
    where product.organization_id::text = (storage.foldername(name))[1]
      and product.id::text = (storage.foldername(name))[2]
      and (select public.has_organization_permission(product.organization_id, 'PRODUCTS_MANAGE'))
  )
);

create policy product_files_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-files'
  and exists (
    select 1
    from public.product_files file
    where file.storage_path = name
      and (select public.has_organization_permission(file.organization_id, 'PRODUCTS_MANAGE'))
  )
);

commit;
