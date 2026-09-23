-- SILSANPLEX: integrar la modalidad de cumplimiento con el ciclo operativo.
--
-- Ventas conserva la decisión comercial (entrega o recojo) y la base de datos
-- proyecta el estado logístico cuando la venta o la entrega cambian. Así un
-- pedido atendido no desaparece de Distribución si todavía debe entregarse.

create or replace function public.sync_order_fulfillment_from_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_mode text;
  order_fulfillment_status text;
begin
  if new.status <> 'despachada' then
    return new;
  end if;

  select order_row.fulfillment_mode, order_row.fulfillment_status
    into order_mode, order_fulfillment_status
  from public.orders order_row
  where order_row.organization_id = new.organization_id
    and order_row.id = new.order_id
  for update;

  if not found then
    return new;
  end if;

  update public.orders
  set fulfillment_status = case
        when order_fulfillment_status in ('delivered', 'cancelled') then order_fulfillment_status
        when order_fulfillment_status = 'partially_fulfilled' then order_fulfillment_status
        when order_mode = 'pickup' then 'delivered'
        else 'dispatched'
      end,
      updated_at = pg_catalog.now()
  where organization_id = new.organization_id
    and id = new.order_id;

  return new;
end;
$$;

drop trigger if exists sales_sync_order_fulfillment
  on public.sales;

create trigger sales_sync_order_fulfillment
after insert or update of status on public.sales
for each row execute function public.sync_order_fulfillment_from_sale();

create or replace function public.sync_order_fulfillment_from_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_mode text;
  order_fulfillment_status text;
  next_fulfillment_status text;
begin
  select order_row.fulfillment_mode, order_row.fulfillment_status
    into order_mode, order_fulfillment_status
  from public.orders order_row
  where order_row.organization_id = new.organization_id
    and order_row.id = new.order_id
  for update;

  if not found then
    return new;
  end if;

  if new.modalidad = 'recojo_cliente' and order_mode = 'delivery' then
    if order_fulfillment_status not in ('pending', 'preparing') then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_FULFILLMENT_MODE_LOCKED';
    end if;
    update public.orders
    set fulfillment_mode = 'pickup', updated_at = pg_catalog.now()
    where organization_id = new.organization_id
      and id = new.order_id;
    order_mode := 'pickup';
  elsif new.modalidad <> 'recojo_cliente' and order_mode = 'pickup' then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_FULFILLMENT_MODE_MISMATCH';
  end if;

  next_fulfillment_status := case new.delivery_status
    when 'entregado' then 'delivered'
    when 'entrega_parcial' then 'partially_fulfilled'
    when 'en_curso' then 'dispatched'
    when 'en_destino' then 'dispatched'
    when 'preparando' then 'preparing'
    when 'programado' then case
      when order_fulfillment_status in ('dispatched', 'partially_fulfilled') then order_fulfillment_status
      else 'pending'
    end
    when 'reprogramado' then case
      when order_fulfillment_status in ('dispatched', 'partially_fulfilled') then order_fulfillment_status
      else 'pending'
    end
    when 'cancelado' then 'cancelled'
    else null
  end;

  if next_fulfillment_status is not null then
    update public.orders
    set fulfillment_status = case
          when order_fulfillment_status = 'cancelled' then 'cancelled'
          when order_fulfillment_status = 'delivered' and next_fulfillment_status <> 'cancelled' then 'delivered'
          else next_fulfillment_status
        end,
        updated_at = pg_catalog.now()
    where organization_id = new.organization_id
      and id = new.order_id;
  end if;

  return new;
end;
$$;

drop trigger if exists distribution_deliveries_sync_order_fulfillment
  on public.distribution_deliveries;

create trigger distribution_deliveries_sync_order_fulfillment
after insert or update of delivery_status, modalidad on public.distribution_deliveries
for each row execute function public.sync_order_fulfillment_from_delivery();

create or replace function public.sync_order_fulfillment_from_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelado' and old.status is distinct from new.status then
    update public.orders
    set fulfillment_status = 'cancelled', updated_at = pg_catalog.now()
    where organization_id = new.organization_id
      and id = new.id
      and fulfillment_status <> 'delivered';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_sync_order_fulfillment
  on public.orders;

create trigger orders_sync_order_fulfillment
after update of status on public.orders
for each row execute function public.sync_order_fulfillment_from_order_status();

-- Conversión idempotente de cotización a pedido con una modalidad explícita.
-- Se delega la creación al contrato existente para conservar todas sus
-- validaciones; la actualización de modalidad ocurre en la misma transacción.
create or replace function public.create_order_with_fulfillment(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_operation_key uuid;
  target_order_id uuid;
  existing_order public.orders%rowtype;
  existing_order_found boolean := false;
  requested_mode text;
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

  requested_mode := coalesce(nullif(btrim(payload ->> 'fulfillment_mode'), ''), 'delivery');
  if requested_mode not in ('delivery', 'pickup') then
    raise exception using errcode = '22023', message = 'ORDER_FULFILLMENT_MODE_INVALID';
  end if;

  target_operation_key := nullif(payload ->> 'operation_key', '')::uuid;
  if target_operation_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        target_organization_id::text || ':order-fulfillment-mode:' || target_operation_key::text,
        0
      )
    );

    select order_row.*
      into existing_order
    from public.orders order_row
    where order_row.organization_id = target_organization_id
      and order_row.operation_key = target_operation_key
    for update;

    existing_order_found := found;
  end if;

  target_order_id := public.create_order(payload);

  if existing_order_found then
    if existing_order.fulfillment_mode <> requested_mode then
      raise exception using errcode = 'P0001', message = 'ORDER_FULFILLMENT_MODE_CONFLICT';
    end if;
    return target_order_id;
  end if;

  update public.orders
  set fulfillment_mode = requested_mode,
      updated_at = pg_catalog.now(),
      updated_by = actor_id
  where organization_id = target_organization_id
    and id = target_order_id
    and status = 'confirmado'
    and fulfillment_status = 'pending';

  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_FULFILLMENT_MODE_NOT_SET';
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    new_values, metadata
  ) values (
    target_organization_id, actor_id, 'ORDER_FULFILLMENT_MODE_SET', 'order',
    target_order_id::text,
    jsonb_build_object('fulfillment_mode', requested_mode),
    jsonb_build_object('source', 'database_function')
  );

  return target_order_id;
end;
$$;

revoke all on function public.sync_order_fulfillment_from_sale() from public, anon, authenticated, service_role;
revoke all on function public.sync_order_fulfillment_from_delivery() from public, anon, authenticated, service_role;
revoke all on function public.sync_order_fulfillment_from_order_status() from public, anon, authenticated, service_role;
revoke all on function public.create_order_with_fulfillment(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_order_with_fulfillment(jsonb) to authenticated;

comment on function public.create_order_with_fulfillment(jsonb) is
  'Crea un pedido persistente con modalidad delivery o pickup sin duplicar operaciones.';
comment on function public.sync_order_fulfillment_from_sale() is
  'Proyecta el despacho de la venta sobre el estado logístico del pedido.';
comment on function public.sync_order_fulfillment_from_delivery() is
  'Proyecta las transiciones de distribución sobre el estado logístico del pedido.';
