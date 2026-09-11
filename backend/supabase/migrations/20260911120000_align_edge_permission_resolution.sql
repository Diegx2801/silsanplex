-- ============================================================
-- SILSANPLEX: resolución Edge compatible con permisos directos
-- ============================================================

-- Las Edge Functions resuelven la organización del usuario antes de consultar
-- proveedores externos. La implementación original solo reconocía roles
-- legacy; delegamos la decisión al contrato central de autorización para que
-- roles y permisos directos tengan exactamente la misma semántica.
create or replace function public.resolve_edge_user_organization_permission(
  requested_user_id uuid,
  requested_permission text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  resolved_count integer;
  normalized_permission text := btrim(requested_permission);
begin
  if requested_user_id is null or nullif(normalized_permission, '') is null then
    raise exception using errcode = '22023', message = 'INVALID_AUTHORIZATION_REQUEST';
  end if;

  select min(membership.organization_id::text)::uuid, count(*)
    into resolved_organization_id, resolved_count
  from public.organization_memberships membership
  where membership.user_id = requested_user_id
    and public.user_has_organization_permission(
      membership.organization_id,
      requested_user_id,
      normalized_permission
    );

  if resolved_count = 0 then
    raise exception using errcode = '42501', message = 'CUSTOMER_PERMISSION_REQUIRED';
  end if;
  if resolved_count > 1 then
    raise exception using errcode = '21000', message = 'ACTIVE_ORGANIZATION_AMBIGUOUS';
  end if;

  return resolved_organization_id;
end;
$$;

comment on function public.resolve_edge_user_organization_permission(uuid, text) is
  'Resuelve una única organización activa para una capacidad efectiva, ya provenga de permisos directos o roles legacy.';

revoke all on function public.resolve_edge_user_organization_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolve_edge_user_organization_permission(uuid, text)
  to service_role;
