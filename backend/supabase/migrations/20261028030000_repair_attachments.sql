begin;

-- Evidence is private and append-only. Original bytes cannot be replaced through
-- the Data API; there is deliberately no authenticated update/delete policy.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('repair-attachments', 'repair-attachments', false, 5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.repair_attachments (
  id uuid primary key,
  organization_id uuid not null,
  repair_id uuid not null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 180
    and file_name !~ '[[:cntrl:]/\\]'),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size between 1 and 5242880),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id, repair_id) references public.repairs(organization_id, id) on delete restrict,
  check (storage_path = organization_id::text || '/' || repair_id::text || '/' || id::text)
);
create index repair_attachments_repair_idx
  on public.repair_attachments (organization_id, repair_id, created_at, id);

create function public.can_access_repair_attachment(requested_organization_id uuid, requested_repair_id uuid, writing boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_auth_session_is_active()
    and public.has_organization_permission(requested_organization_id, 'REPAIRS_VIEW')
    and (not writing or public.has_organization_permission(requested_organization_id, 'REPAIRS_UPDATE')
      or public.has_organization_permission(requested_organization_id, 'REPAIRS_PERFORM_TECHNICAL'))
    and exists (select 1 from public.repairs r where r.organization_id = requested_organization_id and r.id = requested_repair_id);
$$;
revoke all on function public.can_access_repair_attachment(uuid, uuid, boolean) from public, anon;
grant execute on function public.can_access_repair_attachment(uuid, uuid, boolean) to authenticated, service_role;

-- Storage validation uses text comparisons so malformed paths never cast to UUID.
create function public.can_upload_repair_attachment(requested_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select requested_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
    and exists (select 1 from public.repairs r
      where r.organization_id::text = split_part(requested_path, '/', 1)
        and r.id::text = split_part(requested_path, '/', 2)
        and public.can_access_repair_attachment(r.organization_id, r.id, true));
$$;
revoke all on function public.can_upload_repair_attachment(text) from public, anon;
grant execute on function public.can_upload_repair_attachment(text) to authenticated, service_role;

create function public.validate_repair_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode = '42501', message = 'REPAIR_ATTACHMENT_IMMUTABLE';
  end if;
  perform public.assert_repair_actor(new.organization_id, 'REPAIRS_VIEW');
  if not public.can_access_repair_attachment(new.organization_id, new.repair_id, true)
    or new.created_by is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'REPAIR_FORBIDDEN';
  end if;
  if not exists (select 1 from storage.objects object
    where object.bucket_id = 'repair-attachments' and object.name = new.storage_path
      and object.owner_id = auth.uid()::text
      and object.metadata ->> 'mimetype' = new.mime_type
      and (object.metadata ->> 'size')::bigint = new.byte_size) then
    raise exception using errcode = '23514', message = 'REPAIR_ATTACHMENT_UPLOAD_MISMATCH';
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.validate_repair_attachment() from public, anon, authenticated;
create trigger repair_attachment_validate before insert or update or delete on public.repair_attachments
  for each row execute function public.validate_repair_attachment();

alter table public.repair_attachments enable row level security;
revoke all on public.repair_attachments from anon, authenticated;
grant select, insert on public.repair_attachments to authenticated;
grant select on public.repair_attachments to service_role;
create policy repair_attachments_read on public.repair_attachments for select to authenticated
  using (public.can_access_repair_attachment(organization_id, repair_id, false));
create policy repair_attachments_insert on public.repair_attachments for insert to authenticated
  with check (created_by = auth.uid() and public.can_access_repair_attachment(organization_id, repair_id, true));

create policy repair_attachments_storage_read on storage.objects for select to authenticated
using (bucket_id = 'repair-attachments' and exists
  (select 1 from public.repair_attachments file where file.storage_path = name
    and public.can_access_repair_attachment(file.organization_id, file.repair_id, false)));
create policy repair_attachments_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'repair-attachments' and public.can_upload_repair_attachment(name));

commit;
