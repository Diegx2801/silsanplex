-- Keep the delivery-address default invariant independent of payload order.
-- The transactional customer RPC may receive the new default before the old
-- one is cleared; this trigger makes that transition safe for every writer.

create or replace function public.ensure_single_default_delivery_address()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if upper(new.address_type) = 'DELIVERY' and new.is_default and new.is_active then
    update public.customer_addresses
    set is_default = false
    where organization_id = new.organization_id
      and customer_id = new.customer_id
      and id <> new.id
      and address_type = 'DELIVERY'
      and is_active
      and is_default;
  end if;

  return new;
end;
$$;

revoke all on function public.ensure_single_default_delivery_address() from public, anon, authenticated;
grant execute on function public.ensure_single_default_delivery_address() to service_role;

drop trigger if exists customer_addresses_single_default_delivery on public.customer_addresses;

create trigger customer_addresses_single_default_delivery
before insert or update of address_type, is_default, is_active
on public.customer_addresses
for each row
execute function public.ensure_single_default_delivery_address();
