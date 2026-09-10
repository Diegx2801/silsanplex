-- Evita recalcular toda la cadena de autorización por cada fila de las vistas de
-- inventario. La subconsulta escalar usada por las políticas se convierte en un
-- InitPlan: las organizaciones autorizadas se resuelven una vez por sentencia.

create function public.current_user_organization_ids_with_permission(
  requested_permission_code text
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_agg(membership.organization_id order by membership.organization_id),
    '{}'::uuid[]
  )
  from public.organization_memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
   and profile.is_active
  join public.organizations organization
    on organization.id = membership.organization_id
   and organization.is_active
  join public.permissions permission
    on permission.code = requested_permission_code
   and permission.is_active
  where membership.user_id = auth.uid()
    and membership.is_active
    and (
      exists (
        select 1
        from public.organization_user_permissions direct_permission
        where direct_permission.organization_id = membership.organization_id
          and direct_permission.user_id = membership.user_id
          and direct_permission.permission_code = permission.code
      )
      or exists (
        select 1
        from public.user_roles user_role
        join public.roles role
          on role.code = user_role.role_code
         and role.is_active
        join public.role_permissions role_permission
          on role_permission.role_code = role.code
         and role_permission.permission_code = permission.code
        where user_role.organization_id = membership.organization_id
          and user_role.user_id = membership.user_id
      )
    );
$$;

revoke all on function public.current_user_organization_ids_with_permission(text)
  from public, anon, authenticated, service_role;
grant execute on function public.current_user_organization_ids_with_permission(text)
  to authenticated;

drop policy if exists products_select_authorized on public.products;
create policy products_select_authorized
on public.products
for select to authenticated
using (
  organization_id = any (
    (select public.current_user_organization_ids_with_permission('PRODUCTS_VIEW'))::uuid[]
  )
);

drop policy if exists inventory_movements_select_authorized on public.inventory_movements;
create policy inventory_movements_select_authorized
on public.inventory_movements
for select to authenticated
using (
  organization_id = any (
    (select public.current_user_organization_ids_with_permission('INVENTORY_VIEW'))::uuid[]
  )
);

drop policy if exists warehouses_select_authorized on public.warehouses;
create policy warehouses_select_authorized
on public.warehouses
for select to authenticated
using (
  organization_id = any (
    (select public.current_user_organization_ids_with_permission('INVENTORY_VIEW'))::uuid[]
  )
);

drop policy if exists warehouse_locations_select_authorized on public.warehouse_locations;
create policy warehouse_locations_select_authorized
on public.warehouse_locations
for select to authenticated
using (
  organization_id = any (
    (select public.current_user_organization_ids_with_permission('INVENTORY_VIEW'))::uuid[]
  )
);

comment on function public.current_user_organization_ids_with_permission(text) is
  'Organizaciones activas donde la sesión posee un permiso efectivo; permite políticas RLS con evaluación única por sentencia.';
