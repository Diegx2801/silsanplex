-- Dependencias funcionales entre módulos. PostgreSQL es la autoridad: el
-- frontend puede reflejarlas, pero no inventar ni omitir capacidades requeridas.
insert into public.permission_dependencies(permission_code, required_permission_code)
values
  ('PURCHASES_VIEW', 'PRODUCTS_VIEW'),
  ('PURCHASES_VIEW', 'SUPPLIERS_VIEW'),
  ('PURCHASES_VIEW', 'INVENTORY_VIEW'),
  ('PURCHASES_RECEIVE', 'PURCHASES_VIEW'),
  ('PURCHASES_RECEIVE', 'INVENTORY_MANAGE'),
  ('SALES_VIEW', 'PRODUCTS_VIEW'),
  ('SALES_VIEW', 'CUSTOMERS_VIEW'),
  ('SALES_VIEW', 'INVENTORY_VIEW'),
  ('DISTRIBUTION_VIEW', 'SALES_VIEW'),
  ('DISTRIBUTION_VIEW', 'INVENTORY_VIEW'),
  ('REPAIRS_USE_PARTS', 'INVENTORY_VIEW')
on conflict do nothing;

create or replace function public.repair_technician_is_active(
  requested_organization_id uuid,
  requested_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.user_has_organization_permission(
    requested_organization_id,
    requested_user_id,
    'REPAIRS_PERFORM_TECHNICAL'
  );
$$;

revoke all on function public.repair_technician_is_active(uuid,uuid) from public,anon;
grant execute on function public.repair_technician_is_active(uuid,uuid) to authenticated;
