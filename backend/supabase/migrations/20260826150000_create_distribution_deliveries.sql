-- ============================================================
-- SILSANPLEX: programación y seguimiento de entregas
-- ============================================================

insert into public.permissions (code, name, description)
values
  ('DISTRIBUTION_VIEW', 'Consultar distribución', 'Consultar entregas y su seguimiento.'),
  ('DISTRIBUTION_MANAGE', 'Administrar distribución', 'Programar, editar y actualizar entregas.')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
values
  ('ADMIN', 'DISTRIBUTION_VIEW'),
  ('ADMIN', 'DISTRIBUTION_MANAGE'),
  ('LOGISTICA', 'DISTRIBUTION_VIEW'),
  ('LOGISTICA', 'DISTRIBUTION_MANAGE')
on conflict (role_code, permission_code) do nothing;

create table public.distribution_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_id uuid not null,
  order_number text not null,
  customer_name text not null,
  issue_date date not null,
  delivery_date date not null,
  guide_number text not null,
  transport_type text not null,
  tracking_status text not null default 'en_curso',
  observations text not null default '',
  order_items jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint distribution_deliveries_order_number_length
    check (char_length(btrim(order_number)) between 1 and 30),
  constraint distribution_deliveries_customer_name_length
    check (char_length(btrim(customer_name)) between 2 and 160),
  constraint distribution_deliveries_guide_number_length
    check (char_length(btrim(guide_number)) between 1 and 40),
  constraint distribution_deliveries_transport_valid
    check (transport_type in ('interno', 'externo')),
  constraint distribution_deliveries_tracking_valid
    check (tracking_status in ('en_curso', 'en_destino')),
  constraint distribution_deliveries_observations_length
    check (char_length(observations) <= 500),
  constraint distribution_deliveries_items_valid
    check (jsonb_typeof(order_items) = 'array' and jsonb_array_length(order_items) > 0)
);

create unique index distribution_deliveries_organization_guide_unique
  on public.distribution_deliveries (organization_id, guide_number);
create unique index distribution_deliveries_organization_order_unique
  on public.distribution_deliveries (organization_id, order_id);
create index distribution_deliveries_organization_delivery_date_idx
  on public.distribution_deliveries (organization_id, delivery_date, id);

create trigger distribution_deliveries_set_updated_at
before update on public.distribution_deliveries
for each row execute function public.set_updated_at();

create or replace function public.save_distribution_delivery(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid := (payload ->> 'organization_id')::uuid;
  target_delivery_id uuid := nullif(payload ->> 'id', '')::uuid;
begin
  if actor_id is null or not public.has_organization_permission(target_organization_id, 'DISTRIBUTION_MANAGE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_ITEMS_REQUIRED';
  end if;

  if target_delivery_id is null then
    insert into public.distribution_deliveries (
      organization_id, order_id, order_number, customer_name, issue_date,
      delivery_date, guide_number, transport_type, tracking_status,
      observations, order_items, created_by, updated_by
    ) values (
      target_organization_id, (payload ->> 'order_id')::uuid,
      btrim(payload ->> 'order_number'), btrim(payload ->> 'customer_name'),
      (payload ->> 'issue_date')::date, (payload ->> 'delivery_date')::date,
      upper(btrim(payload ->> 'guide_number')), payload ->> 'transport_type',
      coalesce(nullif(payload ->> 'tracking_status', ''), 'en_curso'),
      coalesce(payload ->> 'observations', ''), payload -> 'items', actor_id, actor_id
    ) returning id into target_delivery_id;
  else
    perform 1
    from public.distribution_deliveries
    where id = target_delivery_id
      and organization_id = target_organization_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'DISTRIBUTION_NOT_FOUND';
    end if;

    update public.distribution_deliveries
    set
      delivery_date = (payload ->> 'delivery_date')::date,
      guide_number = upper(btrim(payload ->> 'guide_number')),
      transport_type = payload ->> 'transport_type',
      tracking_status = coalesce(nullif(payload ->> 'tracking_status', ''), 'en_curso'),
      observations = coalesce(payload ->> 'observations', ''),
      order_items = payload -> 'items',
      updated_by = actor_id
    where id = target_delivery_id;
  end if;

  return target_delivery_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'DISTRIBUTION_DUPLICATE_GUIDE_OR_ORDER';
end;
$$;

revoke all on table public.distribution_deliveries from anon, authenticated;
grant select on table public.distribution_deliveries to authenticated;
alter table public.distribution_deliveries enable row level security;

create policy distribution_deliveries_select_policy
  on public.distribution_deliveries
  for select to authenticated
  using (public.has_organization_permission(organization_id, 'DISTRIBUTION_VIEW'));

revoke all on function public.save_distribution_delivery(jsonb)
  from public, anon, authenticated;
grant execute on function public.save_distribution_delivery(jsonb) to authenticated;