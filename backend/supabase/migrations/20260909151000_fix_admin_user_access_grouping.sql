-- Ajuste compatible para bases locales que alcanzaron la migración anterior
-- durante validación incremental.
create or replace function public.admin_list_user_access(actor_user_id uuid)
returns table(
  user_id uuid, organization_id uuid, email text, full_name text, phone text,
  is_active boolean, is_admin boolean, permission_codes text[], access_version bigint,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare resolved_organization_id uuid;
begin
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);
  return query
  select profile.id, membership.organization_id, profile.email, profile.full_name, profile.phone,
    membership.is_active and profile.is_active,
    exists(select 1 from public.user_roles user_role where user_role.organization_id=membership.organization_id and user_role.user_id=membership.user_id and user_role.role_code='ADMIN'),
    coalesce(array_agg(direct_permission.permission_code order by direct_permission.permission_code)
      filter(where direct_permission.permission_code is not null), '{}'::text[]),
    membership.access_version, membership.created_at, greatest(profile.updated_at,membership.updated_at)
  from public.organization_memberships membership
  join public.profiles profile on profile.id=membership.user_id
  left join public.organization_user_permissions direct_permission
    on direct_permission.organization_id=membership.organization_id and direct_permission.user_id=membership.user_id
  where membership.organization_id=resolved_organization_id
  group by profile.id,membership.organization_id,membership.user_id,membership.is_active,membership.access_version,membership.created_at,membership.updated_at
  order by profile.full_name,profile.email;
end;
$$;

revoke all on function public.admin_list_user_access(uuid) from public,anon,authenticated;
grant execute on function public.admin_list_user_access(uuid) to service_role;
