begin;

select plan(50);

-- -------------------------------------------------------------------------
-- Estructura, RLS y privilegios
-- -------------------------------------------------------------------------

select has_table('public', 'marcas', 'existe marcas');
select has_table('public', 'lineas', 'existe lineas');
select has_table('public', 'sublineas', 'existe sublineas');
select has_table('public', 'unidades_medida', 'existe unidades_medida');
select has_table('public', 'productos', 'existe productos');
select has_table('public', 'almacenes', 'existe almacenes');
select has_table('public', 'ubicaciones', 'existe ubicaciones');
select has_table('public', 'lotes', 'existe lotes');
select has_table(
  'public',
  'movimientos_inventario',
  'existe movimientos_inventario'
);

select has_column(
  'public',
  'productos',
  'organization_id',
  'productos pertenece a una organización'
);

select has_column(
  'public',
  'movimientos_inventario',
  'usuario_id',
  'el movimiento conserva el usuario responsable'
);

select has_column(
  'public',
  'lotes',
  'fecha_vencimiento',
  'el lote conserva la fecha de vencimiento'
);

select has_column(
  'public',
  'productos',
  'registro_sanitario',
  'el producto conserva su registro sanitario'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.marcas'::regclass
  ),
  true,
  'marcas tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.lineas'::regclass
  ),
  true,
  'lineas tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.sublineas'::regclass
  ),
  true,
  'sublineas tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.unidades_medida'::regclass
  ),
  true,
  'unidades_medida tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.productos'::regclass
  ),
  true,
  'productos tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.almacenes'::regclass
  ),
  true,
  'almacenes tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.ubicaciones'::regclass
  ),
  true,
  'ubicaciones tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.lotes'::regclass
  ),
  true,
  'lotes tiene RLS'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.movimientos_inventario'::regclass
  ),
  true,
  'movimientos_inventario tiene RLS'
);

select is(
  has_table_privilege('authenticated', 'public.marcas', 'SELECT'),
  true,
  'authenticated puede consultar marcas'
);

select is(
  has_table_privilege('authenticated', 'public.marcas', 'INSERT'),
  true,
  'authenticated puede crear marcas'
);

select is(
  has_table_privilege('authenticated', 'public.marcas', 'DELETE'),
  false,
  'authenticated no elimina marcas físicamente'
);

select is(
  has_table_privilege(
    'authenticated',
    'public.movimientos_inventario',
    'UPDATE'
  ),
  false,
  'authenticated no actualiza movimientos'
);

select is(
  has_table_privilege(
    'authenticated',
    'public.movimientos_inventario',
    'DELETE'
  ),
  false,
  'authenticated no elimina movimientos'
);

select is(
  has_table_privilege('authenticated', 'public.audit_events', 'INSERT'),
  false,
  'authenticated no inserta auditoría directamente'
);

-- -------------------------------------------------------------------------
-- Datos de dos organizaciones y usuarios de prueba
-- -------------------------------------------------------------------------

insert into public.organizations (id, name, slug)
values
  (
    'f1111111-1111-4111-8111-111111111111',
    'Organización logística uno',
    'logistica-uno'
  ),
  (
    'f2222222-2222-4222-8222-222222222222',
    'Organización logística dos',
    'logistica-dos'
  );

insert into auth.users (
  id,
  email,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    'f3111111-1111-4111-8111-111111111111',
    'logistica.uno@test.local',
    '{"full_name":"Usuario logística uno"}'::jsonb,
    now(),
    now()
  ),
  (
    'f3222222-2222-4222-8222-222222222222',
    'logistica.dos@test.local',
    '{"full_name":"Usuario logística dos"}'::jsonb,
    now(),
    now()
  );

insert into public.organization_memberships (
  organization_id,
  user_id
)
values
  (
    'f1111111-1111-4111-8111-111111111111',
    'f3111111-1111-4111-8111-111111111111'
  ),
  (
    'f1111111-1111-4111-8111-111111111111',
    'f3222222-2222-4222-8222-222222222222'
  );

-- Este registro de la segunda organización permite comprobar que el usuario
-- autenticado no lo puede observar ni modificar.
insert into public.marcas (
  organization_id,
  nombre
)
values (
  'f2222222-2222-4222-8222-222222222222',
  'Marca organización dos'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f3111111-1111-4111-8111-111111111111',
  true
);

select is(
  (
    select count(*)
    from public.marcas
    where organization_id = 'f2222222-2222-4222-8222-222222222222'
  ),
  0::bigint,
  'RLS oculta registros de otra organización'
);

select lives_ok(
  $$
    insert into public.marcas (organization_id, nombre)
    values (
      'f1111111-1111-4111-8111-111111111111',
      'Marca organización uno'
    )
  $$,
  'un miembro puede crear una marca de su organización'
);

select is(
  (
    select created_by
    from public.marcas
    where organization_id = 'f1111111-1111-4111-8111-111111111111'
      and nombre = 'Marca organización uno'
  ),
  'f3111111-1111-4111-8111-111111111111'::uuid,
  'el trigger registra el creador autenticado de la marca'
);

select throws_ok(
  $$
    insert into public.marcas (organization_id, nombre)
    values (
      'f1111111-1111-4111-8111-111111111111',
      '  MARCA ORGANIZACIÓN UNO  '
    )
  $$,
  '23505',
  null,
  'los nombres de mantenedor son únicos sin distinguir mayúsculas ni espacios'
);

select throws_ok(
  $$
    insert into public.marcas (organization_id, nombre)
    values (
      'f2222222-2222-4222-8222-222222222222',
      'Marca no autorizada'
    )
  $$,
  '42501',
  null,
  'un miembro no puede crear registros en otra organización'
);

select lives_ok(
  $$
    insert into public.lineas (organization_id, nombre)
    values (
      'f1111111-1111-4111-8111-111111111111',
      'Línea prueba'
    )
  $$,
  'un miembro puede crear una línea'
);

select lives_ok(
  $$
    insert into public.sublineas (organization_id, linea_id, nombre)
    values (
      'f1111111-1111-4111-8111-111111111111',
      (
        select id
        from public.lineas
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and nombre = 'Línea prueba'
      ),
      'Sublinea prueba'
    )
  $$,
  'un miembro puede crear una sublínea de su línea'
);

select lives_ok(
  $$
    insert into public.unidades_medida (
      organization_id,
      nombre,
      abreviatura
    )
    values (
      'f1111111-1111-4111-8111-111111111111',
      'Unidad prueba',
      'UP'
    )
  $$,
  'un miembro puede crear una unidad de medida'
);

select lives_ok(
  $$
    insert into public.productos (
      organization_id,
      codigo_interno,
      descripcion,
      presentacion,
      registro_sanitario,
      control_lote,
      marca_id,
      linea_id,
      sublinea_id,
      unidad_medida_id,
      costo,
      precio_venta
    )
    values (
      'f1111111-1111-4111-8111-111111111111',
      'PROD-001',
      'Producto logístico de prueba',
      'Caja de prueba',
      'RS-TEST-001',
      true,
      (
        select id
        from public.marcas
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and nombre = 'Marca organización uno'
      ),
      (
        select id
        from public.lineas
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and nombre = 'Línea prueba'
      ),
      (
        select id
        from public.sublineas
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and nombre = 'Sublinea prueba'
      ),
      (
        select id
        from public.unidades_medida
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and nombre = 'Unidad prueba'
      ),
      10.00,
      15.00
    )
  $$,
  'un miembro puede crear un producto con referencias de su organización'
);

select is(
  (
    select created_by
    from public.productos
    where organization_id = 'f1111111-1111-4111-8111-111111111111'
      and codigo_interno = 'PROD-001'
  ),
  'f3111111-1111-4111-8111-111111111111'::uuid,
  'el trigger registra el creador autenticado del producto'
);

select throws_ok(
  $$
    insert into public.productos (
      organization_id,
      codigo_interno,
      descripcion
    )
    values (
      'f1111111-1111-4111-8111-111111111111',
      ' prod-001 ',
      'Producto duplicado'
    )
  $$,
  '23505',
  null,
  'el código interno es único por organización sin distinguir mayúsculas ni espacios'
);

select lives_ok(
  $$
    insert into public.almacenes (organization_id, nombre)
    values (
      'f1111111-1111-4111-8111-111111111111',
      'Almacén prueba'
    )
  $$,
  'un miembro puede crear un almacén'
);

select lives_ok(
  $$
    insert into public.ubicaciones (organization_id, almacen_id, nombre)
    values (
      'f1111111-1111-4111-8111-111111111111',
      (
        select id
        from public.almacenes
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and nombre = 'Almacén prueba'
      ),
      'Ubicación prueba'
    )
  $$,
  'un miembro puede crear una ubicación de su almacén'
);

select lives_ok(
  $$
    insert into public.lotes (
      organization_id,
      producto_id,
      numero_lote,
      fecha_fabricacion,
      fecha_vencimiento
    )
    values (
      'f1111111-1111-4111-8111-111111111111',
      (
        select id
        from public.productos
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and codigo_interno = 'PROD-001'
      ),
      'LOTE-001',
      date '2026-01-01',
      date '2027-01-01'
    )
  $$,
  'un miembro puede crear un lote de su producto'
);

select lives_ok(
  $$
    insert into public.movimientos_inventario (
      organization_id,
      producto_id,
      almacen_id,
      ubicacion_id,
      lote_id,
      tipo_movimiento,
      cantidad,
      saldo_anterior,
      saldo_nuevo,
      documento_tipo,
      usuario_id,
      observacion
    )
    values (
      'f1111111-1111-4111-8111-111111111111',
      (
        select id
        from public.productos
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and codigo_interno = 'PROD-001'
      ),
      (
        select id
        from public.almacenes
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and nombre = 'Almacén prueba'
      ),
      (
        select id
        from public.ubicaciones
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and nombre = 'Ubicación prueba'
      ),
      (
        select id
        from public.lotes
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and numero_lote = 'LOTE-001'
      ),
      'PURCHASE_IN',
      10,
      0,
      10,
      'TEST',
      'f3111111-1111-4111-8111-111111111111',
      'Movimiento de prueba'
    )
  $$,
  'un miembro puede crear un movimiento con su usuario responsable'
);

select is(
  (
    select count(*)
    from public.movimientos_inventario
    where organization_id = 'f1111111-1111-4111-8111-111111111111'
  ),
  1::bigint,
  'el miembro observa el movimiento de su organización'
);

select is(
  (
    select count(*)
    from public.movimientos_inventario
    where organization_id = 'f2222222-2222-4222-8222-222222222222'
  ),
  0::bigint,
  'el miembro no observa movimientos de otra organización'
);

select throws_ok(
  $$
    insert into public.movimientos_inventario (
      organization_id,
      producto_id,
      almacen_id,
      tipo_movimiento,
      cantidad,
      saldo_anterior,
      saldo_nuevo,
      usuario_id
    )
    values (
      'f1111111-1111-4111-8111-111111111111',
      (
        select id
        from public.productos
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and codigo_interno = 'PROD-001'
      ),
      (
        select id
        from public.almacenes
        where organization_id = 'f1111111-1111-4111-8111-111111111111'
          and nombre = 'Almacén prueba'
      ),
      'PURCHASE_IN',
      1,
      10,
      11,
      'f3222222-2222-4222-8222-222222222222'
    )
  $$,
  '42501',
  null,
  'el usuario responsable debe coincidir con auth.uid()'
);

select throws_ok(
  $$
    update public.movimientos_inventario
    set observacion = 'modificado'
    where organization_id = 'f1111111-1111-4111-8111-111111111111'
  $$,
  '42501',
  null,
  'un movimiento no puede actualizarse'
);

select throws_ok(
  $$
    delete from public.movimientos_inventario
    where organization_id = 'f1111111-1111-4111-8111-111111111111'
  $$,
  '42501',
  null,
  'un movimiento no puede eliminarse'
);

reset role;

select ok(
  (
    select count(*) >= 9
    from public.audit_events
    where organization_id = 'f1111111-1111-4111-8111-111111111111'
      and actor_user_id = 'f3111111-1111-4111-8111-111111111111'
      and action = 'LOGISTICS_CREATED'
  ),
  'las altas logísticas quedan registradas en audit_events'
);

select throws_ok(
  $$
    insert into public.productos (
      organization_id,
      codigo_interno,
      descripcion,
      marca_id
    )
    values (
      'f1111111-1111-4111-8111-111111111111',
      'PROD-CROSS-TENANT',
      'Producto con marca incorrecta',
      (
        select id
        from public.marcas
        where organization_id = 'f2222222-2222-4222-8222-222222222222'
          and nombre = 'Marca organización dos'
      )
    )
  $$,
  '23503',
  null,
  'una clave foránea compuesta impide referencias entre organizaciones'
);

select * from finish();

rollback;
