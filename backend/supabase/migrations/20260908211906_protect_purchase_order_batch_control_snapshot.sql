-- B1: batch_control forma parte del snapshot historico de la linea de compra.
-- Se reutiliza el guard existente de producto/tipo para evitar otro trigger
-- BEFORE UPDATE sobre la misma tabla.

begin;

create or replace function public.snapshot_purchase_order_item_product_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select product.product_type
      into new.product_type
    from public.products product
    where product.organization_id = new.organization_id
      and product.id = new.product_id;
    if not found then
      raise exception using errcode = '23503', message = 'PURCHASE_ORDER_PRODUCT_INVALID';
    end if;
  else
    if new.product_id is distinct from old.product_id then
      raise exception using errcode = '55000', message = 'PURCHASE_ORDER_PRODUCT_IMMUTABLE';
    end if;
    if new.product_type is distinct from old.product_type then
      raise exception using errcode = '55000', message = 'PURCHASE_ORDER_PRODUCT_TYPE_IMMUTABLE';
    end if;
    if new.batch_control is distinct from old.batch_control then
      raise exception using errcode = '55000', message = 'PURCHASE_ORDER_BATCH_CONTROL_IMMUTABLE';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.snapshot_purchase_order_item_product_type()
  from public, anon, authenticated;

comment on column public.purchase_order_items.batch_control is
  'Snapshot inmutable de products.batch_control al crear la linea de compra.';

commit;
