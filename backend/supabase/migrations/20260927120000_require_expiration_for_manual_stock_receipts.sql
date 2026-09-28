-- Keep manual inbound movements consistent with product expiration control.
-- Purchase receipts and transfers have their own command validation; the trigger
-- protects the shared append-only ledger from incomplete manual entries.
create or replace function public.require_expiration_for_manual_stock_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_type = 'manual'
    and new.movement_type in ('entrada', 'ajuste-positivo')
    and new.expiration_date is null
    and exists (
      select 1
      from public.products product
      where product.organization_id = new.organization_id
        and product.id = new.product_id
        and product.expiration_control
    )
  then
    raise exception using errcode = 'P0001', message = 'INVENTORY_EXPIRATION_REQUIRED';
  end if;

  return new;
end;
$$;

alter function public.require_expiration_for_manual_stock_receipt() owner to postgres;
revoke all on function public.require_expiration_for_manual_stock_receipt()
  from public, anon, authenticated, service_role;

create trigger inventory_movements_require_controlled_expiration
before insert on public.inventory_movements
for each row execute function public.require_expiration_for_manual_stock_receipt();

comment on function public.require_expiration_for_manual_stock_receipt() is
  'Rejects manual inbound movements that omit expiry for products configured to control expiration.';
