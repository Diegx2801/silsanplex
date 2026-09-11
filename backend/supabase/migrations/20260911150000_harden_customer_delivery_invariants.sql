-- Enforce delivery-address invariants at the transaction boundary.
-- The existing core RPC remains unchanged; this wrapper validates its final state
-- and rolls the whole operation back when the payload violates the domain rules.

alter function public.save_customer(jsonb) rename to save_customer_core;

revoke all on function public.save_customer_core(jsonb) from public, anon, authenticated;
grant execute on function public.save_customer_core(jsonb) to service_role;

create function public.save_customer(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_customer_id uuid;
  delivery_count integer;
  default_delivery_count integer;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  v_customer_id := public.save_customer_core(payload);
  v_organization_id := public.current_organization_for_permission('CUSTOMERS_MANAGE');

  select
    count(*) filter (where address.address_type = 'DELIVERY'),
    count(*) filter (where address.address_type = 'DELIVERY' and address.is_default)
  into delivery_count, default_delivery_count
  from public.customer_addresses address
  where address.organization_id = v_organization_id
    and address.customer_id = v_customer_id
    and address.address_type = 'DELIVERY'
    and address.is_active;

  if delivery_count > 20 then
    raise exception using
      errcode = '22023',
      message = 'CUSTOMER_DELIVERY_ADDRESS_LIMIT';
  end if;

  if delivery_count > 0 and default_delivery_count <> 1 then
    raise exception using
      errcode = '22023',
      message = 'CUSTOMER_DELIVERY_ADDRESS_PRIMARY_REQUIRED';
  end if;

  return v_customer_id;
end;
$$;

revoke all on function public.save_customer(jsonb) from public, anon;
grant execute on function public.save_customer(jsonb) to authenticated;

comment on function public.save_customer(jsonb) is
  'Guarda clientes y valida de forma transaccional el limite y la direccion principal de entregas.';
