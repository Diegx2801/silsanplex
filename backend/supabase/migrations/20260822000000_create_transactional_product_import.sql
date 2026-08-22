-- ============================================================
-- SILSANPLEX: importacion transaccional del catalogo de productos
-- ============================================================

create table public.product_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  payload_hash text not null,
  result jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint product_import_batches_hash_format
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint product_import_batches_result_object
    check (jsonb_typeof(result) = 'object'),
  constraint product_import_batches_organization_hash_key
    unique (organization_id, payload_hash)
);

create index product_import_batches_organization_created_idx
  on public.product_import_batches (organization_id, created_at desc);

comment on table public.product_import_batches is
  'Huellas internas de importaciones de productos; no se expone al Data API.';

alter table public.product_import_batches enable row level security;

revoke all on table public.product_import_batches
  from public, anon, authenticated, service_role;

create or replace function public.import_products(
  requested_organization_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  payload_hash text;
  existing_result jsonb;
  batch_id uuid := gen_random_uuid();
  normalized_products jsonb := '[]'::jsonb;
  normalized_prices jsonb := '[]'::jsonb;
  normalized_payload jsonb;
  product_duplicate_rows jsonb := '[]'::jsonb;
  price_duplicate_rows jsonb := '[]'::jsonb;
  unmatched_price_rows jsonb := '[]'::jsonb;
  product_conflict_rows jsonb := '[]'::jsonb;
  price_conflict_rows jsonb := '[]'::jsonb;
  rejected_rows jsonb := '[]'::jsonb;
  import_result jsonb;
  created_count integer := 0;
  unchanged_count integer := 0;
begin
  if actor_id is null
    or not public.has_organization_permission(
      requested_organization_id,
      'PRODUCTS_MANAGE'
    )
  then
    raise exception using
      errcode = '42501',
      message = 'PRODUCT_IMPORT_FORBIDDEN';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  -- Serializa importaciones de la misma organizacion para que la huella y
  -- las comprobaciones contra products sean atomicas tambien entre sesiones.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'product-import:' || requested_organization_id::text,
      0
    )
  );

  if coalesce(jsonb_typeof(payload -> 'productos') <> 'array', true)
    or coalesce(jsonb_typeof(payload -> 'precios') <> 'array', true)
    or (
      case
        when jsonb_typeof(payload -> 'productos') = 'array'
        then jsonb_array_length(payload -> 'productos') = 0
        else false
      end
    )
    or (
      case
        when jsonb_typeof(payload -> 'precios') = 'array'
        then jsonb_array_length(payload -> 'precios') = 0
        else false
      end
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(payload -> 'productos') source(item)
    where coalesce(jsonb_typeof(source.item) <> 'object', true)
      or not coalesce(
        jsonb_typeof(source.item -> 'fila') in ('number', 'string'),
        false
      )
      or not coalesce(
        (source.item ->> 'fila') ~ '^[0-9]+$',
        false
      )
      or not coalesce(jsonb_typeof(source.item -> 'codigo') = 'string', false)
      or not coalesce(
        upper(btrim(source.item ->> 'codigo'))
          ~ '^[A-Z0-9][A-Z0-9._-]{0,29}$',
        false
      )
      or not coalesce(
        jsonb_typeof(source.item -> 'descripcion') = 'string',
        false
      )
      or not coalesce(
        char_length(btrim(source.item ->> 'descripcion')) between 2 and 160,
        false
      )
      or not coalesce(
        jsonb_typeof(source.item -> 'categoria') in ('string', 'null'),
        true
      )
      or not coalesce(
        char_length(btrim(source.item ->> 'categoria')) <= 80,
        true
      )
      or not coalesce(
        jsonb_typeof(source.item -> 'sublinea') in ('string', 'null'),
        true
      )
      or not coalesce(
        char_length(btrim(source.item ->> 'sublinea')) <= 80,
        true
      )
      or not coalesce(
        jsonb_typeof(source.item -> 'laboratorio') in ('string', 'null'),
        true
      )
      or not coalesce(
        char_length(btrim(source.item ->> 'laboratorio')) <= 100,
        true
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(payload -> 'precios') source(item)
    where coalesce(jsonb_typeof(source.item) <> 'object', true)
      or not coalesce(
        jsonb_typeof(source.item -> 'fila') in ('number', 'string'),
        false
      )
      or not coalesce(
        (source.item ->> 'fila') ~ '^[0-9]+$',
        false
      )
      or not coalesce(
        jsonb_typeof(source.item -> 'codigo_producto') = 'string',
        false
      )
      or not coalesce(
        upper(btrim(source.item ->> 'codigo_producto'))
          ~ '^[A-Z0-9][A-Z0-9._-]{0,29}$',
        false
      )
      or not coalesce(
        jsonb_typeof(source.item -> 'producto') in ('string', 'null'),
        true
      )
      or not coalesce(
        jsonb_typeof(source.item -> 'unidad_medida') in ('string', 'null'),
        true
      )
      or not coalesce(
        char_length(btrim(source.item ->> 'unidad_medida')) <= 40,
        true
      )
      or (
        source.item ? 'precio_venta'
        and not coalesce(
          jsonb_typeof(source.item -> 'precio_venta')
            in ('number', 'string', 'null'),
          false
        )
      )
      or (
        nullif(btrim(source.item ->> 'precio_venta'), '') is not null
        and not coalesce(
          btrim(source.item ->> 'precio_venta')
            ~ '^(0|[0-9]+)(\.[0-9]{1,2})?$',
          false
        )
      )
      or (
        nullif(btrim(source.item ->> 'precio_venta'), '') is not null
        and case
          when coalesce(
            btrim(source.item ->> 'precio_venta')
              ~ '^(0|[0-9]+)(\.[0-9]{1,2})?$',
            false
          )
          then nullif(btrim(source.item ->> 'precio_venta'), '')::numeric
            > 999999999999.99
          else false
        end
      )
      or (
        source.item ? 'inc_igv'
        and not coalesce(
          jsonb_typeof(source.item -> 'inc_igv') in ('string', 'null'),
          false
        )
      )
      or (
        source.item ? 'inc_igv'
        and not coalesce(
            nullif(lower(btrim(source.item ->> 'inc_igv')), '') is null
            or lower(btrim(source.item ->> 'inc_igv'))
              in ('sí', 'si', 'no', 'pendiente'),
          false
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  with normalized as (
    select
      source.ordinality as source_position,
      source.item -> 'fila' as source_row,
      upper(btrim(source.item ->> 'codigo')) as code,
      btrim(source.item ->> 'descripcion') as description,
      nullif(btrim(source.item ->> 'categoria'), '') as category,
      nullif(btrim(source.item ->> 'sublinea'), '') as subline,
      nullif(btrim(source.item ->> 'laboratorio'), '') as laboratory
    from jsonb_array_elements(payload -> 'productos')
      with ordinality source(item, ordinality)
  ), selected as (
    select distinct on (normalized.code)
      normalized.source_row,
      normalized.source_position,
      normalized.code,
      normalized.description,
      normalized.category,
      normalized.subline,
      normalized.laboratory
    from normalized
    order by normalized.code, normalized.source_position
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'fila', selected.source_row,
        'codigo', selected.code,
        'descripcion', selected.description,
        'categoria', selected.category,
        'sublinea', selected.subline,
        'laboratorio', selected.laboratory
      )
      order by selected.code
    ),
    '[]'::jsonb
  )
  into normalized_products
  from selected;

  with normalized as (
    select
      source.ordinality as source_position,
      source.item -> 'fila' as source_row,
      upper(btrim(source.item ->> 'codigo_producto')) as product_code,
      nullif(btrim(source.item ->> 'producto'), '') as product_name,
      nullif(btrim(source.item ->> 'unidad_medida'), '') as unit_of_measure,
      nullif(btrim(source.item ->> 'precio_venta'), '')::numeric as sale_price,
      case lower(nullif(btrim(source.item ->> 'inc_igv'), ''))
        when 'sí' then 'Sí'
        when 'si' then 'Sí'
        when 'no' then 'No'
        else 'Pendiente'
      end as inc_igv
    from jsonb_array_elements(payload -> 'precios')
      with ordinality source(item, ordinality)
  ), selected as (
    select distinct on (normalized.product_code)
      normalized.source_row,
      normalized.source_position,
      normalized.product_code,
      normalized.product_name,
      normalized.unit_of_measure,
      normalized.sale_price,
      normalized.inc_igv
    from normalized
    order by normalized.product_code, normalized.source_position
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'fila', selected.source_row,
        'codigo_producto', selected.product_code,
        'producto', selected.product_name,
        'unidad_medida', selected.unit_of_measure,
        'precio_venta', selected.sale_price,
        'inc_igv', selected.inc_igv
      )
      order by selected.product_code
    ),
    '[]'::jsonb
  )
  into normalized_prices
  from selected;

  normalized_payload := jsonb_build_object(
    'productos', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'codigo', upper(btrim(item ->> 'codigo')),
            'descripcion', upper(btrim(item ->> 'descripcion')),
            'categoria', upper(nullif(btrim(item ->> 'categoria'), '')),
            'sublinea', upper(nullif(btrim(item ->> 'sublinea'), '')),
            'laboratorio', upper(nullif(btrim(item ->> 'laboratorio'), ''))
          )
          order by item ->> 'codigo'
        )
        from jsonb_array_elements(normalized_products) source(item)
      ),
      '[]'::jsonb
    ),
    'precios', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'codigo_producto', upper(btrim(item ->> 'codigo_producto')),
            'producto', upper(nullif(btrim(item ->> 'producto'), '')),
            'unidad_medida', upper(nullif(btrim(item ->> 'unidad_medida'), '')),
            'precio_venta', item -> 'precio_venta',
            'inc_igv', item ->> 'inc_igv'
          )
          order by item ->> 'codigo_producto'
        )
        from jsonb_array_elements(normalized_prices) source(item)
      ),
      '[]'::jsonb
    )
  );
  payload_hash := encode(
    extensions.digest(normalized_payload::text, 'sha256'),
    'hex'
  );

  select batch.result
  into existing_result
  from public.product_import_batches batch
  where batch.organization_id = requested_organization_id
    and batch.payload_hash = payload_hash;

  if found then
    return existing_result;
  end if;

  with normalized as (
    select
      source.ordinality as source_position,
      source.item -> 'fila' as source_row,
      upper(btrim(source.item ->> 'codigo')) as code,
      jsonb_build_object(
        'codigo', upper(btrim(source.item ->> 'codigo')),
        'descripcion', upper(btrim(source.item ->> 'descripcion')),
        'categoria', upper(nullif(btrim(source.item ->> 'categoria'), '')),
        'sublinea', upper(nullif(btrim(source.item ->> 'sublinea'), '')),
        'laboratorio', upper(nullif(btrim(source.item ->> 'laboratorio'), ''))
      ) as semantic_row
    from jsonb_array_elements(payload -> 'productos')
      with ordinality source(item, ordinality)
  ), grouped as (
    select
      normalized.code,
      jsonb_agg(normalized.source_row order by normalized.source_position) as source_rows,
      count(distinct normalized.semantic_row) as distinct_rows
    from normalized
    group by normalized.code
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tipo', 'producto',
        'codigo', grouped.code,
        'filas', grouped.source_rows,
        'motivo', 'PRODUCT_DUPLICATE_CONFLICT'
      )
      order by grouped.code
    ),
    '[]'::jsonb
  )
  into product_duplicate_rows
  from grouped
  where grouped.distinct_rows > 1;

  with normalized as (
    select
      source.ordinality as source_position,
      source.item -> 'fila' as source_row,
      upper(btrim(source.item ->> 'codigo_producto')) as product_code,
      jsonb_build_object(
        'codigo_producto', upper(btrim(source.item ->> 'codigo_producto')),
        'producto', upper(nullif(btrim(source.item ->> 'producto'), '')),
        'unidad_medida', upper(nullif(btrim(source.item ->> 'unidad_medida'), '')),
        'precio_venta', nullif(btrim(source.item ->> 'precio_venta'), '')::numeric,
        'inc_igv', case lower(nullif(btrim(source.item ->> 'inc_igv'), ''))
          when 'sí' then 'Sí'
          when 'si' then 'Sí'
          when 'no' then 'No'
          else 'Pendiente'
        end
      ) as semantic_row
    from jsonb_array_elements(payload -> 'precios')
      with ordinality source(item, ordinality)
  ), grouped as (
    select
      normalized.product_code,
      jsonb_agg(normalized.source_row order by normalized.source_position) as source_rows,
      count(distinct normalized.semantic_row) as distinct_rows
    from normalized
    group by normalized.product_code
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tipo', 'precio',
        'codigo', grouped.product_code,
        'filas', grouped.source_rows,
        'motivo', 'PRICE_DUPLICATE_CONFLICT'
      )
      order by grouped.product_code
    ),
    '[]'::jsonb
  )
  into price_duplicate_rows
  from grouped
  where grouped.distinct_rows > 1;

  rejected_rows := rejected_rows || product_duplicate_rows || price_duplicate_rows;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tipo', 'precio',
        'fila', price_item.item -> 'fila',
        'codigo', price_item.item -> 'codigo_producto',
        'motivo', 'PRICE_PRODUCT_NOT_FOUND'
      )
      order by price_item.item ->> 'codigo_producto'
    ),
    '[]'::jsonb
  )
  into unmatched_price_rows
  from jsonb_array_elements(normalized_prices) price_item(item)
  where not exists (
    select 1
    from jsonb_array_elements(normalized_products) product_item(item)
    where product_item.item ->> 'codigo' = price_item.item ->> 'codigo_producto'
  )
    and not exists (
      select 1
      from public.products existing
      where existing.organization_id = requested_organization_id
        and existing.code = price_item.item ->> 'codigo_producto'
    );

  rejected_rows := rejected_rows || unmatched_price_rows;

  select coalesce(
    jsonb_agg(conflict.detail order by conflict.detail ->> 'codigo'),
    '[]'::jsonb
  )
  into product_conflict_rows
  from (
    select jsonb_build_object(
      'tipo', 'producto',
      'fila', product_item.item -> 'fila',
      'codigo', product_item.item -> 'codigo',
      'motivo', 'PRODUCT_EXISTING_CONFLICT'
    ) as detail
    from jsonb_array_elements(normalized_products) product_item(item)
    left join lateral (
      select price_item.item
      from jsonb_array_elements(normalized_prices) price_item(item)
      where price_item.item ->> 'codigo_producto'
        = product_item.item ->> 'codigo'
      limit 1
    ) price_item on true
    join public.products existing
      on existing.organization_id = requested_organization_id
      and existing.code = product_item.item ->> 'codigo'
    where upper(btrim(existing.description)) is distinct from upper(btrim(product_item.item ->> 'descripcion'))
      or upper(btrim(existing.category)) is distinct from upper(nullif(btrim(product_item.item ->> 'categoria'), ''))
      or upper(btrim(existing.subline)) is distinct from upper(nullif(btrim(product_item.item ->> 'sublinea'), ''))
      or upper(btrim(existing.laboratory)) is distinct from upper(nullif(btrim(product_item.item ->> 'laboratorio'), ''))
      or (
        price_item.item is not null
        and (
          upper(btrim(existing.unit_of_measure)) is distinct from upper(nullif(btrim(price_item.item ->> 'unidad_medida'), ''))
          or existing.sale_price is distinct from (price_item.item ->> 'precio_venta')::numeric
          or existing.tax_affectation is distinct from case
            when price_item.item ->> 'inc_igv' = 'Sí'
            then 'gravado'
            else 'por-definir'
          end
        )
      )
  ) conflict;

  rejected_rows := rejected_rows || product_conflict_rows;

  select coalesce(
    jsonb_agg(conflict.detail order by conflict.detail ->> 'codigo'),
    '[]'::jsonb
  )
  into price_conflict_rows
  from (
    select jsonb_build_object(
      'tipo', 'precio',
      'fila', price_item.item -> 'fila',
      'codigo', price_item.item -> 'codigo_producto',
      'motivo', 'PRODUCT_EXISTING_CONFLICT'
    ) as detail
    from jsonb_array_elements(normalized_prices) price_item(item)
    join public.products existing
      on existing.organization_id = requested_organization_id
      and existing.code = price_item.item ->> 'codigo_producto'
    where not exists (
      select 1
      from jsonb_array_elements(normalized_products) product_item(item)
      where product_item.item ->> 'codigo'
        = price_item.item ->> 'codigo_producto'
    )
      and (
        upper(btrim(existing.unit_of_measure)) is distinct from upper(nullif(btrim(price_item.item ->> 'unidad_medida'), ''))
        or existing.sale_price is distinct from
          (price_item.item ->> 'precio_venta')::numeric
        or existing.tax_affectation is distinct from case
          when price_item.item ->> 'inc_igv' = 'Sí'
          then 'gravado'
          else 'por-definir'
        end
      )
  ) conflict;

  rejected_rows := rejected_rows || price_conflict_rows;

  if jsonb_array_length(rejected_rows) > 0 then
    import_result := jsonb_build_object(
      'estado', 'rechazado',
      'hash', payload_hash,
      'id_lote', batch_id,
      'creados', 0,
      'sin_cambios', 0,
      'filas_rechazadas', rejected_rows
    );

    insert into public.product_import_batches (
      id,
      organization_id,
      payload_hash,
      result,
      created_by
    )
    values (
      batch_id,
      requested_organization_id,
      payload_hash,
      import_result,
      actor_id
    );

    insert into public.audit_events (
      organization_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      new_values,
      metadata
    )
    values (
      requested_organization_id,
      actor_id,
      'PRODUCT_IMPORT_REJECTED',
      'product_import',
      batch_id::text,
      import_result,
      jsonb_build_object(
        'source', 'database_function',
        'payload_hash', payload_hash
      )
    );

    return import_result;
  end if;

  select count(*)::integer
  into unchanged_count
  from jsonb_array_elements(normalized_products) product_item(item)
  left join lateral (
    select price_item.item
    from jsonb_array_elements(normalized_prices) price_item(item)
    where price_item.item ->> 'codigo_producto'
      = product_item.item ->> 'codigo'
    limit 1
  ) price_item on true
  join public.products existing
    on existing.organization_id = requested_organization_id
    and existing.code = product_item.item ->> 'codigo'
  where upper(btrim(existing.description)) is not distinct from upper(btrim(product_item.item ->> 'descripcion'))
    and upper(btrim(existing.category)) is not distinct from upper(nullif(btrim(product_item.item ->> 'categoria'), ''))
    and upper(btrim(existing.subline)) is not distinct from upper(nullif(btrim(product_item.item ->> 'sublinea'), ''))
    and upper(btrim(existing.laboratory)) is not distinct from upper(nullif(btrim(product_item.item ->> 'laboratorio'), ''))
    and (
      price_item.item is null
      or (
        upper(btrim(existing.unit_of_measure)) is not distinct from upper(nullif(btrim(price_item.item ->> 'unidad_medida'), ''))
        and existing.sale_price is not distinct from (price_item.item ->> 'precio_venta')::numeric
        and existing.tax_affectation is not distinct from case
          when price_item.item ->> 'inc_igv' = 'Sí'
          then 'gravado'
          else 'por-definir'
        end
      )
    );

  select unchanged_count + count(*)::integer
  into unchanged_count
  from jsonb_array_elements(normalized_prices) price_item(item)
  join public.products existing
    on existing.organization_id = requested_organization_id
    and existing.code = price_item.item ->> 'codigo_producto'
  where not exists (
    select 1
    from jsonb_array_elements(normalized_products) product_item(item)
    where product_item.item ->> 'codigo'
      = price_item.item ->> 'codigo_producto'
  )
    and upper(btrim(existing.unit_of_measure)) is not distinct from upper(nullif(btrim(price_item.item ->> 'unidad_medida'), ''))
    and existing.sale_price is not distinct from
      (price_item.item ->> 'precio_venta')::numeric
    and existing.tax_affectation is not distinct from case
      when price_item.item ->> 'inc_igv' = 'Sí'
      then 'gravado'
      else 'por-definir'
    end;

  with inserted as (
    insert into public.products (
      organization_id,
      code,
      description,
      category,
      subline,
      laboratory,
      unit_of_measure,
      tax_affectation,
      sale_price,
      created_by,
      updated_by
    )
    select
      requested_organization_id,
      product_item.item ->> 'codigo',
      product_item.item ->> 'descripcion',
      product_item.item ->> 'categoria',
      product_item.item ->> 'sublinea',
      product_item.item ->> 'laboratorio',
      price_item.item ->> 'unidad_medida',
      case
        when price_item.item is not null
          and price_item.item ->> 'inc_igv' = 'Sí'
        then 'gravado'
        else 'por-definir'
      end,
      (price_item.item ->> 'precio_venta')::numeric,
      actor_id,
      actor_id
    from jsonb_array_elements(normalized_products) product_item(item)
    left join lateral (
      select price_item.item
      from jsonb_array_elements(normalized_prices) price_item(item)
      where price_item.item ->> 'codigo_producto'
        = product_item.item ->> 'codigo'
      limit 1
    ) price_item on true
    where not exists (
      select 1
      from public.products existing
      where existing.organization_id = requested_organization_id
        and existing.code = product_item.item ->> 'codigo'
    )
    returning id
  )
  select count(*)::integer
  into created_count
  from inserted;

  import_result := jsonb_build_object(
    'estado', 'completado',
    'hash', payload_hash,
    'id_lote', batch_id,
    'creados', created_count,
    'sin_cambios', unchanged_count,
    'filas_rechazadas', '[]'::jsonb
  );

  insert into public.product_import_batches (
    id,
    organization_id,
    payload_hash,
    result,
    created_by
  )
  values (
    batch_id,
    requested_organization_id,
    payload_hash,
    import_result,
    actor_id
  );

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    new_values,
    metadata
  )
  values (
    requested_organization_id,
    actor_id,
    'PRODUCT_IMPORT_COMPLETED',
    'product_import',
    batch_id::text,
    import_result,
    jsonb_build_object(
      'source', 'database_function',
      'payload_hash', payload_hash,
      'created_count', created_count,
      'unchanged_count', unchanged_count
    )
  );

  return import_result;
end;
$$;

revoke all on function public.import_products(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_products(uuid, jsonb)
  to authenticated;
