-- P1C: precio minimo final por unidad base para nuevas lineas de pedido.
--
-- El trigger concentra el enforcement para que las rutas actuales y futuras
-- que escriban unit_price no dependan de una validacion del cliente o de una
-- RPC concreta. No se ejecuta cuando solo cambia la cantidad de una linea.

begin;

create function public.order_item_final_unit_price(
  requested_unit_price numeric,
  requested_tax_affectation text,
  requested_prices_include_tax boolean
)
returns numeric
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when requested_tax_affectation = 'gravado'
      and not requested_prices_include_tax
      then requested_unit_price * 1.18::numeric
    else requested_unit_price
  end
$$;

create function public.enforce_order_item_minimum_sale_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_minimum_sale_price numeric;
  product_tax_affectation text;
  order_prices_include_tax boolean;
  comparable_final_unit_price numeric;
begin
  -- FOR SHARE impide que minimum_sale_price o tax_affectation cambien hasta
  -- que termine la escritura de la linea. Multiples pedidos pueden compartir
  -- el mismo producto sin bloquearse entre si.
  select product.minimum_sale_price, product.tax_affectation
    into product_minimum_sale_price, product_tax_affectation
  from public.products product
  where product.organization_id = new.organization_id
    and product.id = new.product_id
  for share;

  if not found then
    raise exception using errcode = '23503', message = 'ORDER_PRODUCT_INVALID';
  end if;

  if product_minimum_sale_price is null then
    return new;
  end if;

  select order_data.prices_include_tax
    into order_prices_include_tax
  from public.orders order_data
  where order_data.organization_id = new.organization_id
    and order_data.id = new.order_id;

  if not found then
    raise exception using errcode = '23503', message = 'ORDER_INVALID';
  end if;

  comparable_final_unit_price := public.order_item_final_unit_price(
    new.unit_price,
    product_tax_affectation,
    order_prices_include_tax
  );

  if comparable_final_unit_price < product_minimum_sale_price then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_MINIMUM_SALE_PRICE_VIOLATION';
  end if;

  return new;
end;
$$;

revoke all on function public.order_item_final_unit_price(numeric, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_order_item_minimum_sale_price()
  from public, anon, authenticated, service_role;

create trigger order_items_enforce_minimum_sale_price
before insert or update of organization_id, order_id, product_id, unit_price
on public.order_items
for each row execute function public.enforce_order_item_minimum_sale_price();

comment on function public.order_item_final_unit_price(numeric, text, boolean) is
  'Convierte un unit_price de pedido al precio final comparable en PEN, sin redondear la linea.';
comment on function public.enforce_order_item_minimum_sale_price() is
  'Impide nuevas escrituras de precios de pedido inferiores al minimo final vigente del producto.';
comment on column public.products.sale_price is
  'Precio final referencial por unidad base en PEN; incluye IGV cuando corresponde.';
comment on column public.products.minimum_sale_price is
  'Precio minimo final por unidad base en PEN; incluye IGV cuando corresponde. NULL significa sin minimo.';

commit;
