begin;

insert into public.permissions (code, name, description)
values (
  'REPAIRS_PERFORM_TECHNICAL', 'Actuar como técnico de reparaciones',
  'Ser asignado como técnico y figurar como responsable de diagnósticos y pruebas.'
);

-- Preserve the existing administrative technical workflow. Other roles must
-- receive this capability explicitly; membership alone never qualifies.
insert into public.role_permissions (role_code, permission_code)
values ('ADMIN', 'REPAIRS_PERFORM_TECHNICAL');

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
  select exists (
    select 1
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    join public.organizations organization on organization.id = membership.organization_id
    join public.user_roles user_role
      on user_role.organization_id = membership.organization_id
      and user_role.user_id = membership.user_id
    join public.roles role on role.code = user_role.role_code and role.is_active
    join public.role_permissions role_permission
      on role_permission.role_code = role.code
      and role_permission.permission_code = 'REPAIRS_PERFORM_TECHNICAL'
    join public.permissions permission
      on permission.code = role_permission.permission_code and permission.is_active
    where membership.organization_id = requested_organization_id
      and membership.user_id = requested_user_id
      and membership.is_active
      and profile.is_active
      and organization.is_active
  );
$$;

-- Existing creation/assignment, diagnosis, test and delivery commands already
-- call this helper, including their implicit assigned-technician/actor fallback.
create or replace function public.list_repair_technicians(
  requested_organization_id uuid,
  requested_search text default '',
  requested_limit integer default 100
)
returns table (user_id uuid, full_name text, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_search text := lower(btrim(coalesce(requested_search, '')));
  result_limit integer := least(greatest(coalesce(requested_limit, 100), 1), 500);
begin
  perform public.assert_repair_actor(requested_organization_id, 'REPAIRS_ASSIGN');
  return query
  select profile.id, profile.full_name, profile.email
  from public.organization_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.organization_id = requested_organization_id
    and public.repair_technician_is_active(requested_organization_id, membership.user_id)
    and (
      normalized_search = ''
      or lower(profile.full_name) like '%' || normalized_search || '%'
      or lower(profile.email) like '%' || normalized_search || '%'
    )
  order by profile.full_name, profile.email, profile.id
  limit result_limit;
end;
$$;

revoke all on function public.repair_technician_is_active(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.list_repair_technicians(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.list_repair_technicians(uuid, text, integer)
  to authenticated, service_role;

commit;
