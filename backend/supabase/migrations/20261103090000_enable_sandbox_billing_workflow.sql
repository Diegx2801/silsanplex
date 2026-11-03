begin;

-- Fiscal permissions are explicit user capabilities. They do not inherit from
-- SALES_MANAGE; the existing user-access UI may grant them independently.
update public.permissions
set is_directly_assignable = true
where code in ('BILLING_VIEW', 'BILLING_CONFIGURE', 'BILLING_PREPARE', 'BILLING_ISSUE');

insert into public.permission_dependencies(permission_code, required_permission_code)
values
  ('BILLING_CONFIGURE', 'BILLING_VIEW'),
  ('BILLING_PREPARE', 'BILLING_VIEW'),
  ('BILLING_ISSUE', 'BILLING_PREPARE')
on conflict do nothing;

-- Direct SELECT on fiscal tables stays revoked. This SECURITY DEFINER RPC
-- returns only the sandbox profile/series fields required by the UI.
create function public.get_electronic_billing_configuration(
  requested_organization_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profiles_json jsonb;
begin
  perform electronic_private.assert_access(requested_organization_id, 'BILLING_VIEW');
  if not public.has_organization_permission(requested_organization_id, 'BILLING_CONFIGURE')
    and not public.has_organization_permission(requested_organization_id, 'BILLING_PREPARE') then
    raise exception using errcode = '42501', message = 'CPE_FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(profile_row.value order by profile_row.ruc, profile_row.id), '[]'::jsonb)
  into profiles_json
  from (
    select
      profile.id,
      profile.ruc,
      jsonb_build_object(
        'id', profile.id,
        'version', profile.version::text,
        'ruc', profile.ruc,
        'legalName', profile.legal_name,
        'fiscalAddress', jsonb_build_object(
          'line', profile.fiscal_address->>'line',
          'district', profile.fiscal_address->>'district',
          'province', profile.fiscal_address->>'province',
          'department', profile.fiscal_address->>'department',
          'ubigeo', profile.fiscal_address->>'ubigeo',
          'country', profile.fiscal_address->>'country'
        ),
        'establishmentCode', profile.establishment_code,
        'series', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', series.id,
            'issuerProfileId', series.issuer_profile_id,
            'version', series.version::text,
            'documentType', series.document_type,
            'series', series.series,
            'nextNumber', series.next_number::text,
            'enabled', series.enabled
          ) order by series.document_type, series.series, series.id)
          from public.electronic_document_series series
          where series.organization_id = requested_organization_id
            and series.issuer_profile_id = profile.id
            and series.environment = 'sandbox'
        ), '[]'::jsonb)
      ) as value
    from public.electronic_issuer_profiles profile
    where profile.organization_id = requested_organization_id
      and profile.environment = 'sandbox'
  ) profile_row;

  return jsonb_build_object(
    'organizationId', requested_organization_id,
    'profiles', profiles_json
  );
end;
$$;

revoke all on function public.get_electronic_billing_configuration(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_electronic_billing_configuration(uuid)
  to authenticated;

comment on function public.get_electronic_billing_configuration(uuid) is
  'Returns only sandbox issuer and series configuration to fiscal viewers with prepare or configure permission.';

commit;
