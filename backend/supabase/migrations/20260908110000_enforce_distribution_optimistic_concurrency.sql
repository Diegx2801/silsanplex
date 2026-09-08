-- SILSANPLEX: concurrencia optimista para entregas de distribucion.

alter table public.distribution_deliveries
  add column if not exists lock_version bigint not null default 1,
  add constraint distribution_deliveries_lock_version_positive
    check (lock_version > 0);

alter function public.save_distribution_delivery(jsonb)
  rename to save_distribution_delivery_unchecked;

create or replace function public.lock_distribution_delivery_version(
  requested_organization_id uuid,
  requested_delivery_id uuid,
  requested_expected_lock_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_lock_version bigint;
begin
  select delivery.lock_version
    into current_lock_version
  from public.distribution_deliveries delivery
  where delivery.organization_id = requested_organization_id
    and delivery.id = requested_delivery_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_NOT_FOUND';
  end if;
  if requested_expected_lock_version is null then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_VERSION_REQUIRED';
  end if;
  if current_lock_version <> requested_expected_lock_version then
    raise exception using errcode = 'P0001', message = 'DISTRIBUTION_VERSION_CONFLICT';
  end if;
end;
$$;

create or replace function public.advance_distribution_delivery_version(
  requested_organization_id uuid,
  requested_delivery_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.distribution_deliveries delivery
  set
    lock_version = delivery.lock_version + 1,
    updated_by = (select auth.uid())
  where delivery.organization_id = requested_organization_id
    and delivery.id = requested_delivery_id;
$$;

create or replace function public.save_distribution_delivery(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_delivery_id uuid;
  expected_lock_version bigint;
  result_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'DISTRIBUTION_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_delivery_id := nullif(payload ->> 'id', '')::uuid;

  if actor_id is null
     or target_organization_id is null
     or not public.has_organization_permission(target_organization_id, 'DISTRIBUTION_MANAGE') then
    raise exception using errcode = '42501', message = 'DISTRIBUTION_FORBIDDEN';
  end if;

  if target_delivery_id is not null then
    expected_lock_version := nullif(payload ->> 'expected_lock_version', '')::bigint;
    perform public.lock_distribution_delivery_version(
      target_organization_id,
      target_delivery_id,
      expected_lock_version
    );
  end if;

  result_id := public.save_distribution_delivery_unchecked(payload);

  if target_delivery_id is not null then
    perform public.advance_distribution_delivery_version(
      target_organization_id,
      target_delivery_id
    );
  end if;

  return result_id;
end;
$$;

revoke all on function public.lock_distribution_delivery_version(uuid, uuid, bigint),
  public.advance_distribution_delivery_version(uuid, uuid),
  public.save_distribution_delivery_unchecked(jsonb),
  public.save_distribution_delivery(jsonb)
  from public, anon, authenticated;

grant execute on function public.save_distribution_delivery(jsonb) to authenticated;

comment on column public.distribution_deliveries.lock_version is
  'Version esperada para impedir sobrescrituras concurrentes de una entrega.';
