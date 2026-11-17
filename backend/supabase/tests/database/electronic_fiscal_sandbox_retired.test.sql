begin;
select plan(4);

select ok(
  not exists (
    select 1
    from public.permissions
    where code in (
      'BILLING_VIEW',
      'BILLING_CONFIGURE',
      'BILLING_PREPARE',
      'BILLING_ISSUE'
    )
  ),
  'no quedan permisos de facturación sandbox'
);

select ok(
  (
    select bool_and(to_regclass(format('public.%I', table_name)) is null)
    from unnest(array[
      'electronic_issuer_profiles',
      'electronic_document_series',
      'electronic_documents',
      'electronic_document_items',
      'electronic_document_commands',
      'electronic_document_outbox'
    ]) as tables(table_name)
  ),
  'no quedan tablas de facturación sandbox'
);

select ok(
  not exists (
    select 1
    from pg_namespace
    where nspname = 'electronic_private'
  ),
  'no queda el esquema privado de facturación sandbox'
);

select ok(
  to_regprocedure('public.save_electronic_issuer_profile(jsonb)') is null
  and to_regprocedure('public.configure_electronic_series(jsonb)') is null
  and to_regprocedure('public.prepare_electronic_document(jsonb)') is null
  and to_regprocedure('public.revise_electronic_document(jsonb)') is null
  and to_regprocedure('public.confirm_electronic_document(jsonb)') is null
  and to_regprocedure('public.get_electronic_document(uuid,uuid)') is null
  and to_regprocedure('public.can_view_electronic_documents(uuid)') is null
  and to_regprocedure('public.get_electronic_billing_configuration(uuid)') is null,
  'no quedan RPCs de facturación sandbox'
);

select * from finish();
rollback;
