begin;

-- Keep the invitation password gate while preserving the authorization
-- contract: administrative access requires an active role and active
-- USERS_MANAGE permission, not merely a stale ADMIN assignment.
create or replace function public.resolve_admin_organization(
  actor_user_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  organization_count integer;
begin
  select
    count(distinct membership.organization_id),
    min(membership.organization_id::text)::uuid
  into organization_count, resolved_organization_id
  from public.organization_memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
  join public.organizations organization
    on organization.id = membership.organization_id
  join public.user_roles user_role
    on user_role.organization_id = membership.organization_id
   and user_role.user_id = membership.user_id
  join public.roles role
    on role.code = user_role.role_code
   and role.is_active
  join public.role_permissions role_permission
    on role_permission.role_code = role.code
   and role_permission.permission_code = 'USERS_MANAGE'
  join public.permissions permission
    on permission.code = role_permission.permission_code
   and permission.is_active
  where membership.user_id = actor_user_id
    and membership.is_active
    and profile.is_active
    and not profile.password_setup_required
    and organization.is_active;

  if organization_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_ACCESS_REQUIRED';
  end if;

  if organization_count > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_ORGANIZATION_AMBIGUOUS';
  end if;

  return resolved_organization_id;
end;
$$;

revoke all on function public.resolve_admin_organization(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_admin_organization(uuid)
  to service_role;

commit;
