begin;

create or replace function public.inventory_adjustment_warehouses_read(
  requested_organization_id uuid,
  requested_product_id uuid,
  search_term text default '',
  requested_limit integer default 50,
  requested_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if requested_limit is null or requested_limit < 1 or requested_limit > 50
    or requested_offset is null or requested_offset < 0
    or char_length(coalesce(btrim(search_term), '')) > 100
  then
    raise exception using errcode = '22023', message = 'INVENTORY_READ_FILTER_INVALID';
  end if;

  perform inventory_internal.assert_inventory_read(requested_organization_id);

  return (
    with eligible as (
      select
        warehouse.id as warehouse_id,
        warehouse.code as warehouse_code,
        warehouse.name as warehouse_name,
        sum(greatest(bucket.physical_quantity - bucket.reserved_quantity, 0)) as adjustable_quantity
      from public.products product
      join public.inventory_bucket_availability bucket
        on bucket.organization_id = product.organization_id
       and bucket.product_id = product.id
      join public.warehouses warehouse
        on warehouse.organization_id = bucket.organization_id
       and warehouse.id = bucket.warehouse_id
       and warehouse.is_active
      join public.warehouse_locations location
        on location.organization_id = bucket.organization_id
       and location.warehouse_id = bucket.warehouse_id
       and location.id = bucket.location_id
       and location.is_active
      where product.organization_id = requested_organization_id
        and product.id = requested_product_id
        and product.product_type = 'good'
        and product.is_active
        and bucket.physical_quantity > bucket.reserved_quantity
        and (
          coalesce(btrim(search_term), '') = ''
          or strpos(lower(warehouse.code), lower(btrim(search_term))) > 0
          or strpos(lower(warehouse.name), lower(btrim(search_term))) > 0
        )
      group by warehouse.id, warehouse.code, warehouse.name
    ), page as (
      select eligible.*,
        row_number() over (order by lower(warehouse_name), lower(warehouse_code), warehouse_id) as page_order
      from eligible
      order by lower(warehouse_name), lower(warehouse_code), warehouse_id
      limit requested_limit offset requested_offset
    )
    select jsonb_build_object(
      'items', coalesce(
        (select jsonb_agg(to_jsonb(page) - 'page_order' order by page_order) from page),
        '[]'::jsonb
      ),
      'total_count', (select count(*) from eligible)
    )
  );
end;
$$;

alter function public.inventory_adjustment_warehouses_read(uuid, uuid, text, integer, integer)
  owner to postgres;
revoke all on function public.inventory_adjustment_warehouses_read(uuid, uuid, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_adjustment_warehouses_read(uuid, uuid, text, integer, integer)
  to authenticated;

comment on function public.inventory_adjustment_warehouses_read(uuid, uuid, text, integer, integer) is
  'Busca almacenes activos con cantidad física no reservada para ajustes negativos, incluyendo buckets vencidos, dañados y en cuarentena.';

commit;
