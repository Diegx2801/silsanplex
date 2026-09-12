-- Enforce the product minimum sale price in repair quotes using immutable
-- quote and line snapshots. exchange_rate_to_pen means PEN per quoted unit.

begin;

alter table public.repair_quotes
  add column exchange_rate_to_pen numeric(18,8);

update public.repair_quotes
set exchange_rate_to_pen = 1
where currency = 'PEN';

alter table public.repair_quotes
  add constraint repair_quotes_exchange_rate_valid check (
    (currency = 'PEN' and exchange_rate_to_pen = 1)
    or (currency = 'USD' and (exchange_rate_to_pen is null or exchange_rate_to_pen > 0))
  );

alter table public.repair_quote_items
  add column minimum_sale_price_pen_snapshot numeric(14,2),
  add column comparable_unit_price_pen_snapshot numeric(24,8),
  add constraint repair_quote_items_minimum_snapshot_nonnegative check (
    minimum_sale_price_pen_snapshot is null or minimum_sale_price_pen_snapshot >= 0
  ),
  add constraint repair_quote_items_comparable_snapshot_nonnegative check (
    comparable_unit_price_pen_snapshot is null or comparable_unit_price_pen_snapshot >= 0
  );

create function public.normalize_repair_quote_exchange_rate(
  requested_currency text,
  requested_exchange_rate_to_pen numeric
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if requested_currency = 'PEN' then
    if requested_exchange_rate_to_pen is not null
      and requested_exchange_rate_to_pen <> 1
    then
      raise exception using
        errcode = 'P0001', message = 'REPAIR_QUOTE_EXCHANGE_RATE_INVALID';
    end if;
    return 1;
  end if;

  if requested_currency = 'USD' then
    if requested_exchange_rate_to_pen is null then
      raise exception using
        errcode = 'P0001', message = 'REPAIR_QUOTE_EXCHANGE_RATE_REQUIRED';
    end if;
    if requested_exchange_rate_to_pen <= 0 then
      raise exception using
        errcode = 'P0001', message = 'REPAIR_QUOTE_EXCHANGE_RATE_INVALID';
    end if;
    return requested_exchange_rate_to_pen;
  end if;

  raise exception using errcode = '22023', message = 'REPAIR_QUOTE_CURRENCY_INVALID';
end;
$$;

create function public.prepare_repair_quote_exchange_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_rate text;
begin
  configured_rate := nullif(
    current_setting('app.repair_quote_exchange_rate_to_pen', true), ''
  );
  new.exchange_rate_to_pen := public.normalize_repair_quote_exchange_rate(
    new.currency,
    coalesce(configured_rate::numeric, new.exchange_rate_to_pen)
  );
  return new;
end;
$$;

create trigger repair_quotes_prepare_exchange_rate
before insert or update of currency, exchange_rate_to_pen on public.repair_quotes
for each row execute function public.prepare_repair_quote_exchange_rate();

create or replace function public.validate_repair_quote_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_is_active boolean;
  product_minimum_sale_price numeric;
  quote_exchange_rate numeric;
  quote_prices_include_tax boolean;
  quote_tax_rate numeric;
  comparable_price numeric;
begin
  if new.line_type <> 'part' then
    new.minimum_sale_price_pen_snapshot := null;
    new.comparable_unit_price_pen_snapshot := null;
    return new;
  end if;

  select product.is_active, product.minimum_sale_price
    into product_is_active, product_minimum_sale_price
  from public.products product
  where product.organization_id = new.organization_id
    and product.id = new.product_id
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_PRODUCT_NOT_FOUND';
  end if;
  if not product_is_active then
    raise exception using errcode = 'P0001', message = 'REPAIR_QUOTE_PRODUCT_UNAVAILABLE';
  end if;

  select quote.exchange_rate_to_pen, quote.prices_include_tax, quote.tax_rate
    into quote_exchange_rate, quote_prices_include_tax, quote_tax_rate
  from public.repair_quotes quote
  where quote.organization_id = new.organization_id
    and quote.id = new.quote_id;

  if not found then
    raise exception using errcode = '23503', message = 'REPAIR_QUOTE_NOT_FOUND';
  end if;
  if quote_exchange_rate is null then
    raise exception using
      errcode = 'P0001', message = 'REPAIR_QUOTE_EXCHANGE_RATE_REQUIRED';
  end if;

  comparable_price := new.unit_price * quote_exchange_rate * case
    when new.taxable and not quote_prices_include_tax
      then 1 + quote_tax_rate / 100
    else 1
  end;

  new.minimum_sale_price_pen_snapshot := product_minimum_sale_price;
  new.comparable_unit_price_pen_snapshot := comparable_price;

  if product_minimum_sale_price is not null
    and comparable_price < product_minimum_sale_price
  then
    raise exception using
      errcode = 'P0001', message = 'REPAIR_QUOTE_MINIMUM_SALE_PRICE_VIOLATION';
  end if;

  return new;
end;
$$;

create or replace function public.save_repair_quote(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  repair_id uuid;
  operation_key_value uuid;
  expected_lock_version bigint;
  result_id uuid;
  currency_value text;
  exchange_rate_value numeric;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');
  if expected_lock_version is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_VERSION_REQUIRED';
  end if;

  result_id := public.replay_repair_command(
    organization_id, operation_key_value, 'save_repair_quote', payload
  );
  if result_id is not null then
    return result_id;
  end if;

  currency_value := coalesce(nullif(upper(btrim(payload ->> 'currency')), ''), 'PEN');
  exchange_rate_value := public.normalize_repair_quote_exchange_rate(
    currency_value,
    nullif(payload ->> 'exchange_rate_to_pen', '')::numeric
  );
  perform set_config(
    'app.repair_quote_exchange_rate_to_pen', exchange_rate_value::text, true
  );

  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  result_id := public.save_repair_quote_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
  perform public.complete_repair_command(
    organization_id, operation_key_value, 'save_repair_quote', payload, result_id
  );
  return result_id;
end;
$$;

create or replace function public.revise_repair_quote(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  repair_id uuid;
  operation_key_value uuid;
  expected_lock_version bigint;
  result_id uuid;
  currency_value text;
  exchange_rate_value numeric;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'REPAIR_PAYLOAD_INVALID';
  end if;
  organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  repair_id := nullif(payload ->> 'repair_id', '')::uuid;
  operation_key_value := nullif(payload ->> 'operation_key', '')::uuid;
  expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
  perform public.assert_repair_actor(organization_id, 'REPAIRS_UPDATE');
  if expected_lock_version is null then
    raise exception using errcode = 'P0001', message = 'REPAIR_VERSION_REQUIRED';
  end if;

  result_id := public.replay_repair_command(
    organization_id, operation_key_value, 'revise_repair_quote', payload
  );
  if result_id is not null then
    return result_id;
  end if;

  currency_value := coalesce(nullif(upper(btrim(payload ->> 'currency')), ''), 'PEN');
  exchange_rate_value := public.normalize_repair_quote_exchange_rate(
    currency_value,
    nullif(payload ->> 'exchange_rate_to_pen', '')::numeric
  );
  perform set_config(
    'app.repair_quote_exchange_rate_to_pen', exchange_rate_value::text, true
  );

  perform public.lock_repair_version(organization_id, repair_id, expected_lock_version);
  result_id := public.revise_repair_quote_unchecked(payload);
  perform public.advance_repair_version(organization_id, repair_id);
  perform public.complete_repair_command(
    organization_id, operation_key_value, 'revise_repair_quote', payload, result_id
  );
  return result_id;
end;
$$;

revoke all on function public.normalize_repair_quote_exchange_rate(text, numeric)
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_repair_quote_exchange_rate()
  from public, anon, authenticated, service_role;

comment on column public.repair_quotes.exchange_rate_to_pen is
  'Snapshot de PEN por una unidad de la moneda cotizada. Es 1 para PEN; NULL solo identifica documentos USD heredados.';
comment on column public.repair_quote_items.minimum_sale_price_pen_snapshot is
  'Precio minimo final en PEN vigente cuando se guardo la linea de repuesto.';
comment on column public.repair_quote_items.comparable_unit_price_pen_snapshot is
  'Precio unitario final convertido a PEN, sin redondeo previo, usado para validar el minimo.';
comment on function public.validate_repair_quote_item() is
  'Valida disponibilidad y precio minimo del repuesto, y conserva los snapshots de comparacion.';

commit;
