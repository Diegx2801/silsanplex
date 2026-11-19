begin;

-- These reads are designed for authenticated users and enforce tenant access
-- internally. Keep the service role out of their EXECUTE boundary as well.
revoke all on function
  public.list_distribution_delivery_status_history(uuid, uuid),
  public.list_distribution_inventory_movements(uuid, uuid, uuid),
  public.list_distribution_delivery_inventory_trace(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.list_distribution_delivery_status_history(uuid, uuid),
  public.list_distribution_inventory_movements(uuid, uuid, uuid),
  public.list_distribution_delivery_inventory_trace(uuid, uuid)
to authenticated;

commit;
