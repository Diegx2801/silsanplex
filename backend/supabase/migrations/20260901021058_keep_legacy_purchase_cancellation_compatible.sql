create or replace function public.cancel_purchase_order(
  requested_organization_id uuid,
  requested_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.close_purchase_order(jsonb_build_object(
    'organization_id', requested_organization_id,
    'purchase_order_id', requested_order_id,
    'reason', 'Anulacion mediante flujo heredado'
  ));
end;
$$;

revoke all on function public.cancel_purchase_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_purchase_order(uuid, uuid) to authenticated;
