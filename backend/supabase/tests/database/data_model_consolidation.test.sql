begin;

select plan(22);

select has_table('public', 'products', 'products es el catalogo canonico');
select has_table('public', 'warehouses', 'warehouses es el maestro canonico');
select has_table('public', 'warehouse_locations', 'warehouse_locations conserva ubicaciones');
select has_table('public', 'inventory_movements', 'inventory_movements es el libro canonico');
select has_table('public', 'legacy_model_migration_trace', 'existe la traza de convergencia');

select ok(to_regclass('public.productos') is null, 'se retiro productos');
select ok(to_regclass('public.almacenes') is null, 'se retiro almacenes');
select ok(to_regclass('public.ubicaciones') is null, 'se retiro ubicaciones');
select ok(to_regclass('public.lotes') is null, 'se retiro lotes alternos');
select ok(to_regclass('public.movimientos_inventario') is null, 'se retiro movimientos_inventario');

select has_table('public', 'marcas', 'marcas se conserva como maestro de catalogo');
select has_table('public', 'lineas', 'lineas se conserva como maestro de catalogo');
select has_table('public', 'sublineas', 'sublineas se conserva como maestro de catalogo');
select has_table('public', 'unidades_medida', 'unidades_medida se conserva como maestro de catalogo');

select has_column('public', 'legacy_model_migration_trace', 'legacy_id', 'la traza identifica el origen');
select has_column('public', 'legacy_model_migration_trace', 'canonical_id', 'la traza identifica el destino');
select has_column('public', 'legacy_model_migration_trace', 'source_snapshot', 'la traza conserva el snapshot original');

select is(
  has_table_privilege('anon', 'public.legacy_model_migration_trace', 'SELECT'),
  false,
  'anon no puede consultar la traza'
);
select is(
  has_table_privilege('authenticated', 'public.legacy_model_migration_trace', 'SELECT'),
  false,
  'authenticated no puede consultar la traza'
);
select is(
  has_table_privilege('service_role', 'public.legacy_model_migration_trace', 'SELECT'),
  false,
  'service_role no puede consultar la traza por Data API'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.legacy_model_migration_trace'::regclass
      and tgname = 'legacy_model_migration_trace_immutable'
      and not tgisinternal
  ),
  'la traza no admite update ni delete'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.inventory_movements'::regclass),
  'el libro canonico mantiene RLS'
);

select * from finish();
rollback;
