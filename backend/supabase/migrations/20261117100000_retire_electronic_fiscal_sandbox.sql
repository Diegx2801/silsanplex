begin;

-- Remove the internal fiscal sandbox. No official electronic invoicing flow is
-- implemented or required by the current product.
drop table if exists
  public.electronic_document_outbox,
  public.electronic_document_commands,
  public.electronic_document_items,
  public.electronic_documents,
  public.electronic_document_series,
  public.electronic_issuer_profiles
  cascade;

drop function if exists public.save_electronic_issuer_profile(jsonb);
drop function if exists public.configure_electronic_series(jsonb);
drop function if exists public.prepare_electronic_document(jsonb);
drop function if exists public.revise_electronic_document(jsonb);
drop function if exists public.confirm_electronic_document(jsonb);
drop function if exists public.get_electronic_document(uuid, uuid);
drop function if exists public.can_view_electronic_documents(uuid);
drop function if exists public.get_electronic_billing_configuration(uuid);

drop schema if exists electronic_private cascade;

delete from public.organization_user_permissions
where permission_code in (
  'BILLING_VIEW',
  'BILLING_CONFIGURE',
  'BILLING_PREPARE',
  'BILLING_ISSUE'
);

delete from public.role_permissions
where permission_code in (
  'BILLING_VIEW',
  'BILLING_CONFIGURE',
  'BILLING_PREPARE',
  'BILLING_ISSUE'
);

delete from public.permission_dependencies
where permission_code in (
    'BILLING_VIEW',
    'BILLING_CONFIGURE',
    'BILLING_PREPARE',
    'BILLING_ISSUE'
  )
  or required_permission_code in (
    'BILLING_VIEW',
    'BILLING_CONFIGURE',
    'BILLING_PREPARE',
    'BILLING_ISSUE'
  );

delete from public.permissions
where code in (
  'BILLING_VIEW',
  'BILLING_CONFIGURE',
  'BILLING_PREPARE',
  'BILLING_ISSUE'
);

commit;
