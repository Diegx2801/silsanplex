-- El limite comercial de stock maximo conserva su bloqueo por producto, pero
-- deja de reconstruir el saldo desde el ledger y usa el resumen autoritativo.
create or replace function public.enforce_product_maximum_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  configured_maximum numeric;
  current_stock numeric;
begin
  if new.movement_type not in ('entrada', 'ajuste-positivo') then
    return new;
  end if;
  select product.maximum_stock into configured_maximum
  from public.products product
  where product.id = new.product_id and product.organization_id = new.organization_id;
  if configured_maximum is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'product-maximum-stock:' || new.organization_id::text || ':' || new.product_id::text,
      0
    )
  );
  select coalesce(sum(summary.physical_quantity), 0) into current_stock
  from public.inventory_stock_summary summary
  where summary.organization_id = new.organization_id
    and summary.product_id = new.product_id;

  if current_stock + new.quantity > configured_maximum then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_MAXIMUM_STOCK_EXCEEDED',
      detail = pg_catalog.format(
        'product_id=%s,current_stock=%s,incoming_quantity=%s,maximum_stock=%s',
        new.product_id, current_stock, new.quantity, configured_maximum
      );
  end if;
  return new;
end;
$$;
