-- Cierre funcional de Proveedores: abastecimiento real, desempeño,
-- incidencias, devoluciones y evaluaciones históricas.

alter table public.purchase_orders
  add column expected_delivery_date date,
  add constraint purchase_orders_expected_delivery_valid
    check (expected_delivery_date is null or expected_delivery_date >= issue_date);

comment on column public.purchase_orders.expected_delivery_date is
  'Fecha comprometida por el proveedor. Se compara con received_at para medir puntualidad real.';

create or replace function public.save_purchase_order(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid := (payload ->> 'organization_id')::uuid;
  target_order_id uuid := nullif(payload ->> 'id', '')::uuid;
  target_supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  supplier_row public.suppliers%rowtype;
  existing_order public.purchase_orders%rowtype;
  item jsonb;
begin
  if actor_id is null or not public.has_organization_permission(target_organization_id, 'PURCHASES_MANAGE') then
    raise exception using errcode = '42501', message = 'PURCHASE_ORDER_FORBIDDEN';
  end if;
  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'PURCHASE_ORDER_ITEMS_REQUIRED';
  end if;
  if exists (
    select 1 from jsonb_array_elements(payload -> 'items') line
    group by line ->> 'product_id' having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'PURCHASE_ORDER_DUPLICATE_PRODUCT';
  end if;

  select * into supplier_row
  from public.suppliers supplier
  where supplier.id = target_supplier_id
    and supplier.organization_id = target_organization_id
    and supplier.is_active;
  if not found then
    raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_SUPPLIER_UNAVAILABLE';
  end if;

  for item in select value from jsonb_array_elements(payload -> 'items')
  loop
    if not exists (
      select 1 from public.products product
      where product.id = (item ->> 'product_id')::uuid
        and product.organization_id = target_organization_id
        and product.is_active
        and (not product.batch_control or nullif(btrim(item ->> 'lot'), '') is not null)
        and (not product.expiration_control or nullif(item ->> 'expiration_date', '') is not null)
    ) then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE';
    end if;
  end loop;

  if target_order_id is null then
    insert into public.purchase_orders (
      organization_id, supplier_id, supplier_document, supplier_name,
      document_type, series, document_number, issue_date, payment_due_date,
      expected_delivery_date, warehouse, currency, prices_include_tax, notes,
      created_by, updated_by
    ) values (
      target_organization_id, target_supplier_id, supplier_row.document_number, supplier_row.business_name,
      payload ->> 'document_type', upper(btrim(payload ->> 'series')), btrim(payload ->> 'document_number'),
      (payload ->> 'issue_date')::date, nullif(payload ->> 'payment_due_date', '')::date,
      nullif(payload ->> 'expected_delivery_date', '')::date,
      btrim(payload ->> 'warehouse'), coalesce(nullif(payload ->> 'currency', ''), 'PEN'),
      coalesce((payload ->> 'prices_include_tax')::boolean, true), nullif(btrim(payload ->> 'notes'), ''),
      actor_id, actor_id
    ) returning id into target_order_id;
  else
    select * into existing_order
    from public.purchase_orders purchase_order
    where purchase_order.id = target_order_id
      and purchase_order.organization_id = target_organization_id
    for update;
    if not found or existing_order.status <> 'draft' then
      raise exception using errcode = 'P0001', message = 'PURCHASE_ORDER_NOT_EDITABLE';
    end if;

    update public.purchase_orders
    set supplier_id = target_supplier_id,
        supplier_document = supplier_row.document_number,
        supplier_name = supplier_row.business_name,
        document_type = payload ->> 'document_type',
        series = upper(btrim(payload ->> 'series')),
        document_number = btrim(payload ->> 'document_number'),
        issue_date = (payload ->> 'issue_date')::date,
        payment_due_date = nullif(payload ->> 'payment_due_date', '')::date,
        expected_delivery_date = nullif(payload ->> 'expected_delivery_date', '')::date,
        warehouse = btrim(payload ->> 'warehouse'),
        currency = coalesce(nullif(payload ->> 'currency', ''), 'PEN'),
        prices_include_tax = coalesce((payload ->> 'prices_include_tax')::boolean, true),
        notes = nullif(btrim(payload ->> 'notes'), ''),
        updated_by = actor_id
    where id = target_order_id;

    delete from public.purchase_order_items where purchase_order_id = target_order_id;
  end if;

  insert into public.purchase_order_items (
    purchase_order_id, organization_id, product_id, product_code,
    product_description, unit_of_measure, batch_control, quantity,
    unit_cost, lot, expiration_date
  )
  select
    target_order_id, target_organization_id, product.id, product.code,
    product.description, product.unit_of_measure, product.batch_control,
    (line ->> 'quantity')::numeric, (line ->> 'unit_cost')::numeric,
    nullif(btrim(line ->> 'lot'), ''), nullif(line ->> 'expiration_date', '')::date
  from jsonb_array_elements(payload -> 'items') line
  join public.products product on product.id = (line ->> 'product_id')::uuid;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, new_values, metadata
  ) values (
    target_organization_id, actor_id,
    case when payload ? 'id' and nullif(payload ->> 'id', '') is not null then 'PURCHASE_ORDER_UPDATED' else 'PURCHASE_ORDER_CREATED' end,
    'purchase_order', target_order_id::text,
    jsonb_build_object(
      'supplier_id', target_supplier_id,
      'document_type', payload ->> 'document_type',
      'series', payload ->> 'series',
      'document_number', payload ->> 'document_number',
      'expected_delivery_date', payload ->> 'expected_delivery_date'
    ),
    jsonb_build_object('source', 'database_function')
  );

  return target_order_id;
end;
$$;

create table public.supplier_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  evaluated_at date not null default current_date,
  quality_rating smallint not null,
  delivery_rating smallint not null,
  service_rating smallint not null,
  price_rating smallint not null,
  overall_rating numeric(3,2) generated always as (
    (quality_rating + delivery_rating + service_rating + price_rating)::numeric / 4
  ) stored,
  comments text,
  responsible_user_id uuid references auth.users(id) on delete set null,
  responsible_name text not null,
  created_at timestamptz not null default now(),
  constraint supplier_evaluations_ratings_valid check (
    quality_rating between 1 and 5 and delivery_rating between 1 and 5
    and service_rating between 1 and 5 and price_rating between 1 and 5
  ),
  constraint supplier_evaluations_comments_length
    check (comments is null or char_length(btrim(comments)) <= 1000),
  constraint supplier_evaluations_responsible_length
    check (char_length(btrim(responsible_name)) between 2 and 160)
);

create index supplier_evaluations_supplier_date_idx
  on public.supplier_evaluations (organization_id, supplier_id, evaluated_at desc, created_at desc, id);

create table public.supplier_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  incident_type text not null,
  severity text not null,
  status text not null default 'open',
  occurred_at date not null default current_date,
  description text not null,
  resolution text,
  resolved_at timestamptz,
  responsible_user_id uuid references auth.users(id) on delete set null,
  responsible_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_incidents_type_valid check (
    incident_type in ('late-delivery', 'incomplete-delivery', 'quality', 'documentation', 'commercial', 'other')
  ),
  constraint supplier_incidents_severity_valid check (severity in ('low', 'medium', 'high', 'critical')),
  constraint supplier_incidents_status_valid check (status in ('open', 'investigating', 'resolved', 'closed')),
  constraint supplier_incidents_description_length check (char_length(btrim(description)) between 5 and 1200),
  constraint supplier_incidents_resolution_length check (resolution is null or char_length(btrim(resolution)) <= 1200),
  constraint supplier_incidents_resolution_consistent check (
    (status in ('open', 'investigating') and resolved_at is null)
    or (status in ('resolved', 'closed') and resolved_at is not null and resolution is not null)
  )
);

create trigger supplier_incidents_set_updated_at
before update on public.supplier_incidents
for each row execute function public.set_updated_at();

create index supplier_incidents_supplier_status_idx
  on public.supplier_incidents (organization_id, supplier_id, status, occurred_at desc, id);
create index supplier_incidents_purchase_idx
  on public.supplier_incidents (purchase_order_id) where purchase_order_id is not null;

create table public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null,
  reason text not null,
  status text not null default 'registered',
  requested_at date not null default current_date,
  completed_at timestamptz,
  responsible_user_id uuid references auth.users(id) on delete set null,
  responsible_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_returns_quantity_positive check (quantity > 0),
  constraint supplier_returns_reason_length check (char_length(btrim(reason)) between 5 and 600),
  constraint supplier_returns_status_valid check (status in ('registered', 'completed', 'cancelled')),
  constraint supplier_returns_completed_consistent check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create trigger supplier_returns_set_updated_at
before update on public.supplier_returns
for each row execute function public.set_updated_at();

create index supplier_returns_supplier_date_idx
  on public.supplier_returns (organization_id, supplier_id, requested_at desc, id);
create index supplier_returns_item_idx on public.supplier_returns (purchase_order_item_id, status);

alter table public.inventory_movements drop constraint inventory_movements_source_valid;
alter table public.inventory_movements
  add constraint inventory_movements_source_valid
    check (source_type in ('manual', 'purchase-receipt', 'warehouse-transfer', 'stock-reclassification', 'supplier-return'));
create unique index inventory_movements_supplier_return_unique
  on public.inventory_movements (source_type, source_id)
  where source_type = 'supplier-return';

create or replace function public.supplier_responsible_name(requested_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select nullif(btrim(profile.full_name), '')
    from public.profiles profile
    where profile.id = requested_user_id
  ), 'Usuario del sistema');
$$;

revoke all on function public.supplier_responsible_name(uuid) from public, anon, authenticated;

create function public.record_supplier_evaluation(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid();
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  evaluation_id uuid;
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'SUPPLIERS_MANAGE') then
    raise exception using errcode = '42501', message = 'SUPPLIER_EVALUATION_FORBIDDEN';
  end if;
  if not exists (
    select 1 from public.suppliers supplier
    where supplier.id = supplier_id and supplier.organization_id = organization_id
  ) then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_NOT_FOUND';
  end if;

  insert into public.supplier_evaluations (
    organization_id, supplier_id, evaluated_at, quality_rating, delivery_rating,
    service_rating, price_rating, comments, responsible_user_id, responsible_name
  ) values (
    organization_id, supplier_id, coalesce(nullif(payload ->> 'evaluated_at', '')::date, current_date),
    (payload ->> 'quality_rating')::smallint, (payload ->> 'delivery_rating')::smallint,
    (payload ->> 'service_rating')::smallint, (payload ->> 'price_rating')::smallint,
    nullif(btrim(payload ->> 'comments'), ''), actor_id,
    public.supplier_responsible_name(actor_id)
  ) returning id into evaluation_id;

  update public.suppliers supplier
  set performance_rating = round((
        (payload ->> 'quality_rating')::numeric + (payload ->> 'delivery_rating')::numeric
        + (payload ->> 'service_rating')::numeric + (payload ->> 'price_rating')::numeric
      ) / 4)::smallint,
      updated_by = actor_id
  where supplier.id = supplier_id and supplier.organization_id = organization_id;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, new_values)
  values (organization_id, actor_id, 'SUPPLIER_EVALUATED', 'supplier_evaluation', evaluation_id::text, payload - 'organization_id');
  return evaluation_id;
end;
$$;

create function public.save_supplier_incident(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid();
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  incident_id uuid := nullif(payload ->> 'id', '')::uuid;
  incident_status text := coalesce(nullif(payload ->> 'status', ''), 'open');
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'SUPPLIERS_MANAGE') then
    raise exception using errcode = '42501', message = 'SUPPLIER_INCIDENT_FORBIDDEN';
  end if;
  if not exists (select 1 from public.suppliers s where s.id = supplier_id and s.organization_id = organization_id) then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_NOT_FOUND';
  end if;
  if nullif(payload ->> 'purchase_order_id', '') is not null and not exists (
    select 1 from public.purchase_orders purchase
    where purchase.id = (payload ->> 'purchase_order_id')::uuid
      and purchase.organization_id = organization_id and purchase.supplier_id = supplier_id
  ) then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_INCIDENT_PURCHASE_INVALID';
  end if;
  if nullif(payload ->> 'product_id', '') is not null and not exists (
    select 1
    from public.products product
    where product.id = (payload ->> 'product_id')::uuid
      and product.organization_id = organization_id
      and (
        nullif(payload ->> 'purchase_order_id', '') is null
        or exists (
          select 1 from public.purchase_order_items item
          where item.purchase_order_id = (payload ->> 'purchase_order_id')::uuid
            and item.product_id = product.id
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_INCIDENT_PRODUCT_INVALID';
  end if;

  if incident_id is null then
    insert into public.supplier_incidents (
      organization_id, supplier_id, purchase_order_id, product_id, incident_type,
      severity, status, occurred_at, description, resolution, resolved_at,
      responsible_user_id, responsible_name
    ) values (
      organization_id, supplier_id, nullif(payload ->> 'purchase_order_id', '')::uuid,
      nullif(payload ->> 'product_id', '')::uuid, payload ->> 'incident_type',
      payload ->> 'severity', incident_status,
      coalesce(nullif(payload ->> 'occurred_at', '')::date, current_date), btrim(payload ->> 'description'),
      nullif(btrim(payload ->> 'resolution'), ''),
      case when incident_status in ('resolved', 'closed') then now() else null end,
      actor_id, public.supplier_responsible_name(actor_id)
    ) returning id into incident_id;
  else
    update public.supplier_incidents incident
    set purchase_order_id = nullif(payload ->> 'purchase_order_id', '')::uuid,
        product_id = nullif(payload ->> 'product_id', '')::uuid,
        incident_type = payload ->> 'incident_type',
        severity = payload ->> 'severity',
        status = incident_status,
        occurred_at = coalesce(nullif(payload ->> 'occurred_at', '')::date, incident.occurred_at),
        description = btrim(payload ->> 'description'),
        resolution = nullif(btrim(payload ->> 'resolution'), ''),
        resolved_at = case when incident_status in ('resolved', 'closed') then coalesce(incident.resolved_at, now()) else null end,
        responsible_user_id = actor_id,
        responsible_name = public.supplier_responsible_name(actor_id)
    where incident.id = incident_id and incident.organization_id = organization_id and incident.supplier_id = supplier_id;
    if not found then raise exception using errcode = 'P0001', message = 'SUPPLIER_INCIDENT_NOT_FOUND'; end if;
  end if;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, new_values)
  values (organization_id, actor_id, 'SUPPLIER_INCIDENT_SAVED', 'supplier_incident', incident_id::text, payload - 'organization_id');
  return incident_id;
end;
$$;

create function public.register_supplier_return(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid();
  organization_id uuid := (payload ->> 'organization_id')::uuid;
  supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  order_id uuid := (payload ->> 'purchase_order_id')::uuid;
  item_id uuid := (payload ->> 'purchase_order_item_id')::uuid;
  requested_quantity numeric := (payload ->> 'quantity')::numeric;
  item_row public.purchase_order_items%rowtype;
  return_id uuid;
begin
  if actor_id is null or not public.has_organization_permission(organization_id, 'SUPPLIERS_MANAGE') then
    raise exception using errcode = '42501', message = 'SUPPLIER_RETURN_FORBIDDEN';
  end if;
  select item.* into item_row
  from public.purchase_order_items item
  join public.purchase_orders purchase on purchase.id = item.purchase_order_id
  where item.id = item_id and item.purchase_order_id = order_id
    and item.organization_id = organization_id and purchase.supplier_id = supplier_id
    and purchase.status = 'received';
  if not found then raise exception using errcode = 'P0001', message = 'SUPPLIER_RETURN_ITEM_INVALID'; end if;
  if requested_quantity <= 0 or requested_quantity + coalesce((
    select sum(previous.quantity) from public.supplier_returns previous
    where previous.purchase_order_item_id = item_id and previous.status <> 'cancelled'
  ), 0) > item_row.quantity then
    raise exception using errcode = '22023', message = 'SUPPLIER_RETURN_QUANTITY_INVALID';
  end if;

  insert into public.supplier_returns (
    organization_id, supplier_id, purchase_order_id, purchase_order_item_id,
    product_id, quantity, reason, requested_at, responsible_user_id, responsible_name
  ) values (
    organization_id, supplier_id, order_id, item_id, item_row.product_id,
    requested_quantity, btrim(payload ->> 'reason'),
    coalesce(nullif(payload ->> 'requested_at', '')::date, current_date),
    actor_id, public.supplier_responsible_name(actor_id)
  ) returning id into return_id;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, new_values)
  values (organization_id, actor_id, 'SUPPLIER_RETURN_REGISTERED', 'supplier_return', return_id::text, payload - 'organization_id');
  return return_id;
end;
$$;

create function public.complete_supplier_return(requested_organization_id uuid, requested_return_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  return_row public.supplier_returns%rowtype;
  item_row public.purchase_order_items%rowtype;
  receipt_movement public.inventory_movements%rowtype;
  available_quantity numeric;
begin
  if actor_id is null
    or not public.has_organization_permission(requested_organization_id, 'SUPPLIERS_MANAGE')
    or not public.has_organization_permission(requested_organization_id, 'INVENTORY_MANAGE')
  then
    raise exception using errcode = '42501', message = 'SUPPLIER_RETURN_COMPLETE_FORBIDDEN';
  end if;

  select * into return_row from public.supplier_returns requested
  where requested.id = requested_return_id and requested.organization_id = requested_organization_id
  for update;
  if not found or return_row.status <> 'registered' then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_RETURN_NOT_COMPLETABLE';
  end if;
  select * into item_row from public.purchase_order_items item where item.id = return_row.purchase_order_item_id;
  select * into receipt_movement from public.inventory_movements movement
  where movement.source_type = 'purchase-receipt' and movement.source_id = item_row.id
  order by movement.created_at limit 1;
  if not found then raise exception using errcode = 'P0001', message = 'SUPPLIER_RETURN_RECEIPT_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    requested_organization_id::text || ':' || item_row.product_id::text || ':'
    || receipt_movement.warehouse_id::text || ':' || receipt_movement.location_id::text || ':'
    || receipt_movement.stock_status || ':' || lower(coalesce(receipt_movement.lot, '')), 0
  ));
  select coalesce(sum(case when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity else -movement.quantity end), 0)
  into available_quantity
  from public.inventory_movements movement
  where movement.organization_id = requested_organization_id
    and movement.product_id = item_row.product_id
    and movement.warehouse_id = receipt_movement.warehouse_id
    and movement.location_id = receipt_movement.location_id
    and movement.stock_status = receipt_movement.stock_status
    and lower(coalesce(movement.lot, '')) = lower(coalesce(receipt_movement.lot, ''));
  if available_quantity < return_row.quantity then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_RETURN_INSUFFICIENT_STOCK';
  end if;

  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, lot, expiration_date, operation_date, reason, source_type, source_id, created_by
  ) values (
    requested_organization_id, item_row.product_id, item_row.product_code,
    item_row.product_description, item_row.unit_of_measure, 'salida', return_row.quantity,
    receipt_movement.warehouse, receipt_movement.warehouse_id, receipt_movement.location_id,
    receipt_movement.stock_status, item_row.unit_cost, receipt_movement.lot,
    receipt_movement.expiration_date, current_date,
    left('Devolución a proveedor: ' || return_row.reason, 180),
    'supplier-return', return_row.id, actor_id
  );
  update public.supplier_returns
  set status = 'completed', completed_at = now(), responsible_user_id = actor_id,
      responsible_name = public.supplier_responsible_name(actor_id)
  where id = return_row.id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id)
  values (requested_organization_id, actor_id, 'SUPPLIER_RETURN_COMPLETED', 'supplier_return', return_row.id::text);
end;
$$;

create view public.supplier_supplied_products
with (security_invoker = true)
as
select
  purchase.organization_id,
  purchase.supplier_id,
  item.product_id,
  item.product_code,
  item.product_description,
  item.unit_of_measure,
  count(distinct purchase.id)::integer as purchase_count,
  sum(item.quantity) as supplied_quantity,
  min(item.unit_cost) as minimum_unit_cost,
  round(avg(item.unit_cost), 4) as average_unit_cost,
  max(item.unit_cost) as maximum_unit_cost,
  (array_agg(item.unit_cost order by purchase.received_at desc, item.id desc))[1] as latest_unit_cost,
  max(purchase.received_at) as last_received_at
from public.purchase_orders purchase
join public.purchase_order_items item on item.purchase_order_id = purchase.id
where purchase.status = 'received'
group by purchase.organization_id, purchase.supplier_id, item.product_id,
  item.product_code, item.product_description, item.unit_of_measure;

create view public.supplier_price_history
with (security_invoker = true)
as
select
  purchase.organization_id, purchase.supplier_id, purchase.id as purchase_order_id,
  purchase.document_type, purchase.series, purchase.document_number,
  purchase.currency, purchase.received_at, item.id as purchase_order_item_id,
  item.product_id, item.product_code, item.product_description,
  item.quantity, item.unit_cost
from public.purchase_orders purchase
join public.purchase_order_items item on item.purchase_order_id = purchase.id
where purchase.status = 'received';

create view public.supplier_performance_summary
with (security_invoker = true)
as
with purchase_metrics as (
  select organization_id, supplier_id,
    count(*) filter (where status = 'received')::integer as received_orders,
    count(*) filter (where status = 'received' and expected_delivery_date is not null)::integer as measured_deliveries,
    count(*) filter (where status = 'received' and expected_delivery_date is not null and received_at::date <= expected_delivery_date)::integer as on_time_deliveries,
    count(*) filter (where status = 'received' and expected_delivery_date is not null and received_at::date > expected_delivery_date)::integer as late_deliveries,
    round(avg((received_at::date - issue_date)) filter (where status = 'received'), 1) as average_delivery_days,
    max(received_at) filter (where status = 'received') as last_purchase_at
  from public.purchase_orders group by organization_id, supplier_id
), incident_metrics as (
  select organization_id, supplier_id, count(*)::integer as incident_count,
    count(*) filter (where status in ('open', 'investigating'))::integer as open_incident_count
  from public.supplier_incidents group by organization_id, supplier_id
), return_metrics as (
  select organization_id, supplier_id,
    count(*) filter (where status = 'completed')::integer as completed_return_count,
    coalesce(sum(quantity) filter (where status = 'completed'), 0) as returned_quantity
  from public.supplier_returns group by organization_id, supplier_id
), evaluation_metrics as (
  select distinct on (organization_id, supplier_id)
    organization_id, supplier_id, overall_rating as latest_evaluation,
    evaluated_at as latest_evaluation_at
  from public.supplier_evaluations
  order by organization_id, supplier_id, evaluated_at desc, created_at desc, id desc
)
select
  supplier.organization_id, supplier.id as supplier_id,
  coalesce(purchase_metrics.received_orders, 0) as received_orders,
  coalesce(purchase_metrics.measured_deliveries, 0) as measured_deliveries,
  coalesce(purchase_metrics.on_time_deliveries, 0) as on_time_deliveries,
  coalesce(purchase_metrics.late_deliveries, 0) as late_deliveries,
  case when coalesce(purchase_metrics.measured_deliveries, 0) = 0 then null
    else round(100.0 * purchase_metrics.on_time_deliveries / purchase_metrics.measured_deliveries, 1) end as on_time_percentage,
  purchase_metrics.average_delivery_days, purchase_metrics.last_purchase_at,
  coalesce(incident_metrics.incident_count, 0) as incident_count,
  coalesce(incident_metrics.open_incident_count, 0) as open_incident_count,
  coalesce(return_metrics.completed_return_count, 0) as completed_return_count,
  coalesce(return_metrics.returned_quantity, 0) as returned_quantity,
  evaluation_metrics.latest_evaluation, evaluation_metrics.latest_evaluation_at
from public.suppliers supplier
left join purchase_metrics on purchase_metrics.organization_id = supplier.organization_id and purchase_metrics.supplier_id = supplier.id
left join incident_metrics on incident_metrics.organization_id = supplier.organization_id and incident_metrics.supplier_id = supplier.id
left join return_metrics on return_metrics.organization_id = supplier.organization_id and return_metrics.supplier_id = supplier.id
left join evaluation_metrics on evaluation_metrics.organization_id = supplier.organization_id and evaluation_metrics.supplier_id = supplier.id;

alter table public.supplier_evaluations enable row level security;
alter table public.supplier_incidents enable row level security;
alter table public.supplier_returns enable row level security;

create policy supplier_evaluations_select_authorized on public.supplier_evaluations
for select to authenticated using ((select public.has_organization_permission(organization_id, 'SUPPLIERS_VIEW')));
create policy supplier_incidents_select_authorized on public.supplier_incidents
for select to authenticated using ((select public.has_organization_permission(organization_id, 'SUPPLIERS_VIEW')));
create policy supplier_returns_select_authorized on public.supplier_returns
for select to authenticated using ((select public.has_organization_permission(organization_id, 'SUPPLIERS_VIEW')));

revoke all on table public.supplier_evaluations, public.supplier_incidents, public.supplier_returns from anon, authenticated;
grant select on table public.supplier_evaluations, public.supplier_incidents, public.supplier_returns to authenticated;
grant select, insert, update, delete on table public.supplier_evaluations, public.supplier_incidents, public.supplier_returns to service_role;

revoke all on table public.supplier_supplied_products, public.supplier_price_history, public.supplier_performance_summary from anon, authenticated;
grant select on table public.supplier_supplied_products, public.supplier_price_history, public.supplier_performance_summary to authenticated, service_role;

revoke all on function public.record_supplier_evaluation(jsonb) from public, anon, authenticated;
revoke all on function public.save_supplier_incident(jsonb) from public, anon, authenticated;
revoke all on function public.register_supplier_return(jsonb) from public, anon, authenticated;
revoke all on function public.complete_supplier_return(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_supplier_evaluation(jsonb) to authenticated;
grant execute on function public.save_supplier_incident(jsonb) to authenticated;
grant execute on function public.register_supplier_return(jsonb) to authenticated;
grant execute on function public.complete_supplier_return(uuid, uuid) to authenticated;
