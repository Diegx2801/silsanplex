-- Keep trigger-only SECURITY DEFINER functions out of the PostgREST callable surface.
-- Trigger execution is independent from EXECUTE privileges on the function.
revoke execute on function public.audit_warehouse_master_change() from public, anon, authenticated;
revoke execute on function public.record_distribution_status_transition() from public, anon, authenticated;
revoke execute on function public.validate_distribution_delivery_transition() from public, anon, authenticated;

-- These tables are internal operation/audit surfaces. Their RLS remains enabled and
-- direct client privileges stay revoked; service_role-owned server code is unchanged.
revoke all on table
  public.distribution_command_operations,
  public.legacy_model_migration_trace,
  public.order_service_completion_operations,
  public.organization_user_permissions,
  public.permission_dependencies,
  public.permissions,
  public.product_import_batches,
  public.repair_command_operations,
  public.role_permissions,
  public.ruc_lookup_cache,
  public.ruc_lookup_rate_limits,
  public.warehouse_master_operations
from public, anon, authenticated;
