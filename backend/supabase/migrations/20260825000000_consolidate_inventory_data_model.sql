-- ============================================================
-- SILSANPLEX: unificacion del modelo de catalogo e inventario
-- Canonico: products / warehouses / inventory_movements
-- ============================================================

begin;

-- Evita escrituras concurrentes mientras se obtiene el snapshot legado, se
-- migran los datos y se retiran las tablas alternativas.
lock table public.productos in access exclusive mode;
lock table public.almacenes in access exclusive mode;
lock table public.ubicaciones in access exclusive mode;
lock table public.lotes in access exclusive mode;
lock table public.movimientos_inventario in access exclusive mode;
lock table public.products in access exclusive mode;
lock table public.warehouses in access exclusive mode;
lock table public.warehouse_locations in access exclusive mode;
lock table public.inventory_movements in access exclusive mode;

create table public.legacy_model_migration_trace (
  legacy_table text not null,
  legacy_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  canonical_table text not null,
  canonical_id uuid,
  canonical_key jsonb,
  resolution text not null,
  source_snapshot jsonb not null,
  migrated_at timestamptz not null default now(),
  constraint legacy_model_migration_trace_pk primary key (legacy_table, legacy_id),
  constraint legacy_model_migration_trace_legacy_table_valid check (
    legacy_table in ('productos', 'almacenes', 'ubicaciones', 'lotes', 'movimientos_inventario')
  ),
  constraint legacy_model_migration_trace_canonical_table_valid check (
    canonical_table in ('products', 'warehouses', 'warehouse_locations', 'inventory_movements')
  ),
  constraint legacy_model_migration_trace_resolution_valid check (
    resolution in ('matched', 'migrated', 'represented')
  ),
  constraint legacy_model_migration_trace_target_present check (
    canonical_id is not null or canonical_key is not null
  )
);

create index legacy_model_migration_trace_organization_idx
  on public.legacy_model_migration_trace (organization_id, legacy_table, legacy_id);

comment on table public.legacy_model_migration_trace is
  'Traza inmutable de la convergencia desde el modelo logistico en espanol al contrato canonico.';

revoke all on table public.legacy_model_migration_trace from anon, authenticated, service_role;

create or replace function public.prevent_legacy_model_migration_trace_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'LEGACY_MODEL_MIGRATION_TRACE_IMMUTABLE';
end;
$$;

revoke all on function public.prevent_legacy_model_migration_trace_mutation() from public;

create trigger legacy_model_migration_trace_immutable
before update or delete on public.legacy_model_migration_trace
for each row execute function public.prevent_legacy_model_migration_trace_mutation();

-- ------------------------------------------------------------
-- 1. Productos
-- ------------------------------------------------------------

create temporary table product_legacy_map on commit drop as
select
  legacy.id as legacy_id,
  legacy.organization_id,
  coalesce(
    canonical.id,
    case
      when not exists (select 1 from public.products by_id where by_id.id = legacy.id)
        then legacy.id
      else gen_random_uuid()
    end
  ) as canonical_id,
  coalesce(
    canonical.code,
    case
      when upper(btrim(legacy.codigo_interno)) ~ '^[A-Z0-9][A-Z0-9._-]{0,29}$'
        and not exists (
          select 1
          from public.products by_code
          where by_code.organization_id = legacy.organization_id
            and by_code.code = upper(btrim(legacy.codigo_interno))
        )
        then upper(btrim(legacy.codigo_interno))
      else 'LEG-' || upper(substr(md5(legacy.id::text), 1, 20))
    end
  ) as canonical_code,
  canonical.id is not null as matched
from public.productos legacy
left join lateral (
  select product.id, product.code
  from public.products product
  where product.organization_id = legacy.organization_id
    and lower(btrim(product.code)) = lower(btrim(legacy.codigo_interno))
  order by product.created_at, product.id
  limit 1
) canonical on true;

insert into public.products (
  id, organization_id, code, description, barcode, category, laboratory,
  presentation, unit_of_measure, sale_price, health_registry, batch_control,
  is_active, created_by, updated_by, created_at, updated_at, subline, cost
)
select
  mapping.canonical_id,
  legacy.organization_id,
  mapping.canonical_code,
  btrim(legacy.descripcion),
  case
    when legacy.codigo_barras is not null
      and char_length(btrim(legacy.codigo_barras)) between 3 and 50
      and not exists (
        select 1 from public.products product
        where product.organization_id = legacy.organization_id
          and product.barcode = btrim(legacy.codigo_barras)
      )
      then btrim(legacy.codigo_barras)
    else null
  end,
  left(nullif(btrim(linea.nombre), ''), 80),
  left(nullif(btrim(marca.nombre), ''), 100),
  left(nullif(btrim(legacy.presentacion), ''), 100),
  left(nullif(btrim(coalesce(unidad.abreviatura, unidad.nombre)), ''), 40),
  legacy.precio_venta,
  left(nullif(btrim(legacy.registro_sanitario), ''), 80),
  legacy.control_lote,
  legacy.estado,
  legacy.created_by,
  legacy.updated_by,
  legacy.created_at,
  legacy.updated_at,
  left(nullif(btrim(sublinea.nombre), ''), 80),
  legacy.costo
from public.productos legacy
join product_legacy_map mapping on mapping.legacy_id = legacy.id
left join public.marcas marca
  on marca.organization_id = legacy.organization_id and marca.id = legacy.marca_id
left join public.lineas linea
  on linea.organization_id = legacy.organization_id and linea.id = legacy.linea_id
left join public.sublineas sublinea
  on sublinea.organization_id = legacy.organization_id and sublinea.id = legacy.sublinea_id
left join public.unidades_medida unidad
  on unidad.organization_id = legacy.organization_id and unidad.id = legacy.unidad_medida_id
where not mapping.matched;

-- Si el codigo ya existia, el registro canonico prevalece y solo se completan
-- campos vacios con informacion legada no conflictiva.
update public.products product
set
  barcode = coalesce(
    product.barcode,
    case
      when legacy.codigo_barras is not null
        and char_length(btrim(legacy.codigo_barras)) between 3 and 50
        and not exists (
          select 1 from public.products by_barcode
          where by_barcode.organization_id = legacy.organization_id
            and by_barcode.barcode = btrim(legacy.codigo_barras)
            and by_barcode.id <> product.id
        )
        then btrim(legacy.codigo_barras)
      else null
    end
  ),
  category = coalesce(product.category, left(nullif(btrim(linea.nombre), ''), 80)),
  laboratory = coalesce(product.laboratory, left(nullif(btrim(marca.nombre), ''), 100)),
  presentation = coalesce(product.presentation, left(nullif(btrim(legacy.presentacion), ''), 100)),
  unit_of_measure = coalesce(
    product.unit_of_measure,
    left(nullif(btrim(coalesce(unidad.abreviatura, unidad.nombre)), ''), 40)
  ),
  sale_price = coalesce(product.sale_price, legacy.precio_venta),
  health_registry = coalesce(
    product.health_registry,
    left(nullif(btrim(legacy.registro_sanitario), ''), 80)
  ),
  subline = coalesce(product.subline, left(nullif(btrim(sublinea.nombre), ''), 80)),
  cost = coalesce(product.cost, legacy.costo),
  updated_by = coalesce(product.updated_by, legacy.updated_by)
from public.productos legacy
join product_legacy_map mapping on mapping.legacy_id = legacy.id
left join public.marcas marca
  on marca.organization_id = legacy.organization_id and marca.id = legacy.marca_id
left join public.lineas linea
  on linea.organization_id = legacy.organization_id and linea.id = legacy.linea_id
left join public.sublineas sublinea
  on sublinea.organization_id = legacy.organization_id and sublinea.id = legacy.sublinea_id
left join public.unidades_medida unidad
  on unidad.organization_id = legacy.organization_id and unidad.id = legacy.unidad_medida_id
where mapping.matched
  and product.id = mapping.canonical_id;

insert into public.legacy_model_migration_trace (
  legacy_table, legacy_id, organization_id, canonical_table, canonical_id,
  canonical_key, resolution, source_snapshot
)
select
  'productos', legacy.id, legacy.organization_id, 'products', mapping.canonical_id,
  jsonb_build_object('code', mapping.canonical_code),
  case when mapping.matched then 'matched' else 'migrated' end,
  to_jsonb(legacy)
from public.productos legacy
join product_legacy_map mapping on mapping.legacy_id = legacy.id;

-- ------------------------------------------------------------
-- 2. Almacenes y ubicaciones
-- ------------------------------------------------------------

create temporary table warehouse_legacy_map on commit drop as
select
  legacy.id as legacy_id,
  legacy.organization_id,
  coalesce(
    canonical.id,
    case
      when not exists (select 1 from public.warehouses by_id where by_id.id = legacy.id)
        then legacy.id
      else gen_random_uuid()
    end
  ) as canonical_id,
  coalesce(canonical.code, 'LEG-' || upper(substr(md5(legacy.id::text), 1, 12))) as canonical_code,
  canonical.id is not null as matched
from public.almacenes legacy
left join lateral (
  select warehouse.id, warehouse.code
  from public.warehouses warehouse
  where warehouse.organization_id = legacy.organization_id
    and lower(btrim(warehouse.name)) = lower(btrim(legacy.nombre))
  order by warehouse.created_at, warehouse.id
  limit 1
) canonical on true;

insert into public.warehouses (
  id, organization_id, code, name, address, is_active, created_at, updated_at
)
select
  mapping.canonical_id, legacy.organization_id, mapping.canonical_code,
  left(
    case when char_length(btrim(legacy.nombre)) = 1
      then btrim(legacy.nombre) || ' - legado'
      else btrim(legacy.nombre)
    end,
    80
  ),
  left(nullif(btrim(legacy.direccion), ''), 180),
  legacy.estado, legacy.created_at, legacy.updated_at
from public.almacenes legacy
join warehouse_legacy_map mapping on mapping.legacy_id = legacy.id
where not mapping.matched;

update public.warehouses warehouse
set address = coalesce(warehouse.address, left(nullif(btrim(legacy.direccion), ''), 180))
from public.almacenes legacy
join warehouse_legacy_map mapping on mapping.legacy_id = legacy.id
where mapping.matched
  and warehouse.id = mapping.canonical_id;

insert into public.legacy_model_migration_trace (
  legacy_table, legacy_id, organization_id, canonical_table, canonical_id,
  canonical_key, resolution, source_snapshot
)
select
  'almacenes', legacy.id, legacy.organization_id, 'warehouses', mapping.canonical_id,
  jsonb_build_object('code', mapping.canonical_code),
  case when mapping.matched then 'matched' else 'migrated' end,
  to_jsonb(legacy)
from public.almacenes legacy
join warehouse_legacy_map mapping on mapping.legacy_id = legacy.id;

-- Todo almacen necesita una ubicacion utilizable por el libro canonico.
insert into public.warehouse_locations (organization_id, warehouse_id, code, name)
select mapping.organization_id, mapping.canonical_id, 'GENERAL', 'Ubicacion general'
from warehouse_legacy_map mapping
on conflict (organization_id, warehouse_id, code) do nothing;

create temporary table location_legacy_map on commit drop as
select
  legacy.id as legacy_id,
  legacy.organization_id,
  warehouse.canonical_id as canonical_warehouse_id,
  coalesce(
    canonical.id,
    case
      when not exists (select 1 from public.warehouse_locations by_id where by_id.id = legacy.id)
        then legacy.id
      else gen_random_uuid()
    end
  ) as canonical_id,
  coalesce(canonical.code, 'LEG-' || upper(substr(md5(legacy.id::text), 1, 12))) as canonical_code,
  canonical.id is not null as matched
from public.ubicaciones legacy
join warehouse_legacy_map warehouse on warehouse.legacy_id = legacy.almacen_id
left join lateral (
  select location.id, location.code
  from public.warehouse_locations location
  where location.organization_id = legacy.organization_id
    and location.warehouse_id = warehouse.canonical_id
    and lower(btrim(location.name)) = lower(btrim(legacy.nombre))
  order by location.created_at, location.id
  limit 1
) canonical on true;

insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, description,
  is_active, created_at, updated_at
)
select
  mapping.canonical_id, legacy.organization_id, mapping.canonical_warehouse_id,
  mapping.canonical_code,
  left(
    case when char_length(btrim(legacy.nombre)) = 1
      then btrim(legacy.nombre) || ' - legado'
      else btrim(legacy.nombre)
    end,
    80
  ),
  left(nullif(btrim(legacy.descripcion), ''), 180), legacy.estado,
  legacy.created_at, legacy.updated_at
from public.ubicaciones legacy
join location_legacy_map mapping on mapping.legacy_id = legacy.id
where not mapping.matched;

update public.warehouse_locations location
set description = coalesce(
  location.description,
  left(nullif(btrim(legacy.descripcion), ''), 180)
)
from public.ubicaciones legacy
join location_legacy_map mapping on mapping.legacy_id = legacy.id
where mapping.matched
  and location.id = mapping.canonical_id;

insert into public.legacy_model_migration_trace (
  legacy_table, legacy_id, organization_id, canonical_table, canonical_id,
  canonical_key, resolution, source_snapshot
)
select
  'ubicaciones', legacy.id, legacy.organization_id, 'warehouse_locations', mapping.canonical_id,
  jsonb_build_object('warehouse_id', mapping.canonical_warehouse_id, 'code', mapping.canonical_code),
  case when mapping.matched then 'matched' else 'migrated' end,
  to_jsonb(legacy)
from public.ubicaciones legacy
join location_legacy_map mapping on mapping.legacy_id = legacy.id;

-- El stock minimo legado se conserva como configuracion por almacen.
insert into public.product_warehouse_settings (
  organization_id, product_id, warehouse_id, default_location_id, minimum_stock
)
select
  product.organization_id,
  product.canonical_id,
  warehouse.canonical_id,
  location.id,
  coalesce(legacy.stock_minimo, 0)
from public.productos legacy
join product_legacy_map product on product.legacy_id = legacy.id
join warehouse_legacy_map warehouse on warehouse.organization_id = legacy.organization_id
join public.warehouse_locations location
  on location.organization_id = warehouse.organization_id
 and location.warehouse_id = warehouse.canonical_id
 and location.code = 'GENERAL'
on conflict (organization_id, product_id, warehouse_id) do nothing;

-- ------------------------------------------------------------
-- 3. Lotes y movimientos append-only
-- ------------------------------------------------------------

insert into public.legacy_model_migration_trace (
  legacy_table, legacy_id, organization_id, canonical_table, canonical_key,
  resolution, source_snapshot
)
select
  'lotes', lot.id, lot.organization_id, 'inventory_movements',
  jsonb_build_object(
    'product_id', product.canonical_id,
    'lot', lot.numero_lote,
    'manufacturing_date', lot.fecha_fabricacion,
    'expiration_date', lot.fecha_vencimiento
  ),
  'represented',
  to_jsonb(lot)
from public.lotes lot
join product_legacy_map product on product.legacy_id = lot.producto_id;

create temporary table movement_legacy_map on commit drop as
select
  legacy.id as legacy_id,
  legacy.organization_id,
  case
    when existing.id is not null then existing.id
    when not exists (select 1 from public.inventory_movements by_id where by_id.id = legacy.id)
      then legacy.id
    else gen_random_uuid()
  end as canonical_id,
  existing.id is not null as matched
from public.movimientos_inventario legacy
left join public.inventory_movements existing
  on existing.id = legacy.id
 and existing.organization_id = legacy.organization_id;

insert into public.inventory_movements (
  id, organization_id, product_id, product_code, product_description,
  unit_of_measure, movement_type, quantity, warehouse, lot, expiration_date,
  operation_date, reason, source_type, source_id, created_by, created_at,
  warehouse_id, location_id, stock_status, unit_cost
)
select
  movement_map.canonical_id,
  legacy.organization_id,
  product.id,
  product.code,
  product.description,
  product.unit_of_measure,
  case legacy.tipo_movimiento
    when 'PURCHASE_IN' then 'entrada'
    when 'SALE_OUT' then 'salida'
    when 'TRANSFER_IN' then 'entrada'
    when 'TRANSFER_OUT' then 'salida'
    when 'ADJUSTMENT_IN' then 'ajuste-positivo'
    when 'ADJUSTMENT_OUT' then 'ajuste-negativo'
    when 'RETURN_IN' then 'entrada'
    when 'RETURN_OUT' then 'salida'
  end,
  legacy.cantidad,
  warehouse.name,
  left(nullif(btrim(lot.numero_lote), ''), 60),
  lot.fecha_vencimiento,
  legacy.fecha_movimiento::date,
  left(coalesce(nullif(btrim(legacy.observacion), ''), 'Migrado: ' || legacy.tipo_movimiento), 180),
  'manual',
  null,
  legacy.usuario_id,
  legacy.fecha_movimiento,
  warehouse.id,
  coalesce(location.id, general_location.id),
  'available',
  coalesce(product.cost, legacy_product.costo, 0)
from public.movimientos_inventario legacy
join movement_legacy_map movement_map on movement_map.legacy_id = legacy.id
join product_legacy_map product_map on product_map.legacy_id = legacy.producto_id
join public.products product on product.id = product_map.canonical_id
join public.productos legacy_product on legacy_product.id = legacy.producto_id
join warehouse_legacy_map warehouse_map on warehouse_map.legacy_id = legacy.almacen_id
join public.warehouses warehouse on warehouse.id = warehouse_map.canonical_id
left join location_legacy_map location_map on location_map.legacy_id = legacy.ubicacion_id
left join public.warehouse_locations location on location.id = location_map.canonical_id
join public.warehouse_locations general_location
  on general_location.organization_id = legacy.organization_id
 and general_location.warehouse_id = warehouse.id
 and general_location.code = 'GENERAL'
left join public.lotes lot on lot.id = legacy.lote_id
where not movement_map.matched;

insert into public.legacy_model_migration_trace (
  legacy_table, legacy_id, organization_id, canonical_table, canonical_id,
  canonical_key, resolution, source_snapshot
)
select
  'movimientos_inventario', legacy.id, legacy.organization_id,
  'inventory_movements', mapping.canonical_id,
  jsonb_build_object(
    'legacy_balance_before', legacy.saldo_anterior,
    'legacy_balance_after', legacy.saldo_nuevo,
    'document_type', legacy.documento_tipo,
    'document_id', legacy.documento_id
  ),
  case when mapping.matched then 'matched' else 'migrated' end,
  to_jsonb(legacy)
from public.movimientos_inventario legacy
join movement_legacy_map mapping on mapping.legacy_id = legacy.id;

-- La migracion se detiene antes de cualquier DROP si una fila no quedo trazada
-- o si un destino canonico requerido no existe.
do $$
declare
  missing_count bigint;
begin
  select
    (select count(*) from public.productos)
      - (select count(*) from public.legacy_model_migration_trace where legacy_table = 'productos')
    + (select count(*) from public.almacenes)
      - (select count(*) from public.legacy_model_migration_trace where legacy_table = 'almacenes')
    + (select count(*) from public.ubicaciones)
      - (select count(*) from public.legacy_model_migration_trace where legacy_table = 'ubicaciones')
    + (select count(*) from public.lotes)
      - (select count(*) from public.legacy_model_migration_trace where legacy_table = 'lotes')
    + (select count(*) from public.movimientos_inventario)
      - (select count(*) from public.legacy_model_migration_trace where legacy_table = 'movimientos_inventario')
  into missing_count;

  if missing_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_MODEL_MIGRATION_TRACE_MISMATCH',
      detail = format('Diferencia total de filas: %s', missing_count);
  end if;

  if exists (
    select 1
    from public.legacy_model_migration_trace trace
    where trace.canonical_id is not null
      and (
        (trace.canonical_table = 'products' and not exists (
          select 1 from public.products target
          where target.id = trace.canonical_id and target.organization_id = trace.organization_id
        ))
        or (trace.canonical_table = 'warehouses' and not exists (
          select 1 from public.warehouses target
          where target.id = trace.canonical_id and target.organization_id = trace.organization_id
        ))
        or (trace.canonical_table = 'warehouse_locations' and not exists (
          select 1 from public.warehouse_locations target
          where target.id = trace.canonical_id and target.organization_id = trace.organization_id
        ))
        or (trace.canonical_table = 'inventory_movements' and not exists (
          select 1 from public.inventory_movements target
          where target.id = trace.canonical_id and target.organization_id = trace.organization_id
        ))
      )
  ) then
    raise exception using errcode = 'P0001', message = 'LEGACY_MODEL_MIGRATION_TARGET_MISSING';
  end if;
end;
$$;

insert into public.audit_events (
  organization_id, actor_user_id, action, entity_type, entity_id, new_values, metadata
)
select
  trace.organization_id,
  null,
  'DATA_MODEL_CONSOLIDATED',
  'database_model',
  trace.organization_id::text,
  jsonb_object_agg(trace.legacy_table, trace.row_count),
  jsonb_build_object(
    'canonical_contract', jsonb_build_array('products', 'warehouses', 'inventory_movements'),
    'trace_table', 'legacy_model_migration_trace'
  )
from (
  select organization_id, legacy_table, count(*) as row_count
  from public.legacy_model_migration_trace
  group by organization_id, legacy_table
) trace
group by trace.organization_id;

-- ------------------------------------------------------------
-- 4. Retiro del contrato alterno
-- ------------------------------------------------------------

drop table public.movimientos_inventario;
drop table public.lotes;
drop table public.ubicaciones;
drop table public.almacenes;
drop table public.productos;

comment on table public.products is
  'Contrato canonico del catalogo de productos de SILSANPLEX.';
comment on table public.warehouses is
  'Contrato canonico de almacenes de SILSANPLEX.';
comment on table public.inventory_movements is
  'Libro canonico, append-only, de movimientos de inventario de SILSANPLEX.';

commit;
