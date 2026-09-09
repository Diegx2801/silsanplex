-- Compatibilidad para entornos que aplicaron incrementalmente la migración de
-- permisos antes de incorporar la validación explícita del tipo de acceso.
create or replace function public.admin_create_user_membership(
  actor_user_id uuid,
  target_user_id uuid,
  requested_is_admin boolean,
  requested_permission_codes text[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  normalized_permissions text[];
begin
  if requested_is_admin is null then
    raise exception using errcode = '22023', message = 'USER_ACCESS_TYPE_REQUIRED';
  end if;

  resolved_organization_id := public.resolve_admin_organization(actor_user_id);
  perform public.lock_organization_user_administration(resolved_organization_id);
  resolved_organization_id := public.resolve_admin_organization(actor_user_id);
  normalized_permissions := public.normalize_operational_permission_codes(requested_permission_codes);

  if requested_is_admin and cardinality(coalesce(requested_permission_codes, '{}'::text[])) > 0 then
    raise exception using errcode = 'P0001', message = 'ADMIN_DIRECT_PERMISSIONS_FORBIDDEN';
  end if;
  if not requested_is_admin and cardinality(normalized_permissions) = 0 then
    raise exception using errcode = 'P0001', message = 'AT_LEAST_ONE_OPERATIONAL_PERMISSION_REQUIRED';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id and is_active) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_PROFILE_REQUIRED';
  end if;
  if exists (
    select 1 from public.organization_memberships
    where organization_id = resolved_organization_id and user_id = target_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'USER_ALREADY_BELONGS_TO_ORGANIZATION';
  end if;

  insert into public.organization_memberships(organization_id, user_id, created_by)
  values (resolved_organization_id, target_user_id, actor_user_id);

  if requested_is_admin then
    insert into public.user_roles(organization_id, user_id, role_code, assigned_by)
    values (resolved_organization_id, target_user_id, 'ADMIN', actor_user_id);
  else
    insert into public.organization_user_permissions(
      organization_id, user_id, permission_code, assigned_by
    )
    select resolved_organization_id, target_user_id, code, actor_user_id
    from unnest(normalized_permissions) code;
  end if;

  insert into public.audit_events(
    organization_id, actor_user_id, action, entity_type, entity_id, new_values
  )
  values (
    resolved_organization_id, actor_user_id, 'USER_CREATED',
    'ORGANIZATION_MEMBERSHIP', target_user_id::text,
    jsonb_build_object(
      'is_active', true,
      'is_admin', requested_is_admin,
      'permission_codes', to_jsonb(normalized_permissions),
      'access_version', 1
    )
  );

  return 1;
end;
$$;

revoke all on function public.admin_create_user_membership(uuid,uuid,boolean,text[])
  from public, anon, authenticated;
grant execute on function public.admin_create_user_membership(uuid,uuid,boolean,text[])
  to service_role;
