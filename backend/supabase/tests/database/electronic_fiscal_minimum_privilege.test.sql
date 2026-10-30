begin;

select plan(32);

select is(
  (select count(*)::integer from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array[
       'electronic_issuer_profiles', 'electronic_document_series', 'electronic_documents',
       'electronic_document_items', 'electronic_document_commands', 'electronic_document_outbox'
     ])
     and c.relkind = 'r'),
  6,
  'existen las seis tablas fiscales'
);

select ok((select relrowsecurity from pg_class where oid = 'public.electronic_issuer_profiles'::regclass), 'issuer profiles conserva RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.electronic_document_series'::regclass), 'series conserva RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.electronic_documents'::regclass), 'documents conserva RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.electronic_document_items'::regclass), 'items conserva RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.electronic_document_commands'::regclass), 'commands conserva RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.electronic_document_outbox'::regclass), 'outbox conserva RLS');

select is(has_table_privilege('authenticated', 'public.electronic_issuer_profiles', 'SELECT'), false, 'authenticated no tiene SELECT efectivo en issuer profiles');
select is(has_table_privilege('authenticated', 'public.electronic_document_series', 'SELECT'), false, 'authenticated no tiene SELECT efectivo en series');
select is(has_table_privilege('authenticated', 'public.electronic_documents', 'SELECT'), false, 'authenticated no tiene SELECT efectivo en documents');
select is(has_table_privilege('authenticated', 'public.electronic_document_items', 'SELECT'), false, 'authenticated no tiene SELECT efectivo en items');
select is(has_table_privilege('authenticated', 'public.electronic_document_commands', 'SELECT'), false, 'authenticated no tiene SELECT efectivo en commands');
select is(has_table_privilege('authenticated', 'public.electronic_document_outbox', 'SELECT'), false, 'authenticated no tiene SELECT efectivo en outbox');

select ok(not exists (
  select 1 from pg_attribute a
  where a.attrelid = 'public.electronic_issuer_profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
), 'authenticated no tiene SELECT por columna en issuer profiles');
select ok(not exists (
  select 1 from pg_attribute a
  where a.attrelid = 'public.electronic_document_series'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
), 'authenticated no tiene SELECT por columna en series');
select ok(not exists (
  select 1 from pg_attribute a
  where a.attrelid = 'public.electronic_documents'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
), 'authenticated no tiene SELECT por columna en documents');
select ok(not exists (
  select 1 from pg_attribute a
  where a.attrelid = 'public.electronic_document_items'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
), 'authenticated no tiene SELECT por columna en items');
select ok(not exists (
  select 1 from pg_attribute a
  where a.attrelid = 'public.electronic_document_commands'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
), 'authenticated no tiene SELECT por columna en commands');
select ok(not exists (
  select 1 from pg_attribute a
  where a.attrelid = 'public.electronic_document_outbox'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
), 'authenticated no tiene SELECT por columna en outbox');

select ok(not exists (
  select 1
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
  where n.nspname = 'public'
    and c.relname = any(array[
      'electronic_issuer_profiles', 'electronic_document_series', 'electronic_documents',
      'electronic_document_items', 'electronic_document_commands', 'electronic_document_outbox'
    ])
    and acl.privilege_type = 'SELECT'
    and acl.grantee in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
) and (
  select bool_and(not has_table_privilege('anon', c.oid, 'SELECT'))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(array[
      'electronic_issuer_profiles', 'electronic_document_series', 'electronic_documents',
      'electronic_document_items', 'electronic_document_commands', 'electronic_document_outbox'
    ])
), 'no queda ACL SELECT ni privilegio efectivo para PUBLIC, anon o authenticated');

select ok((
  select bool_and(
    not has_table_privilege('authenticated', c.oid, 'INSERT')
    and not has_table_privilege('authenticated', c.oid, 'UPDATE')
    and not has_table_privilege('authenticated', c.oid, 'DELETE')
  )
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = any(array[
    'electronic_issuer_profiles', 'electronic_document_series', 'electronic_documents',
    'electronic_document_items', 'electronic_document_commands', 'electronic_document_outbox'
  ])
), 'authenticated conserva denegadas las escrituras directas');

select ok((
  select count(*) = 6 and bool_and(polcmd = 'r' and polqual is not null
    and polroles = array['authenticated'::regrole::oid]
    and pg_get_expr(polqual, polrelid) like '%can_view_electronic_documents%')
  from pg_policy
  where polname = 'fiscal_read' and polrelid in (
    'public.electronic_issuer_profiles'::regclass, 'public.electronic_document_series'::regclass,
    'public.electronic_documents'::regclass, 'public.electronic_document_items'::regclass,
    'public.electronic_document_commands'::regclass, 'public.electronic_document_outbox'::regclass
  )
), 'las seis políticas fiscal_read siguen ligadas a BILLING_VIEW y organización');

select is(has_function_privilege('authenticated', 'public.save_electronic_issuer_profile(jsonb)', 'EXECUTE'), true, 'authenticated conserva RPC de configuración de emisor');
select is(has_function_privilege('authenticated', 'public.configure_electronic_series(jsonb)', 'EXECUTE'), true, 'authenticated conserva RPC de configuración de serie');
select is(has_function_privilege('authenticated', 'public.prepare_electronic_document(jsonb)', 'EXECUTE'), true, 'authenticated conserva RPC de preparación');
select is(has_function_privilege('authenticated', 'public.revise_electronic_document(jsonb)', 'EXECUTE'), true, 'authenticated conserva RPC de revisión');
select is(has_function_privilege('authenticated', 'public.confirm_electronic_document(jsonb)', 'EXECUTE'), true, 'authenticated conserva RPC de confirmación');
select is(has_function_privilege('authenticated', 'public.get_electronic_document(uuid,uuid)', 'EXECUTE'), true, 'authenticated conserva RPC de consulta');
select is(has_function_privilege('authenticated', 'public.can_view_electronic_documents(uuid)', 'EXECUTE'), true, 'authenticated conserva helper de política RLS');

select ok(not exists (
  select 1
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  where n.nspname = 'public'
    and p.proname = any(array[
      'save_electronic_issuer_profile', 'configure_electronic_series', 'prepare_electronic_document',
      'revise_electronic_document', 'confirm_electronic_document', 'get_electronic_document',
      'can_view_electronic_documents'
    ])
    and (acl.grantee = 0 or has_function_privilege('anon', p.oid, 'EXECUTE'))
), 'las RPC fiscales no quedan ejecutables por PUBLIC o anon');

select ok((
  select p.prosecdef
    and p.proconfig @> array['search_path=""']::text[]
    and p.prosrc like '%BILLING_VIEW%'
  from pg_proc p where p.oid = 'public.get_electronic_document(uuid,uuid)'::regprocedure
), 'la RPC de lectura conserva SECURITY DEFINER, search_path vacío y validación BILLING_VIEW');

select ok((
  select count(*) = 5 and bool_and(p.prosecdef and p.proconfig @> array['search_path=""']::text[])
  from pg_proc p
  where p.oid in (
    'public.save_electronic_issuer_profile(jsonb)'::regprocedure,
    'public.configure_electronic_series(jsonb)'::regprocedure,
    'public.prepare_electronic_document(jsonb)'::regprocedure,
    'public.revise_electronic_document(jsonb)'::regprocedure,
    'public.confirm_electronic_document(jsonb)'::regprocedure
  )
), 'las RPC mutantes conservan SECURITY DEFINER y search_path vacío');

select * from finish();
rollback;
