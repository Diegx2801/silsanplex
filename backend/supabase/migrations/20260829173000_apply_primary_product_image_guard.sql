-- Apply the primary-image guard to databases where the original catalog
-- migration was already recorded before this behavior was introduced.

begin;

create or replace function public.protect_product_file_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if new.kind = 'image' and new.deleted_at is null then
      perform pg_advisory_xact_lock(hashtextextended(new.product_id::text || ':images', 0));
      if not exists (
        select 1
        from public.product_files file
        where file.organization_id = new.organization_id
          and file.product_id = new.product_id
          and file.kind = 'image'
          and file.is_primary
          and file.deleted_at is null
      ) then
        new.is_primary := true;
      end if;
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.product_id is distinct from old.product_id
    or new.kind is distinct from old.kind
    or new.storage_path is distinct from old.storage_path
    or new.file_name is distinct from old.file_name
    or new.mime_type is distinct from old.mime_type
    or new.byte_size is distinct from old.byte_size
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or old.deleted_at is not null
  then
    raise exception using errcode = 'P0001', message = 'PRODUCT_FILE_IMMUTABLE_FIELDS';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if new.deleted_at is null then
      raise exception using errcode = 'P0001', message = 'PRODUCT_FILE_CANNOT_RESTORE';
    end if;
    new.deleted_by := coalesce(auth.uid(), new.deleted_by);
    new.is_primary := false;
  else
    new.deleted_by := old.deleted_by;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_product_file_fields() from public;

commit;
