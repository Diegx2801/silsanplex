-- Solo las capacidades operativas declaradas pueden asignarse directamente.
-- Los permisos administrativos o internos futuros quedan cerrados por defecto.
alter table public.permissions
  add column if not exists is_directly_assignable boolean not null default false;

update public.permissions
set is_directly_assignable = code = any(array[
  'PRODUCTS_VIEW', 'PRODUCTS_MANAGE',
  'INVENTORY_VIEW', 'INVENTORY_MANAGE',
  'SUPPLIERS_VIEW', 'SUPPLIERS_MANAGE',
  'PURCHASES_VIEW', 'PURCHASES_MANAGE', 'PURCHASES_RECEIVE',
  'CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE', 'CUSTOMERS_EXPORT',
  'REPAIRS_VIEW', 'REPAIRS_CREATE', 'REPAIRS_UPDATE', 'REPAIRS_ASSIGN',
  'REPAIRS_CHANGE_STATUS', 'REPAIRS_APPROVE_QUOTE', 'REPAIRS_USE_PARTS',
  'REPAIRS_DELIVER', 'REPAIRS_PERFORM_TECHNICAL',
  'SALES_VIEW', 'SALES_MANAGE',
  'DISTRIBUTION_VIEW', 'DISTRIBUTION_MANAGE'
]::text[]);

comment on column public.permissions.is_directly_assignable is
  'Indica si un administrador puede conceder la capacidad directamente a un usuario operativo.';

create or replace function public.normalize_operational_permission_codes(
  requested_permission_codes text[]
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_codes text[];
begin
  with recursive requested(code) as (
    select distinct upper(btrim(value))
    from unnest(coalesce(requested_permission_codes, '{}'::text[])) value
    where btrim(value) <> ''
  ), expanded(code) as (
    select code from requested
    union
    select dependency.required_permission_code
    from expanded
    join public.permission_dependencies dependency
      on dependency.permission_code = expanded.code
  )
  select coalesce(array_agg(distinct expanded.code order by expanded.code), '{}'::text[])
  into normalized_codes
  from expanded;

  if exists (
    select 1
    from unnest(normalized_codes) requested(code)
    left join public.permissions permission
      on permission.code = requested.code
     and permission.is_active
     and permission.is_directly_assignable
    where permission.code is null
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_OR_INACTIVE_PERMISSION';
  end if;

  return normalized_codes;
end;
$$;

revoke all on function public.normalize_operational_permission_codes(text[])
  from public, anon, authenticated;
grant execute on function public.normalize_operational_permission_codes(text[])
  to service_role;
