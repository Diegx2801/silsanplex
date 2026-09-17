-- SILSANPLEX: persistencia de cotizaciones comerciales.
--
-- Las cotizaciones son documentos comerciales propios de la organizacion. La
-- API publica escribe exclusivamente mediante RPCs transaccionales; el
-- pedido se construye desde el snapshot persistido y acepta la cotizacion en
-- la misma transaccion.

begin;

create table public.sales_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  quote_number text not null,
  operation_key uuid not null default gen_random_uuid(),
  customer_id uuid not null,
  issue_date date not null default current_date,
  valid_until date not null,
  prices_include_tax boolean not null default true,
  status text not null default 'borrador',
  notes text not null default '',
  subtotal numeric(16,2) not null default 0,
  taxable_base numeric(16,2) not null default 0,
  exempt_amount numeric(16,2) not null default 0,
  unaffected_amount numeric(16,2) not null default 0,
  tax numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  accepted_order_id uuid,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sales_quotes_organization_id_id_key unique (organization_id, id),
  constraint sales_quotes_customer_same_organization
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint sales_quotes_quote_number_format check (quote_number ~ '^COT-[0-9]{6}$'),
  constraint sales_quotes_valid_dates check (valid_until >= issue_date),
  constraint sales_quotes_status_valid
    check (status in ('borrador', 'emitida', 'aceptada', 'rechazada')),
  constraint sales_quotes_notes_length check (char_length(notes) <= 300),
  constraint sales_quotes_rejection_reason_length check (
    rejection_reason is null or char_length(btrim(rejection_reason)) <= 1000
  ),
  constraint sales_quotes_totals_nonnegative check (
    subtotal >= 0 and taxable_base >= 0 and exempt_amount >= 0
    and unaffected_amount >= 0 and tax >= 0 and total >= 0
  ),
  constraint sales_quotes_status_consistency check (
    (
      status = 'borrador'
      and issued_by is null and issued_at is null
      and accepted_by is null and accepted_at is null and accepted_order_id is null
      and rejected_by is null and rejected_at is null and rejection_reason is null
    )
    or (
      status = 'emitida'
      and issued_by is not null and issued_at is not null
      and accepted_by is null and accepted_at is null and accepted_order_id is null
      and rejected_by is null and rejected_at is null and rejection_reason is null
    )
    or (
      status = 'aceptada'
      and issued_by is not null and issued_at is not null
      and accepted_by is not null and accepted_at is not null and accepted_order_id is not null
      and rejected_by is null and rejected_at is null and rejection_reason is null
    )
    or (
      status = 'rechazada'
      and issued_by is not null and issued_at is not null
      and accepted_by is null and accepted_at is null and accepted_order_id is null
      and rejected_by is not null and rejected_at is not null and rejection_reason is not null
    )
  )
);

create unique index sales_quotes_organization_number_unique
  on public.sales_quotes (organization_id, quote_number);
create unique index sales_quotes_organization_operation_unique
  on public.sales_quotes (organization_id, operation_key);
create index sales_quotes_organization_status_created_idx
  on public.sales_quotes (organization_id, status, created_at desc, id);
create index sales_quotes_organization_customer_created_idx
  on public.sales_quotes (organization_id, customer_id, created_at desc, id);

create table public.sales_quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  quote_id uuid not null,
  product_id uuid not null,
  product_code text not null,
  product_description text not null,
  unit_of_measure text,
  tax_affectation text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(16,4) not null,
  line_subtotal numeric(18,4)
    generated always as (round(quantity * unit_price, 4)) stored,
  created_at timestamptz not null default now(),

  constraint sales_quote_items_organization_id_id_key unique (organization_id, id),
  constraint sales_quote_items_quote_same_organization
    foreign key (organization_id, quote_id)
    references public.sales_quotes (organization_id, id) on delete restrict,
  constraint sales_quote_items_product_same_organization
    foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint sales_quote_items_tax_affectation_valid
    check (tax_affectation in ('por-definir', 'gravado', 'exonerado', 'inafecto')),
  constraint sales_quote_items_quantity_positive check (quantity > 0),
  constraint sales_quote_items_price_nonnegative check (unit_price >= 0),
  constraint sales_quote_items_product_snapshot_length check (
    char_length(btrim(product_code)) between 1 and 30
    and char_length(btrim(product_description)) between 2 and 160
  ),
  constraint sales_quote_items_unit_length check (
    unit_of_measure is null or char_length(btrim(unit_of_measure)) <= 40
  )
);

create unique index sales_quote_items_quote_product_unique
  on public.sales_quote_items (organization_id, quote_id, product_id);
create index sales_quote_items_quote_idx
  on public.sales_quote_items (organization_id, quote_id, id);

alter table public.sales_quotes
  add constraint sales_quotes_accepted_order_same_organization
  foreign key (organization_id, accepted_order_id)
  references public.orders (organization_id, id) on delete restrict;

create unique index sales_quotes_accepted_order_unique
  on public.sales_quotes (organization_id, accepted_order_id)
  where accepted_order_id is not null;

create trigger sales_quotes_set_updated_at
before update on public.sales_quotes
for each row execute function public.set_updated_at();

create or replace function public.recalculate_sales_quote_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_quote_id uuid := coalesce(new.quote_id, old.quote_id);
  target_organization_id uuid := coalesce(new.organization_id, old.organization_id);
  includes_tax boolean;
begin
  select quote.prices_include_tax
    into includes_tax
  from public.sales_quotes quote
  where quote.organization_id = target_organization_id
    and quote.id = target_quote_id;

  with line_amounts as (
    select round(item.quantity * item.unit_price, 2) as line_amount,
           item.tax_affectation
    from public.sales_quote_items item
    where item.organization_id = target_organization_id
      and item.quote_id = target_quote_id
  ), line_totals as (
    select line_amount,
           tax_affectation,
           case
             when tax_affectation = 'gravado' and includes_tax
               then round(line_amount / 1.18, 2)
             when tax_affectation = 'gravado' then line_amount
             else 0::numeric
           end as taxable_line,
           case when tax_affectation = 'exonerado' then line_amount else 0::numeric end as exempt_line,
           case when tax_affectation = 'inafecto' then line_amount else 0::numeric end as unaffected_line,
           case
             when tax_affectation <> 'gravado' then 0::numeric
             when includes_tax then round(line_amount - round(line_amount / 1.18, 2), 2)
             else round(line_amount * 0.18, 2)
           end as tax_line
    from line_amounts
  )
  update public.sales_quotes quote
  set taxable_base = round(coalesce((select sum(taxable_line) from line_totals), 0), 2),
      exempt_amount = round(coalesce((select sum(exempt_line) from line_totals), 0), 2),
      unaffected_amount = round(coalesce((select sum(unaffected_line) from line_totals), 0), 2),
      subtotal = round(coalesce((select sum(taxable_line + exempt_line + unaffected_line) from line_totals), 0), 2),
      tax = round(coalesce((select sum(tax_line) from line_totals), 0), 2),
      total = round(coalesce((select sum(taxable_line + exempt_line + unaffected_line + tax_line) from line_totals), 0), 2)
  where quote.organization_id = target_organization_id
    and quote.id = target_quote_id;

  return coalesce(new, old);
end;
$$;

create trigger sales_quote_items_recalculate_totals
after insert or update or delete on public.sales_quote_items
for each row execute function public.recalculate_sales_quote_totals();

create or replace function public.save_sales_quote(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_quote_id uuid := coalesce(nullif(payload ->> 'quote_id', '')::uuid, gen_random_uuid());
  target_operation_key uuid := coalesce(nullif(payload ->> 'operation_key', '')::uuid, target_quote_id);
  target_customer_id uuid;
  target_issue_date date;
  target_valid_until date;
  target_prices_include_tax boolean;
  target_notes text;
  target_quote_number text;
  existing_quote public.sales_quotes%rowtype;
  line jsonb;
  line_quantity numeric;
  line_unit_price numeric;
  next_number bigint;
  quote_action text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'QUOTE_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  if target_organization_id is null
     or not public.has_organization_permission(target_organization_id, 'SALES_MANAGE') then
    raise exception using errcode = '42501', message = 'SALES_QUOTE_PERMISSION_REQUIRED';
  end if;
  if coalesce(jsonb_typeof(payload -> 'items') <> 'array', true)
     or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'SALES_QUOTE_ITEMS_REQUIRED';
  end if;

  target_customer_id := nullif(payload ->> 'customer_id', '')::uuid;
  target_issue_date := coalesce(nullif(payload ->> 'issue_date', '')::date, current_date);
  target_valid_until := nullif(payload ->> 'valid_until', '')::date;
  target_prices_include_tax := coalesce((payload ->> 'prices_include_tax')::boolean, true);
  target_notes := coalesce(payload ->> 'notes', '');
  if target_customer_id is null or target_valid_until is null then
    raise exception using errcode = '22023', message = 'SALES_QUOTE_FIELDS_REQUIRED';
  end if;
  if target_valid_until < target_issue_date then
    raise exception using errcode = '22023', message = 'SALES_QUOTE_DATES_INVALID';
  end if;
  if char_length(target_notes) > 300 then
    raise exception using errcode = '22023', message = 'SALES_QUOTE_NOTES_TOO_LONG';
  end if;

  perform 1
  from public.customers customer
  where customer.organization_id = target_organization_id
    and customer.id = target_customer_id
    and customer.is_active
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'SALES_QUOTE_CUSTOMER_UNAVAILABLE';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(payload -> 'items') item
    group by item ->> 'product_id'
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'SALES_QUOTE_DUPLICATE_PRODUCT';
  end if;

  for line in select value from jsonb_array_elements(payload -> 'items')
  loop
    if nullif(line ->> 'product_id', '') is null then
      raise exception using errcode = '22023', message = 'SALES_QUOTE_PRODUCT_REQUIRED';
    end if;
    line_quantity := nullif(line ->> 'quantity', '')::numeric;
    line_unit_price := nullif(line ->> 'unit_price', '')::numeric;
    if line_quantity is null or line_quantity <= 0
       or line_unit_price is null or line_unit_price < 0 then
      raise exception using errcode = '22023', message = 'SALES_QUOTE_ITEM_VALUES_INVALID';
    end if;
    if not exists (
      select 1
      from public.products product
      where product.organization_id = target_organization_id
        and product.id = (line ->> 'product_id')::uuid
        and product.is_active
    ) then
      raise exception using errcode = 'P0001', message = 'SALES_QUOTE_PRODUCT_UNAVAILABLE';
    end if;
  end loop;

  select * into existing_quote
  from public.sales_quotes quote
  where quote.organization_id = target_organization_id
    and quote.id = target_quote_id
  for update;
  if found then
    if existing_quote.status <> 'borrador' then
      raise exception using errcode = 'P0001', message = 'SALES_QUOTE_NOT_DRAFT';
    end if;
    target_quote_number := existing_quote.quote_number;
    quote_action := 'QUOTE_UPDATED';
    update public.sales_quotes
    set customer_id = target_customer_id,
        issue_date = target_issue_date,
        valid_until = target_valid_until,
        prices_include_tax = target_prices_include_tax,
        notes = target_notes,
        updated_by = actor_id
    where organization_id = target_organization_id
      and id = target_quote_id;
    delete from public.sales_quote_items
    where organization_id = target_organization_id
      and quote_id = target_quote_id;
  else
    perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
      target_organization_id::text || ':quote-number', 0));
    select coalesce(max(nullif(substring(quote.quote_number from 5), '')::bigint), 0) + 1
      into next_number
    from public.sales_quotes quote
    where quote.organization_id = target_organization_id;
    if next_number > 999999 then
      raise exception using errcode = '22023', message = 'QUOTE_NUMBER_EXHAUSTED';
    end if;
    target_quote_number := 'COT-' || lpad(next_number::text, 6, '0');
    quote_action := 'QUOTE_CREATED';
    if exists (
      select 1 from public.sales_quotes quote
      where quote.organization_id = target_organization_id
        and quote.operation_key = target_operation_key
        and quote.id <> target_quote_id
    ) then
      raise exception using errcode = 'P0001', message = 'SALES_QUOTE_IDEMPOTENCY_CONFLICT';
    end if;
    insert into public.sales_quotes (
      id, organization_id, quote_number, operation_key, customer_id, issue_date, valid_until,
      prices_include_tax, status, notes, created_by, updated_by
    ) values (
      target_quote_id, target_organization_id, target_quote_number,
      target_operation_key,
      target_customer_id, target_issue_date, target_valid_until,
      target_prices_include_tax, 'borrador', target_notes, actor_id, actor_id
    );
  end if;

  insert into public.sales_quote_items (
    organization_id, quote_id, product_id, product_code, product_description,
    unit_of_measure, tax_affectation, quantity, unit_price
  )
  select target_organization_id, target_quote_id, product.id, product.code,
         product.description, product.unit_of_measure, product.tax_affectation,
         (line_data ->> 'quantity')::numeric, (line_data ->> 'unit_price')::numeric
  from jsonb_array_elements(payload -> 'items') as item_rows(line_data)
  join public.products product
    on product.organization_id = target_organization_id
   and product.id = (line_data ->> 'product_id')::uuid;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values, metadata
  ) values (
    target_organization_id, actor_id, quote_action, 'sales_quote', target_quote_id::text,
    jsonb_build_object('quote_number', target_quote_number, 'status', 'borrador'),
    jsonb_build_object('source', 'database_function')
  );
  return target_quote_id;
end;
$$;

create or replace function public.issue_sales_quote(
  requested_organization_id uuid,
  requested_quote_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  quote_row public.sales_quotes%rowtype;
begin
  if actor_id is null
     or requested_organization_id is null
     or not public.has_organization_permission(requested_organization_id, 'SALES_MANAGE') then
    raise exception using errcode = '42501', message = 'SALES_QUOTE_PERMISSION_REQUIRED';
  end if;
  select * into quote_row
  from public.sales_quotes quote
  where quote.organization_id = requested_organization_id
    and quote.id = requested_quote_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SALES_QUOTE_NOT_FOUND';
  end if;
  if quote_row.status <> 'borrador' then
    raise exception using errcode = 'P0001', message = 'SALES_QUOTE_NOT_ISSUABLE';
  end if;
  if quote_row.valid_until < current_date then
    raise exception using errcode = 'P0001', message = 'SALES_QUOTE_EXPIRED';
  end if;
  if not exists (
    select 1 from public.sales_quote_items item
    where item.organization_id = requested_organization_id
      and item.quote_id = requested_quote_id
  ) then
    raise exception using errcode = 'P0001', message = 'SALES_QUOTE_ITEMS_REQUIRED';
  end if;
  if exists (
    select 1 from public.sales_quote_items item
    where item.organization_id = requested_organization_id
      and item.quote_id = requested_quote_id
      and item.tax_affectation = 'por-definir'
  ) then
    raise exception using errcode = 'P0001', message = 'SALES_QUOTE_TAX_AFFECTATION_REQUIRED';
  end if;

  update public.sales_quotes
  set status = 'emitida', issued_by = actor_id, issued_at = now(), updated_by = actor_id
  where organization_id = requested_organization_id and id = requested_quote_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, old_values, new_values, metadata
  ) values (
    requested_organization_id, actor_id, 'QUOTE_ISSUED', 'sales_quote', requested_quote_id::text,
    jsonb_build_object('status', 'borrador'), jsonb_build_object('status', 'emitida'),
    jsonb_build_object('source', 'database_function')
  );
  return requested_quote_id;
end;
$$;

create or replace function public.reject_sales_quote(
  requested_organization_id uuid,
  requested_quote_id uuid,
  requested_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  quote_row public.sales_quotes%rowtype;
  normalized_reason text := nullif(btrim(requested_reason), '');
begin
  if actor_id is null
     or requested_organization_id is null
     or not public.has_organization_permission(requested_organization_id, 'SALES_MANAGE') then
    raise exception using errcode = '42501', message = 'SALES_QUOTE_PERMISSION_REQUIRED';
  end if;
  if normalized_reason is null or char_length(normalized_reason) > 1000 then
    raise exception using errcode = '22023', message = 'SALES_QUOTE_REJECTION_REASON_REQUIRED';
  end if;
  select * into quote_row
  from public.sales_quotes quote
  where quote.organization_id = requested_organization_id
    and quote.id = requested_quote_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SALES_QUOTE_NOT_FOUND';
  end if;
  if quote_row.status <> 'emitida' then
    raise exception using errcode = 'P0001', message = 'SALES_QUOTE_NOT_REJECTABLE';
  end if;

  update public.sales_quotes
  set status = 'rechazada', rejected_by = actor_id, rejected_at = now(),
      rejection_reason = normalized_reason, updated_by = actor_id
  where organization_id = requested_organization_id and id = requested_quote_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, old_values, new_values, metadata
  ) values (
    requested_organization_id, actor_id, 'QUOTE_REJECTED', 'sales_quote', requested_quote_id::text,
    jsonb_build_object('status', 'emitida'),
    jsonb_build_object('status', 'rechazada', 'reason', normalized_reason),
    jsonb_build_object('source', 'database_function')
  );
  return requested_quote_id;
end;
$$;

-- El pedido usa la cotizacion persistida como fuente de verdad. Se conservan
-- almacen y claves de idempotencia del payload; cliente, fechas, precios,
-- notas y lineas se toman del documento bloqueado.
create or replace function public.create_order(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_source_quote_id uuid;
  target_order_id uuid;
  previous_tax_enforcement text := current_setting('p1b3.enforce_tax_affectation', true);
  quote_row public.sales_quotes%rowtype;
  quote_found boolean := false;
  effective_payload jsonb := payload;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  if target_organization_id is null
     or not public.has_organization_permission(target_organization_id, 'SALES_MANAGE') then
    raise exception using errcode = '42501', message = 'ORDER_FORBIDDEN';
  end if;
  target_source_quote_id := nullif(payload ->> 'source_quote_id', '')::uuid;

  if target_source_quote_id is not null then
    select * into quote_row
    from public.sales_quotes quote
    where quote.organization_id = target_organization_id
      and quote.id = target_source_quote_id
    for update;
    quote_found := found;
    if not quote_found and exists (
      select 1 from public.sales_quotes quote
      where quote.id = target_source_quote_id
    ) then
      -- El identificador existe, pero pertenece a otra organizacion. No se
      -- permite convertirlo ni revelar datos entre organizaciones.
      raise exception using errcode = 'P0002', message = 'QUOTE_NOT_FOUND';
    end if;
    if quote_found and quote_row.status = 'emitida' then
      if quote_row.valid_until < current_date then
        raise exception using errcode = 'P0001', message = 'QUOTE_EXPIRED';
      end if;
    elsif quote_found and quote_row.status <> 'aceptada' then
      raise exception using errcode = 'P0001', message = 'SALES_QUOTE_NOT_AVAILABLE';
    end if;

    if quote_found then
      -- The order item triggers snapshot the current product. Refuse a
      -- conversion when the catalog changed after issuance instead of
      -- silently mixing a historical quote with a newer product definition.
      if exists (
        select 1
        from public.sales_quote_items quote_item
        join public.products product
          on product.organization_id = target_organization_id
         and product.id = quote_item.product_id
        where quote_item.organization_id = target_organization_id
          and quote_item.quote_id = target_source_quote_id
          and (
            product.tax_affectation is distinct from quote_item.tax_affectation
            or product.code is distinct from quote_item.product_code
            or product.description is distinct from quote_item.product_description
            or product.unit_of_measure is distinct from quote_item.unit_of_measure
          )
      ) then
        raise exception using errcode = 'P0001', message = 'SALES_QUOTE_PRODUCT_CHANGED';
      end if;
      effective_payload := payload || jsonb_build_object(
      'operation_key', coalesce(nullif(payload ->> 'operation_key', ''), quote_row.id::text),
      'source_quote_number', quote_row.quote_number,
      'customer_id', quote_row.customer_id,
      'order_date', quote_row.issue_date,
      'prices_include_tax', quote_row.prices_include_tax,
      'notes', quote_row.notes,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', item.product_id,
          'quantity', item.quantity,
          'unit_price', item.unit_price
        ) order by item.id)
        from public.sales_quote_items item
        where item.organization_id = target_organization_id
          and item.quote_id = target_source_quote_id
      ), '[]'::jsonb)
      );
    end if;
  end if;

  perform set_config('p1b3.enforce_tax_affectation', 'on', true);
  begin
    target_order_id := public.create_order_unchecked(effective_payload);
    if quote_found and quote_row.status = 'emitida' then
      update public.sales_quotes
      set status = 'aceptada', accepted_by = actor_id, accepted_at = now(),
          accepted_order_id = target_order_id, updated_by = actor_id
      where organization_id = target_organization_id
        and id = target_source_quote_id
        and status = 'emitida';
      insert into public.audit_events (
        organization_id, actor_user_id, action, entity_type, entity_id, new_values, metadata
      ) values (
        target_organization_id, actor_id, 'QUOTE_ACCEPTED', 'sales_quote', target_source_quote_id::text,
        jsonb_build_object('status', 'aceptada', 'order_id', target_order_id),
        jsonb_build_object('source', 'database_function')
      );
    elsif quote_found
      and quote_row.status = 'aceptada'
      and quote_row.accepted_order_id is distinct from target_order_id then
      raise exception using errcode = 'P0001', message = 'QUOTE_ORDER_MISMATCH';
    end if;
    perform set_config('p1b3.enforce_tax_affectation', coalesce(previous_tax_enforcement, 'off'), true);
    return target_order_id;
  exception
    when others then
      perform set_config('p1b3.enforce_tax_affectation', coalesce(previous_tax_enforcement, 'off'), true);
      raise;
  end;
end;
$$;

alter function public.recalculate_sales_quote_totals() owner to postgres;
alter function public.save_sales_quote(jsonb) owner to postgres;
alter function public.issue_sales_quote(uuid, uuid) owner to postgres;
alter function public.reject_sales_quote(uuid, uuid, text) owner to postgres;
alter function public.create_order(jsonb) owner to postgres;

alter table public.sales_quotes enable row level security;
alter table public.sales_quote_items enable row level security;

create policy sales_quotes_select_authorized on public.sales_quotes
  for select to authenticated
  using ((select public.has_organization_permission(organization_id, 'SALES_VIEW')));
create policy sales_quote_items_select_authorized on public.sales_quote_items
  for select to authenticated
  using ((select public.has_organization_permission(organization_id, 'SALES_VIEW')));

revoke all on table public.sales_quotes, public.sales_quote_items from anon, authenticated;
grant select on table public.sales_quotes, public.sales_quote_items to authenticated;
grant select, insert, update, delete on table public.sales_quotes, public.sales_quote_items to service_role;

revoke all on function public.recalculate_sales_quote_totals() from public, anon, authenticated, service_role;
revoke all on function public.save_sales_quote(jsonb) from public, anon, authenticated;
revoke all on function public.issue_sales_quote(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reject_sales_quote(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_order(jsonb) from public, anon, authenticated;
grant execute on function public.save_sales_quote(jsonb) to authenticated;
grant execute on function public.issue_sales_quote(uuid, uuid) to authenticated;
grant execute on function public.reject_sales_quote(uuid, uuid, text) to authenticated;
grant execute on function public.create_order(jsonb) to authenticated;

comment on table public.sales_quotes is
  'Cotizaciones comerciales persistentes. Un pedido creado desde una cotizacion acepta el documento atomica y transaccionalmente.';
comment on table public.sales_quote_items is
  'Lineas historicas de cotizacion con snapshots de producto y afectacion tributaria.';
comment on function public.save_sales_quote(jsonb) is
  'Crea o actualiza un borrador de cotizacion con validacion de organizacion, cliente y productos.';
comment on function public.issue_sales_quote(uuid, uuid) is
  'Emite un borrador de cotizacion vigente y con al menos una linea.';
comment on function public.reject_sales_quote(uuid, uuid, text) is
  'Rechaza una cotizacion emitida con razon obligatoria.';

commit;
