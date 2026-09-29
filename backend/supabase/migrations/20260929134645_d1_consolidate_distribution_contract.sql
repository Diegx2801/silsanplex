-- D1: consolidar el contrato persistente de Distribucion sin mover inventario.
--
-- Este cambio conserva una direccion historica por entrega. El snapshot del
-- pedido es solo el destino predeterminado: una entrega puede persistir un
-- destino alternativo explicitamente elegido para esa entrega.

do $$
declare
  blockers text := '';
  sample text;
begin
  -- La migracion historica 20260903000000 podia omitir estas FKs cuando
  -- encontro datos incompatibles. No continuamos con una garantia parcial.
  select string_agg(
    format('delivery=%s organization=%s order=%s', candidate.id, candidate.organization_id, candidate.order_id),
    '; ' order by candidate.id
  )
  into sample
  from (
    select delivery.id, delivery.organization_id, delivery.order_id
    from public.distribution_deliveries delivery
    left join public.orders order_row
      on order_row.organization_id = delivery.organization_id
     and order_row.id = delivery.order_id
    where order_row.id is null
    order by delivery.id
    limit 20
  ) candidate;
  if sample is not null then
    blockers := blockers || E'\nPedidos de entrega no encontrados: ' || sample;
  end if;

  select string_agg(
    format('delivery=%s organization=%s sale=%s', candidate.id, candidate.organization_id, candidate.sale_id),
    '; ' order by candidate.id
  )
  into sample
  from (
    select delivery.id, delivery.organization_id, delivery.sale_id
    from public.distribution_deliveries delivery
    left join public.sales sale_row
      on sale_row.organization_id = delivery.organization_id
     and sale_row.id = delivery.sale_id
    where delivery.sale_id is not null
      and sale_row.id is null
    order by delivery.id
    limit 20
  ) candidate;
  if sample is not null then
    blockers := blockers || E'\nVentas de entrega no encontradas: ' || sample;
  end if;

  select string_agg(
    format(
      'delivery=%s order=%s sale=%s sale_order=%s order_customer=%s sale_customer=%s',
      candidate.id, candidate.order_id, candidate.sale_id,
      candidate.sale_order_id, candidate.order_customer_id, candidate.sale_customer_id
    ),
    '; ' order by candidate.id
  )
  into sample
  from (
    select delivery.id,
      delivery.order_id,
      delivery.sale_id,
      sale_row.order_id as sale_order_id,
      order_row.customer_id as order_customer_id,
      sale_row.customer_id as sale_customer_id
    from public.distribution_deliveries delivery
    join public.orders order_row
      on order_row.organization_id = delivery.organization_id
     and order_row.id = delivery.order_id
    join public.sales sale_row
      on sale_row.organization_id = delivery.organization_id
     and sale_row.id = delivery.sale_id
    where delivery.sale_id is not null
      and (
        sale_row.order_id is distinct from delivery.order_id
        or sale_row.customer_id is distinct from order_row.customer_id
      )
    order by delivery.id
    limit 20
  ) candidate;
  if sample is not null then
    blockers := blockers || E'\nVenta y pedido de entrega incoherentes: ' || sample;
  end if;

  select string_agg(
    format(
      'allocation delivery=%s delivery_order=%s allocation_order=%s line=%s',
      candidate.delivery_id, candidate.delivery_order_id,
      candidate.allocation_order_id, candidate.order_line_id
    ),
    '; ' order by candidate.delivery_id, candidate.order_line_id
  )
  into sample
  from (
    select allocation.delivery_id,
      delivery.order_id as delivery_order_id,
      allocation.order_id as allocation_order_id,
      allocation.order_line_id
    from public.distribution_delivery_items allocation
    join public.distribution_deliveries delivery
      on delivery.organization_id = allocation.organization_id
     and delivery.id = allocation.delivery_id
    where allocation.order_id is distinct from delivery.order_id
    order by allocation.delivery_id, allocation.order_line_id
    limit 20
  ) candidate;
  if sample is not null then
    blockers := blockers || E'\nAsignaciones vinculadas a otro pedido: ' || sample;
  end if;

  select string_agg(
    format(
      'outcome_line=%s outcome=%s delivery=%s delivery_order=%s line_order=%s line=%s',
      candidate.id, candidate.outcome_id, candidate.delivery_id,
      candidate.delivery_order_id, candidate.line_order_id, candidate.order_line_id
    ),
    '; ' order by candidate.id
  )
  into sample
  from (
    select outcome_line.id,
      outcome_line.outcome_id,
      outcome_line.order_id as line_order_id,
      outcome_line.order_line_id,
      outcome.delivery_id,
      delivery.order_id as delivery_order_id
    from public.distribution_delivery_outcome_lines outcome_line
    join public.distribution_delivery_outcomes outcome
      on outcome.organization_id = outcome_line.organization_id
     and outcome.id = outcome_line.outcome_id
    join public.distribution_deliveries delivery
      on delivery.organization_id = outcome.organization_id
     and delivery.id = outcome.delivery_id
    where outcome_line.order_id is distinct from delivery.order_id
    order by outcome_line.id
    limit 20
  ) candidate;
  if sample is not null then
    blockers := blockers || E'\nResultado de entrega vinculado a otro pedido: ' || sample;
  end if;

  select string_agg(
    format('delivery=%s last_outcome=%s', candidate.id, candidate.last_outcome_id),
    '; ' order by candidate.id
  )
  into sample
  from (
    select delivery.id, delivery.last_outcome_id
    from public.distribution_deliveries delivery
    left join public.distribution_delivery_outcomes outcome
      on outcome.organization_id = delivery.organization_id
     and outcome.id = delivery.last_outcome_id
    where delivery.last_outcome_id is not null
      and outcome.id is null
    order by delivery.id
    limit 20
  ) candidate;
  if sample is not null then
    blockers := blockers || E'\nUltimos resultados de entrega no encontrados: ' || sample;
  end if;

  if blockers <> '' then
    raise exception using
      errcode = 'P0001',
      message = 'D1_DISTRIBUTION_LEGACY_DATA_INCOMPATIBLE',
      detail = substr(blockers, 2, 8000),
      hint = 'Corregir o archivar explicitamente los registros reportados y volver a ejecutar la migracion. No se ejecutan DELETE ni UPDATE automaticos.';
  end if;
end;
$$;

do $$
declare
  blank_count bigint;
  legacy_without_sale bigint;
  sample text;
begin
  select count(*)
    into blank_count
  from public.distribution_deliveries delivery
  where char_length(btrim(coalesce(delivery.direction, ''))) = 0;

  select string_agg(
    format('delivery=%s organization=%s order=%s', delivery.id, delivery.organization_id, delivery.order_id),
    '; ' order by delivery.id
  )
  into sample
  from (
    select delivery.id, delivery.organization_id, delivery.order_id
    from public.distribution_deliveries delivery
    where char_length(btrim(coalesce(delivery.direction, ''))) = 0
    order by delivery.id
    limit 20
  ) delivery;

  if blank_count > 0 then
    raise warning 'D1: % entregas conservan direction vacia; no se realiza backfill automatico. Muestra: %', blank_count, sample;
  end if;

  select count(*)
    into legacy_without_sale
  from public.distribution_deliveries delivery
  where delivery.sale_id is null;

  if legacy_without_sale > 0 then
    raise warning 'D1: % entregas no tienen sale_id. Se conservan como historico y no se corrigen automaticamente.', legacy_without_sale;
  end if;
end;
$$;

do $$
declare
  constraint_valid boolean;
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'distribution_deliveries_order_same_organization'
      and conrelid = 'public.distribution_deliveries'::regclass
  ) then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_order_same_organization
      foreign key (organization_id, order_id)
      references public.orders (organization_id, id)
      on delete restrict;
  else
    select convalidated into constraint_valid
    from pg_constraint
    where conname = 'distribution_deliveries_order_same_organization'
      and conrelid = 'public.distribution_deliveries'::regclass;
    if not constraint_valid then
      alter table public.distribution_deliveries
        validate constraint distribution_deliveries_order_same_organization;
    end if;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'distribution_deliveries_sale_same_organization'
      and conrelid = 'public.distribution_deliveries'::regclass
  ) then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_sale_same_organization
      foreign key (organization_id, sale_id)
      references public.sales (organization_id, id)
      on delete restrict;
  else
    select convalidated into constraint_valid
    from pg_constraint
    where conname = 'distribution_deliveries_sale_same_organization'
      and conrelid = 'public.distribution_deliveries'::regclass;
    if not constraint_valid then
      alter table public.distribution_deliveries
        validate constraint distribution_deliveries_sale_same_organization;
    end if;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'distribution_deliveries_organization_id_order_id_key'
      and conrelid = 'public.distribution_deliveries'::regclass
  ) then
    alter table public.distribution_deliveries
      add constraint distribution_deliveries_organization_id_order_id_key
      unique (organization_id, id, order_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'distribution_delivery_items_delivery_order_same_organization'
      and conrelid = 'public.distribution_delivery_items'::regclass
  ) then
    alter table public.distribution_delivery_items
      add constraint distribution_delivery_items_delivery_order_same_organization
      foreign key (organization_id, delivery_id, order_id)
      references public.distribution_deliveries (organization_id, id, order_id)
      on delete restrict;
  end if;
end;
$$;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select * from (values
      ('distribution_deliveries', 'distribution_deliveries_order_same_organization'),
      ('distribution_deliveries', 'distribution_deliveries_sale_same_organization'),
      ('distribution_delivery_items', 'distribution_delivery_items_delivery_same_org'),
      ('distribution_delivery_items', 'distribution_delivery_items_order_line_same_org'),
      ('distribution_delivery_items', 'distribution_delivery_items_delivery_order_same_organization'),
      ('distribution_delivery_outcomes', 'distribution_delivery_outcomes_delivery_same_org'),
      ('distribution_delivery_outcome_lines', 'distribution_delivery_outcome_lines_outcome_same_org'),
      ('distribution_delivery_outcome_lines', 'distribution_delivery_outcome_lines_order_item_same_org'),
      ('distribution_deliveries', 'distribution_deliveries_last_outcome_same_org')
    ) as constraints(table_name, constraint_name)
  loop
    if exists (
      select 1
      from pg_constraint
      where conrelid = format('public.%s', constraint_row.table_name)::regclass
        and conname = constraint_row.constraint_name
        and not convalidated
    ) then
      execute format(
        'alter table public.%I validate constraint %I',
        constraint_row.table_name, constraint_row.constraint_name
      );
    end if;
  end loop;
end;
$$;

create or replace function public.distribution_direction_from_order_snapshot(
  snapshot jsonb
)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(coalesce(snapshot ->> 'address_line', ''));
$$;

comment on column public.distribution_deliveries.direction is
  'Snapshot historico del destino concreto de esta entrega. Si el payload no lo especifica, el RPC usa orders.delivery_address_snapshot; un destino alternativo explicito tambien es valido.';

create or replace function public.validate_distribution_delivery_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_customer_id uuid;
  sale_order_id uuid;
  sale_customer_id uuid;
begin
  if tg_op = 'UPDATE'
    and (
      new.organization_id is distinct from old.organization_id
      or new.order_id is distinct from old.order_id
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'DISTRIBUTION_ORDER_IMMUTABLE';
  end if;

  select order_row.customer_id
    into order_customer_id
  from public.orders order_row
  where order_row.organization_id = new.organization_id
    and order_row.id = new.order_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'DISTRIBUTION_ORDER_NOT_FOUND';
  end if;

  if new.sale_id is not null then
    select sale_row.order_id, sale_row.customer_id
      into sale_order_id, sale_customer_id
    from public.sales sale_row
    where sale_row.organization_id = new.organization_id
      and sale_row.id = new.sale_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'DISTRIBUTION_SALE_NOT_FOUND';
    end if;
    if sale_order_id is distinct from new.order_id then
      raise exception using
        errcode = 'P0001',
        message = 'DISTRIBUTION_SALE_MISMATCH';
    end if;
    if sale_customer_id is distinct from order_customer_id then
      raise exception using
        errcode = 'P0001',
        message = 'DISTRIBUTION_SALE_CUSTOMER_MISMATCH';
    end if;
  end if;

  if tg_op = 'INSERT'
    and pg_catalog.char_length(pg_catalog.btrim(coalesce(new.direction, ''))) = 0 then
    new.direction := public.distribution_direction_from_order_snapshot(
      (select order_row.delivery_address_snapshot
       from public.orders order_row
       where order_row.organization_id = new.organization_id
         and order_row.id = new.order_id)
    );
  end if;

  return new;
end;
$$;

create or replace function public.preserve_distribution_delivery_snapshots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.direction is distinct from old.direction then
      raise exception using
        errcode = 'P0001',
        message = 'DISTRIBUTION_DIRECTION_IMMUTABLE';
    end if;

    -- customer_name es tambien un snapshot. Una actualizacion posterior del
    -- maestro de clientes no debe reescribir historicos al guardar estado.
    new.customer_name := old.customer_name;
  end if;
  return new;
end;
$$;

drop trigger if exists distribution_deliveries_validate_relationship
  on public.distribution_deliveries;
create trigger distribution_deliveries_validate_relationship
before insert or update of organization_id, order_id, sale_id, direction
on public.distribution_deliveries
for each row execute function public.validate_distribution_delivery_relationship();

drop trigger if exists distribution_deliveries_preserve_snapshots
  on public.distribution_deliveries;
create trigger distribution_deliveries_preserve_snapshots
before update of direction, customer_name
on public.distribution_deliveries
for each row execute function public.preserve_distribution_delivery_snapshots();

create or replace function public.validate_distribution_delivery_outcome_line_contract()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_order_id uuid;
begin
  select delivery.order_id
    into delivery_order_id
  from public.distribution_delivery_outcomes outcome
  join public.distribution_deliveries delivery
    on delivery.organization_id = outcome.organization_id
   and delivery.id = outcome.delivery_id
  where outcome.organization_id = new.organization_id
    and outcome.id = new.outcome_id;

  if not found or delivery_order_id is distinct from new.order_id then
    raise exception using
      errcode = 'P0001',
      message = 'DISTRIBUTION_OUTCOME_ORDER_MISMATCH';
  end if;
  return new;
end;
$$;

drop trigger if exists distribution_delivery_outcome_lines_validate_contract
  on public.distribution_delivery_outcome_lines;
create trigger distribution_delivery_outcome_lines_validate_contract
before insert or update of organization_id, outcome_id, order_id, order_line_id
on public.distribution_delivery_outcome_lines
for each row execute function public.validate_distribution_delivery_outcome_line_contract();

create or replace function public.prepare_distribution_delivery_payload(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  target_delivery_id uuid;
  target_order_id uuid;
  target_sale_id uuid;
  existing_order_id uuid;
  existing_direction text;
  explicit_direction text;
  order_snapshot jsonb;
  snapshot_direction text;
  sale_order_id uuid;
  sale_customer_id uuid;
  order_customer_id uuid;
begin
  if payload is null or pg_catalog.jsonb_typeof(payload) <> 'object' then
    return payload;
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_delivery_id := nullif(payload ->> 'id', '')::uuid;
  target_order_id := nullif(payload ->> 'order_id', '')::uuid;
  target_sale_id := nullif(payload ->> 'sale_id', '')::uuid;
  explicit_direction := pg_catalog.btrim(coalesce(payload ->> 'direction', ''));

  -- Existing deliveries keep their own historical destination. A legacy row
  -- with an empty direction stays empty; it is never backfilled silently.
  if target_delivery_id is not null then
    select delivery.order_id, delivery.direction
      into existing_order_id, existing_direction
    from public.distribution_deliveries delivery
    where delivery.organization_id = target_organization_id
      and delivery.id = target_delivery_id
    for update;

    if found and existing_order_id is not distinct from target_order_id then
      if pg_catalog.char_length(pg_catalog.btrim(coalesce(existing_direction, ''))) > 0
        and explicit_direction <> ''
        and explicit_direction is distinct from pg_catalog.btrim(existing_direction) then
        raise exception using
          errcode = 'P0001',
          message = 'DISTRIBUTION_DIRECTION_IMMUTABLE';
      end if;

      return pg_catalog.jsonb_set(
        payload,
        array['direction'],
        to_jsonb(coalesce(existing_direction, '')),
        true
      );
    end if;

    -- Let the canonical persistence function report NOT_FOUND or ORDER_MISMATCH.
    return payload;
  end if;

  -- An explicit non-empty value is an alternate destination for this one
  -- shipment. It is not compared to the order snapshot.
  if explicit_direction <> '' then
    payload := pg_catalog.jsonb_set(
      payload,
      array['direction'],
      to_jsonb(explicit_direction),
      true
    );
  else
    select order_row.customer_id, order_row.delivery_address_snapshot
      into order_customer_id, order_snapshot
    from public.orders order_row
    where order_row.organization_id = target_organization_id
      and order_row.id = target_order_id;

    if found then
      snapshot_direction := public.distribution_direction_from_order_snapshot(order_snapshot);
      if snapshot_direction = '' then
        raise exception using
          errcode = 'P0001',
          message = 'DISTRIBUTION_ORDER_DESTINATION_SNAPSHOT_REQUIRED';
      end if;

      payload := pg_catalog.jsonb_set(
        payload,
        array['direction'],
        to_jsonb(snapshot_direction),
        true
      );
    end if;
  end if;

  -- Validate an explicitly supplied sale before the legacy canonical function
  -- persists the row. This makes a wrong sale/order association explicit.
  if target_sale_id is not null and target_order_id is not null then
    select sale_row.order_id, sale_row.customer_id
      into sale_order_id, sale_customer_id
    from public.sales sale_row
    where sale_row.organization_id = target_organization_id
      and sale_row.id = target_sale_id;

    if found then
      if sale_order_id is distinct from target_order_id then
        raise exception using
          errcode = 'P0001',
          message = 'DISTRIBUTION_SALE_MISMATCH';
      end if;

      select order_row.customer_id
        into order_customer_id
      from public.orders order_row
      where order_row.organization_id = target_organization_id
        and order_row.id = target_order_id;

      if order_customer_id is not null
        and sale_customer_id is distinct from order_customer_id then
        raise exception using
          errcode = 'P0001',
          message = 'DISTRIBUTION_SALE_CUSTOMER_MISMATCH';
      end if;
    end if;
  end if;

  return payload;
end;
$$;

-- The previous final RPC remains the canonical persistence implementation.
-- D1 wraps it only to complete the destination contract before the existing
-- optimistic-lock/idempotency/allocation logic runs.
alter function public.save_distribution_delivery(jsonb)
  rename to save_distribution_delivery_contract_internal;

create or replace function public.save_distribution_delivery(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
begin
  if payload is null or pg_catalog.jsonb_typeof(payload) <> 'object' then
    return public.save_distribution_delivery_contract_internal(payload);
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  if actor_id is null
    or target_organization_id is null
    or not public.has_organization_permission(target_organization_id, 'DISTRIBUTION_MANAGE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  return public.save_distribution_delivery_contract_internal(
    public.prepare_distribution_delivery_payload(payload)
  );
end;
$$;

revoke all on function public.save_distribution_delivery_contract_internal(jsonb),
  public.prepare_distribution_delivery_payload(jsonb),
  public.distribution_direction_from_order_snapshot(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.save_distribution_delivery(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_distribution_delivery(jsonb) to authenticated;

comment on function public.save_distribution_delivery(jsonb) is
  'Guarda una entrega persistente. Usa el snapshot del pedido como destino predeterminado o conserva un destino alternativo explicito; no genera movimientos de inventario.';

revoke all on function public.validate_distribution_delivery_relationship(),
  public.preserve_distribution_delivery_snapshots(),
  public.validate_distribution_delivery_outcome_line_contract()
  from public, anon, authenticated, service_role;
