begin;

-- Period filters are the primary access pattern for operational movement reports.
create index if not exists inventory_movements_organization_operation_date_idx
  on public.inventory_movements (organization_id, operation_date, warehouse_id);

create or replace function public.inventory_movement_summary_read(
  requested_organization_id uuid,
  requested_date_from date,
  requested_date_to date,
  search_term text default '',
  requested_warehouse_id uuid default null,
  requested_limit integer default 25,
  requested_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text := lower(left(btrim(coalesce(search_term, '')), 100));
begin
  perform inventory_internal.assert_inventory_read(requested_organization_id);

  if requested_date_from is null
    or requested_date_to is null
    or requested_date_from > requested_date_to
    or requested_limit is null
    or requested_limit < 1
    or requested_limit > 100
    or requested_offset is null
    or requested_offset < 0 then
    raise exception using
      errcode = '22023',
      message = 'INVENTORY_REPORT_FILTER_INVALID';
  end if;

  return (
    with grouped as (
      select
        movement.product_id,
        movement.product_code,
        movement.product_description,
        movement.unit_of_measure,
        movement.warehouse_id,
        movement.warehouse,
        movement.stock_status,
        sum(case
          when movement.movement_type in ('entrada', 'ajuste-positivo')
            then movement.quantity
          else 0::numeric
        end) as inbound_quantity,
        sum(case
          when movement.movement_type in ('salida', 'ajuste-negativo')
            then movement.quantity
          else 0::numeric
        end) as outbound_quantity,
        count(*) as movement_count
      from public.inventory_movements movement
      where movement.organization_id = requested_organization_id
        and movement.operation_date >= requested_date_from
        and movement.operation_date <= requested_date_to
        and (
          requested_warehouse_id is null
          or movement.warehouse_id = requested_warehouse_id
        )
        and (
          normalized_search = ''
          or strpos(lower(movement.product_code), normalized_search) > 0
          or strpos(lower(movement.product_description), normalized_search) > 0
          or strpos(lower(movement.warehouse), normalized_search) > 0
        )
      group by
        movement.product_id,
        movement.product_code,
        movement.product_description,
        movement.unit_of_measure,
        movement.warehouse_id,
        movement.warehouse,
        movement.stock_status
    ), counted as (
      select grouped.*, count(*) over () as total_count
      from grouped
    ), page as (
      select counted.*,
        row_number() over (
          order by product_code, product_description, product_id,
            warehouse, warehouse_id nulls last, stock_status,
            unit_of_measure nulls last
        ) as page_order
      from counted
      order by page_order
      limit requested_limit
      offset requested_offset
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'product_id', page.product_id,
            'product_code', page.product_code,
            'product_description', page.product_description,
            'unit_of_measure', page.unit_of_measure,
            'warehouse_id', page.warehouse_id,
            'warehouse', page.warehouse,
            'stock_status', page.stock_status,
            'inbound_quantity', page.inbound_quantity,
            'outbound_quantity', page.outbound_quantity,
            'net_quantity', page.inbound_quantity - page.outbound_quantity,
            'movement_count', page.movement_count
          ) order by page.page_order
        )
        from page
      ), '[]'::jsonb),
      'total_count', coalesce((select max(counted.total_count) from counted), 0::bigint),
      'total_movements', coalesce((select sum(grouped.movement_count) from grouped), 0::numeric)
    )
  );
end;
$$;

alter function public.inventory_movement_summary_read(uuid, date, date, text, uuid, integer, integer)
  owner to postgres;
revoke all on function public.inventory_movement_summary_read(uuid, date, date, text, uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_movement_summary_read(uuid, date, date, text, uuid, integer, integer)
  to authenticated;

comment on function public.inventory_movement_summary_read(uuid, date, date, text, uuid, integer, integer) is
  'Resumen paginado de movimientos del periodo autorizado por INVENTORY_VIEW; conserva unidades y condición del stock.';

commit;
