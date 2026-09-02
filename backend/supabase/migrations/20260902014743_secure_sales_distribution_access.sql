-- ============================================================
-- SILSANPLEX: seguridad de acceso para Ventas y Distribución
-- ============================================================

-- ------------------------------------------------------------
-- 1. Capacidades y compatibilidad de roles
-- ------------------------------------------------------------

insert into public.permissions (code, name, description)
values
  ('SALES_VIEW', 'Consultar ventas', 'Consultar cotizaciones, pedidos y ventas persistentes.'),
  ('SALES_MANAGE', 'Administrar ventas', 'Crear pedidos y ventas, modificar o cancelar pedidos.')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
values
  ('ADMIN', 'SALES_VIEW'),
  ('ADMIN', 'SALES_MANAGE'),
  ('GERENCIA', 'SALES_VIEW'),
  ('VENTAS', 'SALES_VIEW'),
  ('VENTAS', 'SALES_MANAGE'),
  -- LOGISTICA necesita consultar pedidos/ventas para preparar y despachar;
  -- no recibe SALES_MANAGE. Su capacidad operativa continúa siendo
  -- DISTRIBUTION_MANAGE + INVENTORY_MANAGE.
  ('LOGISTICA', 'SALES_VIEW')
on conflict (role_code, permission_code) do nothing;

-- ------------------------------------------------------------
-- 2. Lectura de datos comerciales con alcance explícito
-- ------------------------------------------------------------

drop policy if exists orders_select_member on public.orders;
drop policy if exists order_items_select_member on public.order_items;
drop policy if exists sales_select_member on public.sales;
drop policy if exists sale_items_select_member on public.sale_items;

create policy orders_select_sales_or_distribution on public.orders
  for select to authenticated
  using (
    (select public.has_organization_permission(organization_id, 'SALES_VIEW'))
    or
    (select public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'))
  );

create policy order_items_select_sales_or_distribution on public.order_items
  for select to authenticated
  using (
    (select public.has_organization_permission(organization_id, 'SALES_VIEW'))
    or
    (select public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'))
  );

create policy sales_select_sales_or_distribution on public.sales
  for select to authenticated
  using (
    (select public.has_organization_permission(organization_id, 'SALES_VIEW'))
    or
    (select public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'))
  );

create policy sale_items_select_sales_or_distribution on public.sale_items
  for select to authenticated
  using (
    (select public.has_organization_permission(organization_id, 'SALES_VIEW'))
    or
    (select public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'))
  );

-- ------------------------------------------------------------
-- 3. Wrappers de autorización para RPCs comerciales
-- ------------------------------------------------------------

-- Las implementaciones transaccionales SECURITY DEFINER se conservan como
-- primitivas internas. El endpoint público valida el permiso antes de
-- delegar, incluso cuando la operación termina siendo un retry idempotente.

alter function public.create_order(jsonb)
  rename to create_order_unchecked;

create function public.create_order(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
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

  return public.create_order_unchecked(payload);
end;
$$;

alter function public.create_order_unchecked(jsonb)
  owner to postgres;
revoke all on function public.create_order_unchecked(jsonb)
  from public, anon, authenticated, service_role;

alter function public.create_sale_from_order(uuid, uuid, jsonb)
  rename to create_sale_from_order_unchecked;

create function public.create_sale_from_order(
  requested_organization_id uuid,
  requested_order_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
     or requested_organization_id is null
     or not public.has_organization_permission(requested_organization_id, 'SALES_MANAGE') then
    raise exception using errcode = '42501', message = 'SALE_FORBIDDEN';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'SALE_PAYLOAD_INVALID';
  end if;

  return public.create_sale_from_order_unchecked(
    requested_organization_id,
    requested_order_id,
    payload
  );
end;
$$;

alter function public.create_sale_from_order_unchecked(uuid, uuid, jsonb)
  owner to postgres;
revoke all on function public.create_sale_from_order_unchecked(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

alter function public.update_order_quantities(jsonb)
  rename to update_order_quantities_unchecked;

create function public.update_order_quantities(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
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

  return public.update_order_quantities_unchecked(payload);
end;
$$;

alter function public.update_order_quantities_unchecked(jsonb)
  owner to postgres;
revoke all on function public.update_order_quantities_unchecked(jsonb)
  from public, anon, authenticated, service_role;

alter function public.cancel_order(jsonb)
  rename to cancel_order_unchecked;

create function public.cancel_order(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
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

  return public.cancel_order_unchecked(payload);
end;
$$;

alter function public.cancel_order_unchecked(jsonb)
  owner to postgres;
revoke all on function public.cancel_order_unchecked(jsonb)
  from public, anon, authenticated, service_role;

alter function public.dispatch_order_from_reservations(jsonb)
  rename to dispatch_order_from_reservations_unchecked;

create function public.dispatch_order_from_reservations(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_DISPATCH_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  if target_organization_id is null
     or not public.has_organization_permission(target_organization_id, 'DISTRIBUTION_MANAGE')
     or not public.has_organization_permission(target_organization_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'ORDER_DISPATCH_FORBIDDEN';
  end if;

  return public.dispatch_order_from_reservations_unchecked(payload);
end;
$$;

alter function public.dispatch_order_from_reservations_unchecked(jsonb)
  owner to postgres;
revoke all on function public.dispatch_order_from_reservations_unchecked(jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.create_order(jsonb),
  public.create_sale_from_order(uuid, uuid, jsonb),
  public.update_order_quantities(jsonb),
  public.cancel_order(jsonb),
  public.dispatch_order_from_reservations(jsonb)
  from public, anon, authenticated;

grant execute on function public.create_order(jsonb),
  public.create_sale_from_order(uuid, uuid, jsonb),
  public.update_order_quantities(jsonb),
  public.cancel_order(jsonb),
  public.dispatch_order_from_reservations(jsonb)
  to authenticated;

comment on function public.create_order(jsonb) is
  'Crea un pedido persistente solo con SALES_MANAGE; delega la transaccion a la primitiva interna.';
comment on function public.create_sale_from_order(uuid, uuid, jsonb) is
  'Crea una venta persistente solo con SALES_MANAGE; delega la transaccion a la primitiva interna.';
comment on function public.update_order_quantities(jsonb) is
  'Modifica un pedido persistente solo con SALES_MANAGE.';
comment on function public.cancel_order(jsonb) is
  'Cancela un pedido persistente solo con SALES_MANAGE.';
comment on function public.dispatch_order_from_reservations(jsonb) is
  'Despacha una venta solo con DISTRIBUTION_MANAGE e INVENTORY_MANAGE.';
