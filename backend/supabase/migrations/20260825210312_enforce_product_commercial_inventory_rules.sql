-- Hace efectivo el stock maximo global definido en el maestro de productos.
-- La regla vive en inventory_movements para cubrir entradas manuales,
-- recepciones de compra y cualquier integracion futura que escriba inventario.

create or replace function public.enforce_product_maximum_stock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  configured_maximum numeric;
  current_stock numeric;
begin
  if new.movement_type not in ('entrada', 'ajuste-positivo') then
    return new;
  end if;

  select product.maximum_stock
  into configured_maximum
  from public.products product
  where product.id = new.product_id
    and product.organization_id = new.organization_id;

  if configured_maximum is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'product-maximum-stock:' || new.organization_id::text || ':' || new.product_id::text,
      0
    )
  );

  select coalesce(sum(
    case
      when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity
      else -movement.quantity
    end
  ), 0)
  into current_stock
  from public.inventory_movements movement
  where movement.organization_id = new.organization_id
    and movement.product_id = new.product_id;

  if current_stock + new.quantity > configured_maximum then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_MAXIMUM_STOCK_EXCEEDED',
      detail = pg_catalog.format(
        'product_id=%s,current_stock=%s,incoming_quantity=%s,maximum_stock=%s',
        new.product_id,
        current_stock,
        new.quantity,
        configured_maximum
      );
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_product_maximum_stock() from public, anon, authenticated;

create trigger inventory_movements_enforce_product_maximum_stock
before insert on public.inventory_movements
for each row execute function public.enforce_product_maximum_stock();

comment on function public.enforce_product_maximum_stock() is
  'Impide que una entrada deje el stock global del producto por encima de products.maximum_stock.';

-- Amplia la importacion transaccional manteniendo compatibilidad con los dos
-- archivos heredados. El nucleo anterior conserva sus validaciones de identidad;
-- esta envoltura persiste la ficha extendida solo en productos nuevos.

alter function public.import_products(uuid, jsonb)
  rename to import_products_catalog_core;

revoke all on function public.import_products_catalog_core(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_products_catalog_core(uuid, jsonb)
  to service_role;

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
  actor_id uuid := (select auth.uid());
  legacy_payload jsonb;
  import_result jsonb;
  full_payload_hash text;
  existing_result jsonb;
  new_product_codes text[] := array[]::text[];
  product_item jsonb;
  price_item jsonb;
  imported_batch_id uuid;
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
    raise exception using errcode = 'P0001', message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(payload -> 'productos', '[]'::jsonb)) source(item)
    where (source.item ? 'descripcion_ampliada' and char_length(btrim(source.item ->> 'descripcion_ampliada')) > 4000)
      or (source.item ? 'codigo_barras' and char_length(btrim(source.item ->> 'codigo_barras')) > 50)
      or (source.item ? 'presentacion' and char_length(btrim(source.item ->> 'presentacion')) > 100)
      or (source.item ? 'registro_sanitario' and char_length(btrim(source.item ->> 'registro_sanitario')) > 80)
      or exists (
        select 1
        from unnest(array['ancho_cm', 'alto_cm', 'largo_cm', 'peso_kg']) field(name)
        where nullif(btrim(source.item ->> field.name), '') is not null
          and (
            not (btrim(source.item ->> field.name) ~ '^[0-9]+(\.[0-9]{1,3})?$')
            or (source.item ->> field.name)::numeric <= 0
          )
      )
      or (
        nullif(btrim(source.item ->> 'stock_maximo'), '') is not null
        and (
          not (btrim(source.item ->> 'stock_maximo') ~ '^[0-9]+(\.[0-9]{1,3})?$')
          or (source.item ->> 'stock_maximo')::numeric < 0
        )
      )
      or exists (
        select 1
        from unnest(array['control_lote', 'control_vencimiento', 'venta_receta']) field(name)
        where source.item ? field.name
          and jsonb_typeof(source.item -> field.name) <> 'boolean'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(payload -> 'precios', '[]'::jsonb)) source(item)
    where exists (
      select 1
      from unnest(array['costo_base', 'precio_minimo']) field(name)
      where nullif(btrim(source.item ->> field.name), '') is not null
        and (
          not (btrim(source.item ->> field.name) ~ '^(0|[0-9]+)(\.[0-9]{1,2})?$')
          or (source.item ->> field.name)::numeric > 999999999999.99
        )
    )
      or (
        nullif(btrim(source.item ->> 'precio_minimo'), '') is not null
        and nullif(btrim(source.item ->> 'precio_venta'), '') is not null
        and (source.item ->> 'precio_minimo')::numeric
          > (source.item ->> 'precio_venta')::numeric
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  full_payload_hash := encode(
    extensions.digest(payload::text, 'sha256'),
    'hex'
  );

  select batch.result
  into existing_result
  from public.product_import_batches batch
  where batch.organization_id = requested_organization_id
    and batch.payload_hash = full_payload_hash;

  if found then
    return existing_result;
  end if;

  select coalesce(array_agg(upper(btrim(source.item ->> 'codigo'))), array[]::text[])
  into new_product_codes
  from jsonb_array_elements(payload -> 'productos') source(item)
  where not exists (
    select 1
    from public.products product
    where product.organization_id = requested_organization_id
      and product.code = upper(btrim(source.item ->> 'codigo'))
  );

  legacy_payload := jsonb_build_object(
    'productos', (
      select coalesce(jsonb_agg(
        source.item
          - array[
              'descripcion_ampliada', 'codigo_barras', 'presentacion',
              'registro_sanitario', 'stock_maximo', 'ancho_cm', 'alto_cm',
              'largo_cm', 'peso_kg', 'control_lote', 'control_vencimiento',
              'venta_receta'
            ]::text[]
        order by source.ordinality
      ), '[]'::jsonb)
      from jsonb_array_elements(payload -> 'productos')
        with ordinality source(item, ordinality)
    ),
    'precios', (
      select coalesce(jsonb_agg(
        source.item - array['costo_base', 'precio_minimo']::text[]
        order by source.ordinality
      ), '[]'::jsonb)
      from jsonb_array_elements(payload -> 'precios')
        with ordinality source(item, ordinality)
    )
  );

  import_result := public.import_products_catalog_core(
    requested_organization_id,
    legacy_payload
  );

  if import_result ->> 'estado' = 'completado'
    and cardinality(new_product_codes) > 0
  then
    for product_item in
      select source.item
      from jsonb_array_elements(payload -> 'productos') source(item)
      where upper(btrim(source.item ->> 'codigo')) = any(new_product_codes)
      order by upper(btrim(source.item ->> 'codigo'))
    loop
      select source.item
      into price_item
      from jsonb_array_elements(payload -> 'precios') source(item)
      where upper(btrim(source.item ->> 'codigo_producto'))
        = upper(btrim(product_item ->> 'codigo'))
      order by (source.item ->> 'fila')::integer
      limit 1;

      update public.products product
      set
        extended_description = nullif(btrim(product_item ->> 'descripcion_ampliada'), ''),
        barcode = nullif(btrim(product_item ->> 'codigo_barras'), ''),
        presentation = nullif(btrim(product_item ->> 'presentacion'), ''),
        health_registry = nullif(btrim(product_item ->> 'registro_sanitario'), ''),
        maximum_stock = nullif(btrim(product_item ->> 'stock_maximo'), '')::numeric,
        width_cm = nullif(btrim(product_item ->> 'ancho_cm'), '')::numeric,
        height_cm = nullif(btrim(product_item ->> 'alto_cm'), '')::numeric,
        length_cm = nullif(btrim(product_item ->> 'largo_cm'), '')::numeric,
        weight_kg = nullif(btrim(product_item ->> 'peso_kg'), '')::numeric,
        batch_control = coalesce((product_item ->> 'control_lote')::boolean, false),
        expiration_control = coalesce((product_item ->> 'control_vencimiento')::boolean, false),
        prescription_sale = coalesce((product_item ->> 'venta_receta')::boolean, false),
        cost = nullif(btrim(price_item ->> 'costo_base'), '')::numeric,
        minimum_sale_price = nullif(btrim(price_item ->> 'precio_minimo'), '')::numeric,
        updated_by = actor_id
      where product.organization_id = requested_organization_id
        and product.code = upper(btrim(product_item ->> 'codigo'));
    end loop;

    import_result := jsonb_set(import_result, '{hash}', to_jsonb(full_payload_hash));
    imported_batch_id := (import_result ->> 'id_lote')::uuid;

    update public.product_import_batches batch
    set payload_hash = full_payload_hash,
        result = import_result
    where batch.id = imported_batch_id
      and batch.organization_id = requested_organization_id;
  end if;

  return import_result;
end;
$$;

revoke all on function public.import_products(uuid, jsonb) from public, anon;
grant execute on function public.import_products(uuid, jsonb) to authenticated, service_role;

comment on function public.import_products(uuid, jsonb) is
  'Importa el contrato legado y persiste ficha extendida, dimensiones, controles y reglas comerciales en productos nuevos.';
