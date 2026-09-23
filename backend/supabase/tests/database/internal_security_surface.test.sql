select plan(9);

select ok(
  (
    select count(*) = 12
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and coalesce((
        select count(*)
        from pg_policy policy
        where policy.polrelid = c.oid
      ), 0) = 0
      and c.relname = any (array[
        'distribution_command_operations',
        'legacy_model_migration_trace',
        'order_service_completion_operations',
        'organization_user_permissions',
        'permission_dependencies',
        'permissions',
        'product_import_batches',
        'repair_command_operations',
        'role_permissions',
        'ruc_lookup_cache',
        'ruc_lookup_rate_limits',
        'warehouse_master_operations'
      ]::name[])
  ),
  'las superficies internas conservan RLS sin politicas directas'
);

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname = any (array[
        'distribution_command_operations',
        'legacy_model_migration_trace',
        'order_service_completion_operations',
        'organization_user_permissions',
        'permission_dependencies',
        'permissions',
        'product_import_batches',
        'repair_command_operations',
        'role_permissions',
        'ruc_lookup_cache',
        'ruc_lookup_rate_limits',
        'warehouse_master_operations'
      ]::name[])
      and has_table_privilege('anon', 'public.' || c.relname, 'SELECT')
  ),
  0::bigint,
  'anon no puede consultar superficies internas'
);

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname = any (array[
        'distribution_command_operations',
        'legacy_model_migration_trace',
        'order_service_completion_operations',
        'organization_user_permissions',
        'permission_dependencies',
        'permissions',
        'product_import_batches',
        'repair_command_operations',
        'role_permissions',
        'ruc_lookup_cache',
        'ruc_lookup_rate_limits',
        'warehouse_master_operations'
      ]::name[])
      and has_table_privilege('authenticated', 'public.' || c.relname, 'SELECT')
  ),
  0::bigint,
  'authenticated no puede consultar superficies internas'
);

select is(has_function_privilege('anon', 'public.audit_warehouse_master_change()', 'EXECUTE'), false, 'anon no ejecuta el trigger de auditoria de almacenes');
select is(has_function_privilege('authenticated', 'public.audit_warehouse_master_change()', 'EXECUTE'), false, 'authenticated no ejecuta el trigger de auditoria de almacenes');
select is(has_function_privilege('anon', 'public.record_distribution_status_transition()', 'EXECUTE'), false, 'anon no ejecuta el trigger de estados de distribucion');
select is(has_function_privilege('authenticated', 'public.record_distribution_status_transition()', 'EXECUTE'), false, 'authenticated no ejecuta el trigger de estados de distribucion');
select is(has_function_privilege('anon', 'public.validate_distribution_delivery_transition()', 'EXECUTE'), false, 'anon no ejecuta el trigger de entregas');
select is(has_function_privilege('authenticated', 'public.validate_distribution_delivery_transition()', 'EXECUTE'), false, 'authenticated no ejecuta el trigger de entregas');
