begin;
select no_plan();
create function pg_temp.attachment_id(label text) returns uuid language sql immutable
as $$ select md5('repair-attachment-test:' || label)::uuid $$;
insert into public.organizations (id, name, slug) values
  (pg_temp.attachment_id('org'), 'Attachment test', 'repair-attachment-test'),
  (pg_temp.attachment_id('other'), 'Other attachment test', 'other-repair-attachment-test');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
select pg_temp.attachment_id(label), label || '@repair-attachment.test', '{}', now(), now()
from unnest(array['admin', 'viewer', 'outsider']) label;
insert into auth.sessions(id, user_id, created_at, updated_at)
select pg_temp.attachment_id(label || '-session'), pg_temp.attachment_id(label), now(), now()
from unnest(array['admin', 'viewer', 'outsider']) label;
insert into public.organization_memberships(organization_id, user_id)
select pg_temp.attachment_id(case when label = 'outsider' then 'other' else 'org' end), pg_temp.attachment_id(label)
from unnest(array['admin', 'viewer', 'outsider']) label;
insert into public.roles (code, name) values ('ATTACHMENT_VIEWER_TEST', 'Attachment viewer test');
insert into public.role_permissions(role_code, permission_code) values ('ATTACHMENT_VIEWER_TEST', 'REPAIRS_VIEW');
insert into public.user_roles(organization_id, user_id, role_code) values
  (pg_temp.attachment_id('org'), pg_temp.attachment_id('admin'), 'ADMIN'),
  (pg_temp.attachment_id('org'), pg_temp.attachment_id('viewer'), 'ATTACHMENT_VIEWER_TEST'),
  (pg_temp.attachment_id('other'), pg_temp.attachment_id('outsider'), 'ADMIN');
insert into public.customers(id, organization_id, document_type, document_number, legal_name)
values (pg_temp.attachment_id('customer'), pg_temp.attachment_id('org'), 'DNI', '61170001', 'Attachment customer');
insert into public.products(id, organization_id, code, description, unit_of_measure, sale_price)
values (pg_temp.attachment_id('product'), pg_temp.attachment_id('org'), 'ATTACHMENT', 'Attachment equipment', 'UND', 10);
insert into public.repairs(id, organization_id, customer_id, product_id, problem_description,
  customer_name_snapshot, customer_document_snapshot, product_code_snapshot, product_description_snapshot)
values (pg_temp.attachment_id('repair'), pg_temp.attachment_id('org'), pg_temp.attachment_id('customer'),
  pg_temp.attachment_id('product'), 'No enciende', 'Attachment customer', 'DNI 61170001', 'ATTACHMENT', 'Attachment equipment');
create function pg_temp.attachment_path(label text) returns text language sql stable as $$
  select pg_temp.attachment_id('org')::text || '/' || pg_temp.attachment_id('repair')::text || '/' || pg_temp.attachment_id(label)::text;
$$;
insert into storage.objects(bucket_id, name, owner_id, metadata)
values ('repair-attachments', pg_temp.attachment_path('file'), pg_temp.attachment_id('admin')::text,
  '{"size":100,"mimetype":"application/pdf"}');

select is((select public from storage.buckets where id = 'repair-attachments'), false, 'attachment bucket is private');
select is((select file_size_limit from storage.buckets where id = 'repair-attachments'), 5242880::bigint, '5 MiB enforced by Storage');
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.attachment_id('admin'), 'role', 'authenticated',
  'session_id', pg_temp.attachment_id('admin-session'))::text, true);
select ok(public.can_upload_repair_attachment(pg_temp.attachment_path('file')), 'authorized writer may upload');
select lives_ok($$ insert into storage.objects(bucket_id, name, owner_id, metadata)
  values ('repair-attachments', pg_temp.attachment_path('unregistered-file'), pg_temp.attachment_id('admin')::text,
    '{"size":100,"mimetype":"application/pdf"}') $$, 'Storage insert policy permits an authorized upload');
select ok(not public.can_upload_repair_attachment('malformed/path'), 'malformed paths rejected without unsafe casts');
select throws_ok($$ insert into public.repair_attachments(id, organization_id, repair_id, storage_path, file_name, mime_type, byte_size, created_by)
  values (pg_temp.attachment_id('missing'), pg_temp.attachment_id('org'), pg_temp.attachment_id('repair'), pg_temp.attachment_path('missing'),
  'evidencia.pdf', 'application/pdf', 100, pg_temp.attachment_id('admin')) $$,
  '23514', 'REPAIR_ATTACHMENT_UPLOAD_MISMATCH', 'cannot register an object that was not uploaded');
select throws_ok($$ insert into public.repair_attachments(id, organization_id, repair_id, storage_path, file_name, mime_type, byte_size, created_by)
  values (pg_temp.attachment_id('file'), pg_temp.attachment_id('org'), pg_temp.attachment_id('repair'), pg_temp.attachment_path('file'),
  'evidencia.pdf', 'application/pdf', 101, pg_temp.attachment_id('admin')) $$,
  '23514', 'REPAIR_ATTACHMENT_UPLOAD_MISMATCH', 'metadata must match uploaded bytes');
select lives_ok($$ insert into public.repair_attachments(id, organization_id, repair_id, storage_path, file_name, mime_type, byte_size, created_by)
  values (pg_temp.attachment_id('file'), pg_temp.attachment_id('org'), pg_temp.attachment_id('repair'), pg_temp.attachment_path('file'),
  'evidencia.pdf', 'application/pdf', 100, pg_temp.attachment_id('admin')) $$, 'authorized evidence registration');
select is((select count(*) from public.repair_attachments), 1::bigint, 'authorized list includes attachment');
select is((select count(*) from public.repair_events where repair_id = pg_temp.attachment_id('repair') and event_type = 'ATTACHMENT_ADDED'),
  1::bigint, 'evidence registration appears in the order audit');
select throws_ok($$ select public.update_repair(jsonb_build_object(
  'id', pg_temp.attachment_id('repair'), 'organization_id', pg_temp.attachment_id('org'),
  'expected_lock_version', (select lock_version from public.repairs where id = pg_temp.attachment_id('repair')),
  'equipment_type', 'external', 'product_id', null, 'external_equipment_description', 'Another equipment')) $$,
  'P0001', 'REPAIR_IDENTITY_LOCKED', 'evidence cannot be reassigned to a different equipment');
select is((select count(*) from storage.objects where bucket_id = 'repair-attachments'), 1::bigint, 'unregistered uploaded object cannot be read or signed');
select throws_ok($$ update public.repair_attachments set file_name = 'replacement.pdf' $$, '42501', null, 'authenticated cannot rewrite metadata');
select throws_ok($$ delete from public.repair_attachments $$, '42501', null, 'authenticated cannot delete evidence');
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.attachment_id('viewer'), 'role', 'authenticated',
  'session_id', pg_temp.attachment_id('viewer-session'))::text, true);
select is((select count(*) from public.repair_attachments), 1::bigint, 'view-only reader can consult metadata');
select is((select count(*) from storage.objects where bucket_id = 'repair-attachments'), 1::bigint, 'view-only reader can sign authorized object');
select ok(not public.can_upload_repair_attachment(pg_temp.attachment_path('file')), 'view-only reader cannot upload');
select throws_ok($$ insert into storage.objects(bucket_id, name, owner_id, metadata)
  values ('repair-attachments', pg_temp.attachment_path('viewer-file'), pg_temp.attachment_id('viewer')::text,
    '{"size":100,"mimetype":"application/pdf"}') $$, '42501', null, 'Storage insert policy denies a view-only reader');
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.attachment_id('outsider'), 'role', 'authenticated',
  'session_id', pg_temp.attachment_id('outsider-session'))::text, true);
select is((select count(*) from public.repair_attachments), 0::bigint, 'other organization cannot list metadata');
select is((select count(*) from storage.objects where bucket_id = 'repair-attachments'), 0::bigint, 'other organization cannot sign objects');
select ok(not public.can_upload_repair_attachment(pg_temp.attachment_path('file')), 'other organization cannot upload');
select throws_ok($$ insert into storage.objects(bucket_id, name, owner_id, metadata)
  values ('repair-attachments', pg_temp.attachment_path('outsider-file'), pg_temp.attachment_id('outsider')::text,
    '{"size":100,"mimetype":"application/pdf"}') $$, '42501', null, 'Storage insert policy denies cross-organization upload');
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.attachment_id('admin'), 'role', 'authenticated')::text, true);
select is((select count(*) from public.repair_attachments), 0::bigint, 'inactive session cannot consult evidence');
reset role;
select * from finish();
rollback;
