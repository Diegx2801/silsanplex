-- ============================================================
-- SILSANPLEX: retiro controlado del modelo logistico legacy
-- Requiere que 20260825000000 haya completado el backfill.
-- No elimina lotes ni modifica seguridad canonica.
-- ============================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- El bloqueo se adquiere antes de las comprobaciones para que el estado
-- validado sea el mismo que se elimina.
lock table
  public.productos,
  public.almacenes,
  public.ubicaciones,
  public.movimientos_inventario,
  public.lotes,
  public.products,
  public.warehouses,
  public.warehouse_locations,
  public.inventory_movements
in access exclusive mode;

do $$
declare
  required_table text;
  required_view text;
  required_function text;
  required_policy text;
  required_trigger text;
  canonical_table text;
  trigger_table text;
  missing_tables text[] := array[]::text[];
  missing_views text[] := array[]::text[];
  missing_functions text[] := array[]::text[];
  insecure_functions text[] := array[]::text[];
  missing_policies text[] := array[]::text[];
  missing_triggers text[] := array[]::text[];
  dependent_views text;
  dependent_functions text;
  changed_source_table text;
begin
  foreach required_table in array array[
    'public.productos',
    'public.almacenes',
    'public.ubicaciones',
    'public.movimientos_inventario',
    'public.lotes',
    'public.products',
    'public.suppliers',
    'public.customers',
    'public.customer_addresses',
    'public.customer_contacts',
    'public.warehouses',
    'public.warehouse_locations',
    'public.inventory_movements',
    'public.purchase_orders',
    'public.purchase_order_items',
    'public.product_files',
    'public.product_versions',
    'public.legacy_model_migration_trace'
  ]
  loop
    if to_regclass(required_table) is null then
      missing_tables := array_append(missing_tables, required_table);
    end if;
  end loop;

  if cardinality(missing_tables) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_REQUIRED_TABLE_MISSING',
      detail = array_to_string(missing_tables, ', ');
  end if;

  foreach required_view in array array[
    'public.product_catalog_options',
    'public.inventory_balances',
    'public.inventory_alerts',
    'public.inventory_kardex'
  ]
  loop
    if not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where relation.oid = to_regclass(required_view)
        and namespace.nspname = 'public'
        and relation.relkind = 'v'
    ) then
      missing_views := array_append(missing_views, required_view);
    end if;
  end loop;

  if cardinality(missing_views) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_REQUIRED_VIEW_MISSING',
      detail = array_to_string(missing_views, ', ');
  end if;

  -- Una vista que aun dependa del modelo retirado debe detener el proceso con
  -- un mensaje explicito, antes de que DROP TABLE encuentre la dependencia.
  select string_agg(
    distinct format('%I.%I', view_schema.nspname, view_relation.relname),
    ', '
  )
  into dependent_views
  from pg_depend dependency
  join pg_rewrite rewrite_rule on rewrite_rule.oid = dependency.objid
  join pg_class view_relation on view_relation.oid = rewrite_rule.ev_class
  join pg_namespace view_schema on view_schema.oid = view_relation.relnamespace
  where view_relation.relkind in ('v', 'm')
    and dependency.classid = 'pg_rewrite'::regclass
    and dependency.refclassid = 'pg_class'::regclass
    and dependency.refobjid in (
      'public.productos'::regclass,
      'public.almacenes'::regclass,
      'public.ubicaciones'::regclass,
      'public.movimientos_inventario'::regclass
    );

  if dependent_views is not null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_VIEW_DEPENDENCY_FOUND',
      detail = dependent_views;
  end if;

  foreach required_function in array array[
    'public.save_customer(jsonb)',
    'public.set_customer_status(uuid,boolean)',
    'public.import_customers(jsonb)',
    'public.save_purchase_order(jsonb)',
    'public.issue_purchase_order(uuid,uuid)',
    'public.receive_purchase_order(uuid,uuid)',
    'public.cancel_purchase_order(uuid,uuid)',
    'public.record_inventory_movement(jsonb)',
    'public.transfer_inventory(jsonb)',
    'public.reclassify_inventory(jsonb)'
  ]
  loop
    if to_regprocedure(required_function) is null then
      missing_functions := array_append(missing_functions, required_function);
    end if;
  end loop;

  if cardinality(missing_functions) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_REQUIRED_RPC_MISSING',
      detail = array_to_string(missing_functions, ', ');
  end if;

  foreach required_function in array array[
    'public.save_customer(jsonb)',
    'public.set_customer_status(uuid,boolean)',
    'public.import_customers(jsonb)',
    'public.save_purchase_order(jsonb)',
    'public.issue_purchase_order(uuid,uuid)',
    'public.receive_purchase_order(uuid,uuid)',
    'public.cancel_purchase_order(uuid,uuid)',
    'public.record_inventory_movement(jsonb)',
    'public.transfer_inventory(jsonb)',
    'public.reclassify_inventory(jsonb)'
  ]
  loop
    if not (
      select routine.prosecdef
      from pg_proc routine
      where routine.oid = to_regprocedure(required_function)
    ) or not has_function_privilege('authenticated', required_function, 'EXECUTE') then
      insecure_functions := array_append(insecure_functions, required_function);
    end if;
  end loop;

  if cardinality(insecure_functions) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_RPC_SECURITY_CHANGED',
      detail = array_to_string(insecure_functions, ', ');
  end if;

  -- Las dependencias de funciones PL/pgSQL no siempre quedan registradas en
  -- pg_depend. Revisar el cuerpo evita dejar RPC o triggers con referencias
  -- rotas despues del retiro.
  select string_agg(
    format(
      '%I.%I(%s)',
      namespace.nspname,
      routine.proname,
      pg_get_function_identity_arguments(routine.oid)
    ),
    ', '
  )
  into dependent_functions
  from pg_proc routine
  join pg_namespace namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
    and routine.prokind in ('f', 'p')
    and pg_get_functiondef(routine.oid) ~* '(from|join|update|into|table|references)[[:space:]]+(public[.])?(productos|almacenes|ubicaciones|movimientos_inventario)([^a-z0-9_]|$)';

  if dependent_functions is not null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_FUNCTION_DEPENDENCY_FOUND',
      detail = dependent_functions;
  end if;

  -- Las policies existentes se comprueban, no se reemplazan ni se recrean.
  foreach required_policy in array array[
    'products:products_select_authorized',
    'products:products_insert_authorized',
    'products:products_update_authorized',
    'suppliers:suppliers_select_authorized_organization',
    'suppliers:suppliers_insert_authorized_organization',
    'suppliers:suppliers_update_authorized_organization',
    'customers:customers_select_authorized',
    'customer_addresses:customer_addresses_select_authorized',
    'customer_contacts:customer_contacts_select_authorized',
    'warehouses:warehouses_select_authorized',
    'warehouses:warehouses_insert_authorized',
    'warehouses:warehouses_update_authorized',
    'warehouse_locations:warehouse_locations_select_authorized',
    'warehouse_locations:warehouse_locations_insert_authorized',
    'warehouse_locations:warehouse_locations_update_authorized',
    'inventory_movements:inventory_movements_select_authorized',
    'purchase_orders:purchase_orders_select_authorized',
    'purchase_order_items:purchase_order_items_select_authorized',
    'product_files:product_files_select_authorized',
    'product_files:product_files_insert_authorized',
    'product_files:product_files_update_authorized',
    'product_versions:product_versions_select_authorized',
    'lotes:lotes_select_member',
    'lotes:lotes_insert_member',
    'lotes:lotes_update_member'
  ]
  loop
    canonical_table := split_part(required_policy, ':', 1);
    if not exists (
      select 1
      from pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = canonical_table
        and policy.policyname = split_part(required_policy, ':', 2)
    ) then
      missing_policies := array_append(missing_policies, required_policy);
    end if;
  end loop;

  if cardinality(missing_policies) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_CANONICAL_POLICY_MISSING',
      detail = array_to_string(missing_policies, ', ');
  end if;

  foreach required_trigger in array array[
    'products:products_set_updated_at',
    'products:products_protect_immutable_fields',
    'products:products_audit_change',
    'products:products_record_version',
    'suppliers:suppliers_set_updated_at',
    'suppliers:suppliers_protect_immutable_fields',
    'suppliers:suppliers_audit_change',
    'customers:customers_set_updated_at',
    'customers:customers_protect_fiscal_identity',
    'customer_addresses:customer_addresses_set_updated_at',
    'customer_contacts:customer_contacts_set_updated_at',
    'warehouses:warehouses_set_updated_at',
    'warehouses:warehouses_protect_immutable_fields',
    'warehouses:warehouses_audit_change',
    'warehouse_locations:warehouse_locations_set_updated_at',
    'warehouse_locations:warehouse_locations_protect_immutable_fields',
    'warehouse_locations:warehouse_locations_audit_change',
    'inventory_movements:inventory_movements_immutable',
    'inventory_movements:inventory_movements_validate_product_tracking',
    'inventory_movements:inventory_movements_enforce_product_maximum_stock',
    'purchase_orders:purchase_orders_set_updated_at',
    'purchase_order_items:purchase_order_items_recalculate_totals',
    'purchase_order_items:purchase_order_items_validate_expiration',
    'product_files:product_files_protect_fields',
    'product_files:product_files_record_version',
    'product_versions:product_versions_immutable',
    'lotes:lotes_set_updated_at',
    'lotes:lotes_audit_event'
  ]
  loop
    trigger_table := split_part(required_trigger, ':', 1);
    if not exists (
      select 1
      from pg_trigger trigger_row
      join pg_class relation on relation.oid = trigger_row.tgrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = trigger_table
        and trigger_row.tgname = split_part(required_trigger, ':', 2)
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled <> 'D'
    ) then
      missing_triggers := array_append(missing_triggers, required_trigger);
    end if;
  end loop;

  if cardinality(missing_triggers) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_CANONICAL_TRIGGER_MISSING',
      detail = array_to_string(missing_triggers, ', ');
  end if;

  foreach canonical_table in array array[
    'products',
    'suppliers',
    'customers',
    'customer_addresses',
    'customer_contacts',
    'warehouses',
    'warehouse_locations',
    'inventory_movements',
    'purchase_orders',
    'purchase_order_items',
    'product_files',
    'product_versions',
    'lotes'
  ]
  loop
    if not (
      select relrowsecurity
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = canonical_table
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'LEGACY_RETIREMENT_CANONICAL_RLS_DISABLED',
        detail = canonical_table;
    end if;

    if not exists (
      select 1
      from pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = canonical_table
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'LEGACY_RETIREMENT_CANONICAL_POLICIES_MISSING',
        detail = canonical_table;
    end if;

  end loop;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.lotes'::regclass
      and constraint_row.confrelid = 'public.products'::regclass
      and constraint_row.contype = 'f'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_LOTS_NOT_LINKED_TO_CANONICAL_PRODUCTS';
  end if;

  if exists (
    select 1
    from public.lotes lot
    where not exists (
      select 1
      from public.products product
      where product.organization_id = lot.organization_id
        and product.id = lot.producto_id
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_ORPHAN_LOTS';
  end if;

  -- La traza debe cubrir cada registro de las tablas que se retiran y de
  -- lotes, que permanece disponible para consulta durante esta fase.
  if exists (
    select 1
    from (values
      ('productos'::text, (select count(*) from public.productos)),
      ('almacenes'::text, (select count(*) from public.almacenes)),
      ('ubicaciones'::text, (select count(*) from public.ubicaciones)),
      ('movimientos_inventario'::text, (select count(*) from public.movimientos_inventario)),
      ('lotes'::text, (select count(*) from public.lotes))
    ) expected(legacy_table, row_count)
    where expected.row_count <> (
      select count(*)
      from public.legacy_model_migration_trace trace
      where trace.legacy_table = expected.legacy_table
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_TRACE_MISMATCH';
  end if;

  -- El backfill y el retiro son migraciones separadas. Si una fila legacy
  -- cambio entre ambas, la operacion se detiene aunque el conteo coincida.
  if exists (
    select 1
    from public.productos source
    left join public.legacy_model_migration_trace trace
      on trace.legacy_table = 'productos'
     and trace.legacy_id = source.id
    where trace.legacy_id is null
      or to_jsonb(source) is distinct from trace.source_snapshot
  ) then
    changed_source_table := 'productos';
  elsif exists (
    select 1
    from public.almacenes source
    left join public.legacy_model_migration_trace trace
      on trace.legacy_table = 'almacenes'
     and trace.legacy_id = source.id
    where trace.legacy_id is null
      or to_jsonb(source) is distinct from trace.source_snapshot
  ) then
    changed_source_table := 'almacenes';
  elsif exists (
    select 1
    from public.ubicaciones source
    left join public.legacy_model_migration_trace trace
      on trace.legacy_table = 'ubicaciones'
     and trace.legacy_id = source.id
    where trace.legacy_id is null
      or to_jsonb(source) is distinct from trace.source_snapshot
  ) then
    changed_source_table := 'ubicaciones';
  elsif exists (
    select 1
    from public.movimientos_inventario source
    left join public.legacy_model_migration_trace trace
      on trace.legacy_table = 'movimientos_inventario'
     and trace.legacy_id = source.id
    where trace.legacy_id is null
      or to_jsonb(source) is distinct from trace.source_snapshot
  ) then
    changed_source_table := 'movimientos_inventario';
  elsif exists (
    select 1
    from public.lotes source
    left join public.legacy_model_migration_trace trace
      on trace.legacy_table = 'lotes'
     and trace.legacy_id = source.id
    where trace.legacy_id is null
      or to_jsonb(source) - 'producto_id' - 'updated_at'
        is distinct from trace.source_snapshot - 'producto_id' - 'updated_at'
  ) then
    changed_source_table := 'lotes';
  end if;

  if changed_source_table is not null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_SOURCE_CHANGED',
      detail = changed_source_table;
  end if;

  if exists (
    select 1
    from public.lotes lot
    join public.legacy_model_migration_trace trace
      on trace.legacy_table = 'lotes'
     and trace.legacy_id = lot.id
    where trace.canonical_key ->> 'product_id' is distinct from lot.producto_id::text
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_LOT_PRODUCT_CHANGED';
  end if;

  -- No se permite que un objeto externo mantenga una FK hacia una tabla que
  -- se va a retirar. Las FKs internas desapareceran con la tabla propietaria.
  if exists (
    select 1
    from pg_constraint constraint_row
    join pg_class child on child.oid = constraint_row.conrelid
    join pg_namespace child_schema on child_schema.oid = child.relnamespace
    where constraint_row.contype = 'f'
      and constraint_row.confrelid in (
        'public.productos'::regclass,
        'public.almacenes'::regclass,
        'public.ubicaciones'::regclass,
        'public.movimientos_inventario'::regclass
      )
      and not (
        child_schema.nspname = 'public'
        and child.relname in ('productos', 'almacenes', 'ubicaciones', 'movimientos_inventario')
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_EXTERNAL_FK_FOUND';
  end if;
end;
$$;

-- Orden hijo-padre. No usar CASCADE: una dependencia inesperada debe abortar.
drop table public.movimientos_inventario;
drop table public.ubicaciones;
drop table public.almacenes;
drop table public.productos;

do $$
begin
  if to_regclass('public.movimientos_inventario') is not null
    or to_regclass('public.ubicaciones') is not null
    or to_regclass('public.almacenes') is not null
    or to_regclass('public.productos') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_TABLES_STILL_PRESENT';
  end if;

  if to_regclass('public.lotes') is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_RETIREMENT_LOTS_WAS_REMOVED';
  end if;
end;
$$;

commit;
