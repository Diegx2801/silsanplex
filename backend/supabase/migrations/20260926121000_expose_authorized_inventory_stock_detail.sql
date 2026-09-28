begin;

-- Read the canonical bucket once so physical stock, reservations and FEFO
-- availability use the same rules as sales and warehouse operations.
create or replace function public.inventory_stock_detail_read(
  requested_organization_id uuid,
  search_term text default '',
  requested_warehouse_id uuid default null,
  requested_location_id uuid default null,
  requested_lot text default '',
  requested_status text default null,
  expiration_from date default null,
  expiration_to date default null,
  requested_sort text default 'vencimiento-asc',
  requested_limit integer default 25,
  requested_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform inventory_internal.assert_inventory_read(requested_organization_id);

  if requested_limit is null or requested_limit < 1 or requested_limit > 100
    or requested_offset is null or requested_offset < 0
    or requested_sort is null
    or requested_sort not in ('vencimiento-asc', 'vencimiento-desc', 'producto-asc')
    or (requested_status is not null and requested_status not in ('available', 'quarantine', 'damaged'))
    or (expiration_from is not null and expiration_to is not null and expiration_from > expiration_to)
  then
    raise exception using errcode = '22023', message = 'INVENTORY_READ_FILTER_INVALID';
  end if;

  return (
    with filtered as (
      select bucket.*
      from public.inventory_bucket_availability bucket
      where bucket.organization_id = requested_organization_id
        and bucket.physical_quantity <> 0
        and (requested_warehouse_id is null or bucket.warehouse_id = requested_warehouse_id)
        and (requested_location_id is null or bucket.location_id = requested_location_id)
        and (requested_status is null or bucket.stock_status = requested_status)
        and (expiration_from is null or bucket.expiration_date >= expiration_from)
        and (expiration_to is null or bucket.expiration_date <= expiration_to)
        and (coalesce(btrim(search_term), '') = ''
          or strpos(lower(bucket.product_code), lower(btrim(search_term))) > 0
          or strpos(lower(bucket.product_description), lower(btrim(search_term))) > 0)
        and (coalesce(btrim(requested_lot), '') = ''
          or strpos(lower(bucket.lot), lower(btrim(requested_lot))) > 0)
    ), page as (
      select filtered.*,
        row_number() over (order by
          case when requested_sort = 'producto-asc' then product_description end asc,
          case when requested_sort = 'vencimiento-asc' then expiration_date end asc nulls last,
          case when requested_sort = 'vencimiento-desc' then expiration_date end desc nulls last,
          product_id, warehouse_id, location_id, stock_status, lot,
          expiration_date nulls last, product_code, product_description, unit_of_measure
        ) as page_order
      from filtered
      order by page_order
      limit requested_limit offset requested_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(to_jsonb(page) - 'page_order' order by page_order) from page), '[]'::jsonb),
      'total_count', (select count(*) from filtered)
    )
  );
end;
$$;

alter function public.inventory_stock_detail_read(uuid, text, uuid, uuid, text, text, date, date, text, integer, integer) owner to postgres;
revoke all on function public.inventory_stock_detail_read(uuid, text, uuid, uuid, text, text, date, date, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.inventory_stock_detail_read(uuid, text, uuid, uuid, text, text, date, date, text, integer, integer) to authenticated;

comment on function public.inventory_stock_detail_read(uuid, text, uuid, uuid, text, text, date, date, text, integer, integer) is
  'Paginated canonical stock buckets authorized by organization and INVENTORY_VIEW.';

commit;
