-- Cierre del catálogo: organización de imágenes, metadata documental y
-- restauración auditable de versiones del maestro de productos.

alter table public.product_versions
  drop constraint product_versions_event_valid,
  add constraint product_versions_event_valid
    check (event_type in (
      'baseline', 'created', 'updated', 'status-changed', 'restored',
      'file-added', 'file-updated', 'file-removed'
    ));

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
  restored_version text := current_setting('app.product_restore_version', true);
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
    when nullif(restored_version, '') is not null then 'restored'
    when new.is_active is distinct from old.is_active then 'status-changed'
    else 'updated'
  end;
  event_summary := case event_name
    when 'created' then 'Producto registrado'
    when 'restored' then 'Ficha restaurada desde la versión ' || restored_version
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
  file_changes jsonb;
begin
  if tg_op = 'UPDATE'
    and current_setting('app.product_file_bulk_update', true) = 'true'
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    event_name := 'file-added';
    event_summary := 'Archivo agregado: ' || left(new.file_name, 220);
    file_changes := jsonb_build_object(
      'file', jsonb_build_object(
        'after', jsonb_build_object(
          'id', new.id, 'kind', new.kind, 'name', new.file_name,
          'description', new.description, 'is_primary', new.is_primary,
          'sort_order', new.sort_order
        )
      )
    );
  elsif new.deleted_at is distinct from old.deleted_at then
    event_name := 'file-removed';
    event_summary := 'Archivo retirado: ' || left(new.file_name, 220);
    file_changes := jsonb_build_object(
      'file', jsonb_build_object(
        'before', jsonb_build_object(
          'id', old.id, 'kind', old.kind, 'name', old.file_name,
          'description', old.description, 'is_primary', old.is_primary,
          'sort_order', old.sort_order
        )
      )
    );
  elsif new.description is distinct from old.description
    or new.is_primary is distinct from old.is_primary
    or new.sort_order is distinct from old.sort_order
  then
    event_name := 'file-updated';
    event_summary := 'Archivo actualizado: ' || left(new.file_name, 218);
    file_changes := jsonb_build_object(
      'file', jsonb_build_object(
        'before', jsonb_build_object(
          'id', old.id, 'kind', old.kind, 'name', old.file_name,
          'description', old.description, 'is_primary', old.is_primary,
          'sort_order', old.sort_order
        ),
        'after', jsonb_build_object(
          'id', new.id, 'kind', new.kind, 'name', new.file_name,
          'description', new.description, 'is_primary', new.is_primary,
          'sort_order', new.sort_order
        )
      )
    );
  else
    return new;
  end if;

  select to_jsonb(product)
  into product_snapshot
  from public.products product
  where product.organization_id = new.organization_id
    and product.id = new.product_id;

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
    file_changes,
    new.id,
    coalesce(auth.uid(), new.deleted_by, new.created_by)
  );

  return new;
end;
$$;

create function public.update_product_file_description(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_file_id uuid,
  requested_description text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.has_organization_permission(requested_organization_id, 'PRODUCTS_MANAGE')
  then
    raise exception using errcode = '42501', message = 'PRODUCT_FILE_FORBIDDEN';
  end if;

  if char_length(btrim(coalesce(requested_description, ''))) > 240 then
    raise exception using errcode = 'P0001', message = 'PRODUCT_FILE_DESCRIPTION_INVALID';
  end if;

  update public.product_files file
  set description = nullif(btrim(requested_description), '')
  where file.id = requested_file_id
    and file.organization_id = requested_organization_id
    and file.product_id = requested_product_id
    and file.deleted_at is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRODUCT_FILE_NOT_FOUND';
  end if;
end;
$$;

create function public.organize_product_images(
  requested_organization_id uuid,
  requested_product_id uuid,
  ordered_image_ids uuid[],
  primary_image_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_count integer;
  image_id uuid;
  product_snapshot jsonb;
begin
  if auth.uid() is null
    or not public.has_organization_permission(requested_organization_id, 'PRODUCTS_MANAGE')
  then
    raise exception using errcode = '42501', message = 'PRODUCT_FILE_FORBIDDEN';
  end if;

  if ordered_image_ids is null
    or cardinality(ordered_image_ids) = 0
    or primary_image_id is null
    or not primary_image_id = any(ordered_image_ids)
    or cardinality(ordered_image_ids) <> cardinality(array(select distinct unnest(ordered_image_ids)))
  then
    raise exception using errcode = 'P0001', message = 'PRODUCT_IMAGE_ORDER_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(requested_product_id::text || ':images', 0));
  perform set_config('app.product_file_bulk_update', 'true', true);

  select count(*)::integer
  into expected_count
  from public.product_files file
  where file.organization_id = requested_organization_id
    and file.product_id = requested_product_id
    and file.kind = 'image'
    and file.deleted_at is null;

  if expected_count <> cardinality(ordered_image_ids)
    or exists (
      select 1
      from unnest(ordered_image_ids) requested(id)
      where not exists (
        select 1
        from public.product_files file
        where file.id = requested.id
          and file.organization_id = requested_organization_id
          and file.product_id = requested_product_id
          and file.kind = 'image'
          and file.deleted_at is null
      )
    )
  then
    raise exception using errcode = 'P0001', message = 'PRODUCT_IMAGE_ORDER_INVALID';
  end if;

  update public.product_files file
  set is_primary = false
  where file.organization_id = requested_organization_id
    and file.product_id = requested_product_id
    and file.kind = 'image'
    and file.deleted_at is null
    and file.is_primary;

  for current_position in 1..cardinality(ordered_image_ids) loop
    image_id := ordered_image_ids[current_position];

    update public.product_files file
    set sort_order = current_position - 1,
        is_primary = image_id = primary_image_id
    where file.id = image_id
      and (
        file.sort_order is distinct from current_position - 1
        or file.is_primary is distinct from (image_id = primary_image_id)
      );
  end loop;

  select to_jsonb(product)
  into product_snapshot
  from public.products product
  where product.organization_id = requested_organization_id
    and product.id = requested_product_id;

  insert into public.product_versions (
    organization_id, product_id, version_number, event_type, summary,
    snapshot, changes, actor_user_id
  )
  values (
    requested_organization_id,
    requested_product_id,
    public.next_product_version(requested_organization_id, requested_product_id),
    'file-updated',
    'Galería de imágenes organizada',
    product_snapshot,
    jsonb_build_object(
      'images', jsonb_build_object(
        'after', jsonb_build_object(
          'ordered_ids', to_jsonb(ordered_image_ids),
          'primary_id', to_jsonb(primary_image_id)
        )
      )
    ),
    auth.uid()
  );
end;
$$;

create function public.restore_product_version(
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

revoke all on function public.update_product_file_description(uuid, uuid, uuid, text)
  from public, anon;
revoke all on function public.organize_product_images(uuid, uuid, uuid[], uuid)
  from public, anon;
revoke all on function public.restore_product_version(uuid, uuid, integer)
  from public, anon;

grant execute on function public.update_product_file_description(uuid, uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.organize_product_images(uuid, uuid, uuid[], uuid)
  to authenticated, service_role;
grant execute on function public.restore_product_version(uuid, uuid, integer)
  to authenticated, service_role;

comment on function public.organize_product_images(uuid, uuid, uuid[], uuid) is
  'Ordena todas las imágenes activas de un producto y define una única imagen principal.';
comment on function public.restore_product_version(uuid, uuid, integer) is
  'Restaura campos editables desde una versión histórica y crea una nueva versión restaurada.';
