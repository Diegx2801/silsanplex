-- S01: an unexpired JWT keeps its subject and permissions after sign-out.
-- Apply a current-session guard to row access and current-actor authorization
-- helpers. Explicit-subject authorization stays a trusted backend operation.
begin;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_auth_session_is_active()
    and exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.is_active
    );
$$;

create or replace function public.is_organization_member(
  requested_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_auth_session_is_active()
    and exists (
      select 1
      from public.organization_memberships membership
      join public.profiles profile on profile.id = membership.user_id
      join public.organizations organization on organization.id = membership.organization_id
      where membership.user_id = auth.uid()
        and membership.organization_id = requested_organization_id
        and membership.is_active
        and profile.is_active
        and organization.is_active
    );
$$;

create or replace function public.is_organization_admin(
  requested_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_auth_session_is_active()
    and exists (
      select 1
      from public.organization_memberships membership
      join public.user_roles user_role
        on user_role.organization_id = membership.organization_id
       and user_role.user_id = membership.user_id
      join public.roles role
        on role.code = user_role.role_code
       and role.code = 'ADMIN'
       and role.is_active
      join public.profiles profile on profile.id = membership.user_id
      join public.organizations organization on organization.id = membership.organization_id
      where membership.user_id = auth.uid()
        and membership.organization_id = requested_organization_id
        and membership.is_active
        and profile.is_active
        and organization.is_active
    );
$$;

create or replace function public.can_manage_user(
  requested_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_auth_session_is_active()
    and exists (
      select 1
      from public.organization_memberships manager_membership
      join public.user_roles manager_role
        on manager_role.organization_id = manager_membership.organization_id
       and manager_role.user_id = manager_membership.user_id
      join public.roles role
        on role.code = manager_role.role_code
       and role.is_active
      join public.role_permissions role_permission
        on role_permission.role_code = role.code
       and role_permission.permission_code = 'USERS_MANAGE'
      join public.permissions permission
        on permission.code = role_permission.permission_code
       and permission.is_active
      join public.profiles manager_profile on manager_profile.id = manager_membership.user_id
      join public.organizations organization
        on organization.id = manager_membership.organization_id
      join public.organization_memberships managed_membership
        on managed_membership.organization_id = manager_membership.organization_id
      where manager_membership.user_id = auth.uid()
        and manager_membership.is_active
        and manager_profile.is_active
        and organization.is_active
        and managed_membership.user_id = requested_user_id
    );
$$;

create or replace function public.current_user_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct effective.permission_code order by effective.permission_code), '{}'::text[])
  from (
    select role_permission.permission_code
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id and profile.is_active
    join public.organizations organization on organization.id = membership.organization_id and organization.is_active
    join public.user_roles user_role
      on user_role.organization_id = membership.organization_id and user_role.user_id = membership.user_id
    join public.roles role on role.code = user_role.role_code and role.is_active
    join public.role_permissions role_permission on role_permission.role_code = role.code
    join public.permissions permission on permission.code = role_permission.permission_code and permission.is_active
    where (select public.current_auth_session_is_active())
      and membership.user_id = auth.uid() and membership.is_active
    union
    select direct_permission.permission_code
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id and profile.is_active
    join public.organizations organization on organization.id = membership.organization_id and organization.is_active
    join public.organization_user_permissions direct_permission
      on direct_permission.organization_id = membership.organization_id
     and direct_permission.user_id = membership.user_id
    join public.permissions permission on permission.code = direct_permission.permission_code and permission.is_active
    where (select public.current_auth_session_is_active())
      and membership.user_id = auth.uid() and membership.is_active
  ) effective;
$$;

create or replace function public.has_organization_permission(
  requested_organization_id uuid,
  requested_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_auth_session_is_active()
    and public.user_has_organization_permission(
      requested_organization_id,
      auth.uid(),
      requested_permission_code
    );
$$;

create or replace function public.current_user_organization_ids_with_permission(
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
  where (select public.current_auth_session_is_active())
    and membership.user_id = auth.uid()
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

-- This helper checks an explicit technician subject, not the current actor.
-- Keep it available to internal definer routines and trusted backend code,
-- while removing the direct authenticated RPC surface.
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

revoke all on function public.repair_technician_is_active(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.repair_technician_is_active(uuid, uuid)
  to service_role;

-- A restrictive policy ANDs with every existing permissive policy, so direct
-- auth.uid() policies receive the same session requirement without replacing
-- their tenant or capability checks. The scalar subquery is statement-scoped.
do $$
declare
  table_row record;
begin
  for table_row in
    select namespace.nspname, relation.relname, relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
  loop
    if not table_row.relrowsecurity then
      raise exception using
        errcode = '55000',
        message = format('S01 requires existing RLS on %I.%I', table_row.nspname, table_row.relname);
    end if;
    if exists (
      select 1
      from pg_catalog.pg_policy existing_policy
      where existing_policy.polrelid = format('%I.%I', table_row.nspname, table_row.relname)::regclass
        and (
          0 = any (existing_policy.polroles)
          or 'authenticated'::regrole = any (existing_policy.polroles)
        )
    ) then
      execute format(
        'create policy s01_require_active_auth_session on %I.%I as restrictive for all to authenticated using ((select public.current_auth_session_is_active())) with check ((select public.current_auth_session_is_active()))',
        table_row.nspname,
        table_row.relname
      );
    end if;
  end loop;

  if not (select relation.relrowsecurity
          from pg_catalog.pg_class relation
          where relation.oid = 'storage.objects'::regclass) then
    raise exception using
      errcode = '55000',
      message = 'S01 requires existing RLS on storage.objects';
  end if;
  create policy s01_require_active_auth_session
    on storage.objects as restrictive for all to authenticated
    using ((select public.current_auth_session_is_active()))
    with check ((select public.current_auth_session_is_active()));
end;
$$;

comment on function public.has_organization_permission(uuid, text) is
  'Comprueba permiso efectivo de auth.uid() solo con una sesion Auth vigente.';
comment on function public.current_user_permissions() is
  'Devuelve permisos efectivos unicamente para una sesion Auth vigente del usuario actual.';
comment on function public.current_user_organization_ids_with_permission(text) is
  'Lista organizaciones permitidas para el usuario actual solo mientras su sesion Auth siga vigente.';

commit;
