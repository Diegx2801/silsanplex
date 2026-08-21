-- ============================================================
-- SILSANPLEX: base logística empresarial
-- Commit 1: tablas, relaciones, restricciones e índices
-- ============================================================

-- ------------------------------------------------------------
-- 1. Mantenedores base
-- ------------------------------------------------------------

create table public.marcas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  nombre varchar not null,
  descripcion text,
  estado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,

  constraint marcas_nombre_not_blank
    check (char_length(btrim(nombre)) between 1 and 150),
  constraint marcas_organization_id_id_key
    unique (organization_id, id)
);

create table public.lineas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  nombre varchar not null,
  estado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lineas_nombre_not_blank
    check (char_length(btrim(nombre)) between 1 and 150),
  constraint lineas_organization_id_id_key
    unique (organization_id, id)
);

create table public.sublineas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  linea_id uuid not null,
  nombre varchar not null,
  estado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sublineas_nombre_not_blank
    check (char_length(btrim(nombre)) between 1 and 150),
  constraint sublineas_organization_id_id_key
    unique (organization_id, id),
  constraint sublineas_organization_id_id_linea_id_key
    unique (organization_id, id, linea_id),
  constraint sublineas_linea_fk
    foreign key (organization_id, linea_id)
    references public.lineas(organization_id, id)
    on delete restrict
);

create table public.unidades_medida (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  nombre varchar not null,
  abreviatura varchar not null,
  estado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unidades_medida_nombre_not_blank
    check (char_length(btrim(nombre)) between 1 and 100),
  constraint unidades_medida_abreviatura_not_blank
    check (char_length(btrim(abreviatura)) between 1 and 20),
  constraint unidades_medida_organization_id_id_key
    unique (organization_id, id)
);

-- ------------------------------------------------------------
-- 2. Productos
-- ------------------------------------------------------------

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  codigo_interno varchar not null,
  codigo_barras varchar,
  descripcion varchar not null,
  presentacion varchar,
  registro_sanitario varchar,
  control_lote boolean not null default true,
  marca_id uuid,
  linea_id uuid,
  sublinea_id uuid,
  unidad_medida_id uuid,
  costo numeric,
  precio_venta numeric,
  stock_minimo numeric,
  stock_maximo numeric,
  estado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,

  constraint productos_codigo_interno_not_blank
    check (char_length(btrim(codigo_interno)) between 1 and 30),
  constraint productos_codigo_barras_not_blank
    check (codigo_barras is null or char_length(btrim(codigo_barras)) > 0),
  constraint productos_descripcion_not_blank
    check (char_length(btrim(descripcion)) between 2 and 160),
  constraint productos_presentacion_not_blank
    check (presentacion is null or char_length(btrim(presentacion)) > 0),
  constraint productos_registro_sanitario_not_blank
    check (
      registro_sanitario is null
      or char_length(btrim(registro_sanitario)) > 0
    ),
  constraint productos_costo_no_negativo
    check (costo is null or costo >= 0),
  constraint productos_precio_venta_no_negativo
    check (precio_venta is null or precio_venta >= 0),
  constraint productos_stock_minimo_no_negativo
    check (stock_minimo is null or stock_minimo >= 0),
  constraint productos_stock_maximo_no_negativo
    check (stock_maximo is null or stock_maximo >= 0),
  constraint productos_sublinea_requires_linea
    check (sublinea_id is null or linea_id is not null),
  constraint productos_organization_id_id_key
    unique (organization_id, id),

  constraint productos_marca_fk
    foreign key (organization_id, marca_id)
    references public.marcas(organization_id, id)
    on delete restrict,
  constraint productos_linea_fk
    foreign key (organization_id, linea_id)
    references public.lineas(organization_id, id)
    on delete restrict,
  constraint productos_sublinea_fk
    foreign key (organization_id, sublinea_id, linea_id)
    references public.sublineas(organization_id, id, linea_id)
    on delete restrict,
  constraint productos_unidad_medida_fk
    foreign key (organization_id, unidad_medida_id)
    references public.unidades_medida(organization_id, id)
    on delete restrict
);

-- ------------------------------------------------------------
-- 3. Almacenes y ubicaciones
-- ------------------------------------------------------------

create table public.almacenes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  nombre varchar not null,
  descripcion text,
  direccion text,
  estado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint almacenes_nombre_not_blank
    check (char_length(btrim(nombre)) between 1 and 150),
  constraint almacenes_organization_id_id_key
    unique (organization_id, id)
);

-- organization_id se conserva también en ubicaciones para que RLS y las
-- relaciones tenant-safe no dependan de joins implícitos.
create table public.ubicaciones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  almacen_id uuid not null,
  nombre varchar not null,
  descripcion text,
  estado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ubicaciones_nombre_not_blank
    check (char_length(btrim(nombre)) between 1 and 150),
  constraint ubicaciones_organization_id_id_key
    unique (organization_id, id),
  constraint ubicaciones_organization_id_id_almacen_id_key
    unique (organization_id, id, almacen_id),
  constraint ubicaciones_almacen_fk
    foreign key (organization_id, almacen_id)
    references public.almacenes(organization_id, id)
    on delete restrict
);

-- ------------------------------------------------------------
-- 4. Lotes
-- ------------------------------------------------------------

create table public.lotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  producto_id uuid not null,
  numero_lote varchar not null,
  fecha_fabricacion date,
  fecha_vencimiento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lotes_numero_not_blank
    check (char_length(btrim(numero_lote)) between 1 and 100),
  constraint lotes_fechas_coherentes
    check (
      fecha_fabricacion is null
      or fecha_vencimiento is null
      or fecha_fabricacion <= fecha_vencimiento
    ),
  constraint lotes_organization_id_id_key
    unique (organization_id, id),
  constraint lotes_organization_id_id_producto_id_key
    unique (organization_id, id, producto_id),
  constraint lotes_producto_fk
    foreign key (organization_id, producto_id)
    references public.productos(organization_id, id)
    on delete restrict
);

-- ------------------------------------------------------------
-- 5. Movimientos de inventario
-- ------------------------------------------------------------

create table public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  producto_id uuid not null,
  almacen_id uuid not null,
  ubicacion_id uuid,
  lote_id uuid,
  tipo_movimiento varchar not null,
  cantidad numeric not null,
  saldo_anterior numeric not null,
  saldo_nuevo numeric not null,
  documento_tipo varchar,
  documento_id uuid,
  usuario_id uuid not null
    references auth.users(id) on delete restrict,
  fecha_movimiento timestamptz not null default now(),
  observacion text,
  created_at timestamptz not null default now(),

  constraint movimientos_tipo_check
    check (
      tipo_movimiento in (
        'PURCHASE_IN',
        'SALE_OUT',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT',
        'RETURN_IN',
        'RETURN_OUT'
      )
    ),
  constraint movimientos_cantidad_positiva
    check (cantidad > 0),
  constraint movimientos_documento_tipo_not_blank
    check (documento_tipo is null or char_length(btrim(documento_tipo)) > 0),
  constraint movimientos_producto_fk
    foreign key (organization_id, producto_id)
    references public.productos(organization_id, id)
    on delete restrict,
  constraint movimientos_almacen_fk
    foreign key (organization_id, almacen_id)
    references public.almacenes(organization_id, id)
    on delete restrict,
  constraint movimientos_ubicacion_fk
    foreign key (organization_id, ubicacion_id, almacen_id)
    references public.ubicaciones(organization_id, id, almacen_id)
    on delete restrict,
  constraint movimientos_lote_fk
    foreign key (organization_id, lote_id, producto_id)
    references public.lotes(organization_id, id, producto_id)
    on delete restrict
);

-- ------------------------------------------------------------
-- 6. Unicidad e índices de consulta
-- ------------------------------------------------------------

create unique index marcas_organization_nombre_uidx
  on public.marcas (organization_id, lower(btrim(nombre)));

create index marcas_organization_estado_idx
  on public.marcas (organization_id, estado);

create unique index lineas_organization_nombre_uidx
  on public.lineas (organization_id, lower(btrim(nombre)));

create index lineas_organization_estado_idx
  on public.lineas (organization_id, estado);

create unique index sublineas_organization_nombre_uidx
  on public.sublineas (organization_id, lower(btrim(nombre)));

create index sublineas_organization_linea_idx
  on public.sublineas (organization_id, linea_id);

create index sublineas_organization_estado_idx
  on public.sublineas (organization_id, estado);

create unique index unidades_medida_organization_nombre_uidx
  on public.unidades_medida (organization_id, lower(btrim(nombre)));

create unique index unidades_medida_organization_abreviatura_uidx
  on public.unidades_medida (organization_id, lower(btrim(abreviatura)));

create index unidades_medida_organization_estado_idx
  on public.unidades_medida (organization_id, estado);

create unique index productos_organization_codigo_interno_uidx
  on public.productos (organization_id, lower(btrim(codigo_interno)));

create unique index productos_organization_codigo_barras_uidx
  on public.productos (organization_id, lower(btrim(codigo_barras)))
  where codigo_barras is not null;

create index productos_organization_estado_idx
  on public.productos (organization_id, estado);

create index productos_organization_linea_idx
  on public.productos (organization_id, linea_id);

create index productos_organization_marca_idx
  on public.productos (organization_id, marca_id);

create index productos_organization_sublinea_idx
  on public.productos (organization_id, sublinea_id);

create unique index almacenes_organization_nombre_uidx
  on public.almacenes (organization_id, lower(btrim(nombre)));

create index almacenes_organization_estado_idx
  on public.almacenes (organization_id, estado);

create unique index ubicaciones_organization_almacen_nombre_uidx
  on public.ubicaciones (organization_id, almacen_id, lower(btrim(nombre)));

create index ubicaciones_organization_almacen_estado_idx
  on public.ubicaciones (organization_id, almacen_id, estado);

create unique index lotes_organization_producto_numero_uidx
  on public.lotes (organization_id, producto_id, lower(btrim(numero_lote)));

create index lotes_organization_vencimiento_idx
  on public.lotes (organization_id, fecha_vencimiento);

create index movimientos_organization_fecha_idx
  on public.movimientos_inventario (organization_id, fecha_movimiento desc);

create index movimientos_organization_producto_fecha_idx
  on public.movimientos_inventario (
    organization_id,
    producto_id,
    fecha_movimiento desc
  );

create index movimientos_organization_almacen_fecha_idx
  on public.movimientos_inventario (
    organization_id,
    almacen_id,
    fecha_movimiento desc
  );

create index movimientos_organization_lote_fecha_idx
  on public.movimientos_inventario (
    organization_id,
    lote_id,
    fecha_movimiento desc
  );

create index movimientos_organization_documento_idx
  on public.movimientos_inventario (
    organization_id,
    documento_tipo,
    documento_id
  );

-- ------------------------------------------------------------
-- 7. Timestamps automáticos
-- ------------------------------------------------------------

create trigger marcas_set_updated_at
before update on public.marcas
for each row
execute function public.set_updated_at();

create trigger lineas_set_updated_at
before update on public.lineas
for each row
execute function public.set_updated_at();

create trigger sublineas_set_updated_at
before update on public.sublineas
for each row
execute function public.set_updated_at();

create trigger unidades_medida_set_updated_at
before update on public.unidades_medida
for each row
execute function public.set_updated_at();

create trigger productos_set_updated_at
before update on public.productos
for each row
execute function public.set_updated_at();

create trigger almacenes_set_updated_at
before update on public.almacenes
for each row
execute function public.set_updated_at();

create trigger ubicaciones_set_updated_at
before update on public.ubicaciones
for each row
execute function public.set_updated_at();

create trigger lotes_set_updated_at
before update on public.lotes
for each row
execute function public.set_updated_at();

comment on table public.marcas is
  'Mantenedor de marcas aislado por organización.';

comment on table public.lineas is
  'Mantenedor de líneas de producto aislado por organización.';

comment on table public.sublineas is
  'Mantenedor de sublíneas vinculadas a una línea de la misma organización.';

comment on table public.unidades_medida is
  'Mantenedor de unidades de medida aislado por organización.';

comment on table public.productos is
  'Catálogo empresarial; no contiene saldo ni vencimientos de inventario.';

comment on table public.almacenes is
  'Mantenedor de almacenes aislado por organización.';

comment on table public.ubicaciones is
  'Ubicaciones internas de un almacén; conserva organization_id para RLS tenant-safe.';

comment on table public.lotes is
  'Lotes de producto con trazabilidad y fechas opcionales.';

comment on table public.movimientos_inventario is
  'Registro append-only preparado para construir el kardex.';

comment on column public.movimientos_inventario.saldo_anterior is
  'Saldo informado por la operación que registra el movimiento; su cálculo atómico queda para una migración posterior.';

comment on column public.movimientos_inventario.saldo_nuevo is
  'Saldo informado por la operación que registra el movimiento; no se impone todavía una política de stock negativo.';
