begin;

create schema if not exists inventory_internal;
alter schema inventory_internal owner to postgres;

create or replace function inventory_internal.assert_no_incompatible_service_state()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_bucket_count bigint;
  service_reservation_count bigint;
begin
  select count(*)
  into service_bucket_count
  from (
    select
      movement.organization_id,
      movement.product_id,
      movement.warehouse_id,
      movement.location_id,
      movement.stock_status,
      coalesce(movement.lot, '') as lot,
      movement.expiration_date
    from public.inventory_movements movement
    join public.products product
      on product.organization_id = movement.organization_id
     and product.id = movement.product_id
    where product.product_type = 'service'
    group by
      movement.organization_id,
      movement.product_id,
      movement.warehouse_id,
      movement.location_id,
      movement.stock_status,
      coalesce(movement.lot, ''),
      movement.expiration_date
    having sum(
      case
        when movement.movement_type in ('entrada', 'ajuste-positivo')
          then movement.quantity
        else -movement.quantity
      end
    ) <> 0
  ) incompatible_bucket;

  select count(*)
  into service_reservation_count
  from public.inventory_reservations reservation
  join public.products product
    on product.organization_id = reservation.organization_id
   and product.id = reservation.product_id
  where product.product_type = 'service'
    and reservation.status = 'active'
    and reservation.quantity - reservation.quantity_consumed > 0;

  if service_bucket_count > 0 or service_reservation_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_READ_MODEL_MIGRATION_BLOCKED_SERVICE_STATE',
      detail = pg_catalog.format(
        'service_buckets=%s,service_reservations=%s',
        service_bucket_count,
        service_reservation_count
      );
  end if;
end;
$$;

alter function inventory_internal.assert_no_incompatible_service_state()
  owner to postgres;
revoke all on function inventory_internal.assert_no_incompatible_service_state()
  from public, anon, authenticated, service_role;
grant execute on function inventory_internal.assert_no_incompatible_service_state()
  to postgres;

-- La migracion solo puede continuar si el estado actual es compatible con el
-- modelo factual que deja de depender del tipo actual del catalogo.
do $$
begin
  perform inventory_internal.assert_no_incompatible_service_state();
end;
$$;

create or replace view public.inventory_bucket_balances
with (security_invoker = true)
as
select
  movement.organization_id,
  movement.product_id,
  movement.product_code,
  movement.product_description,
  movement.unit_of_measure,
  movement.warehouse_id,
  warehouse.code as warehouse_code,
  warehouse.name as warehouse_name,
  movement.location_id,
  location.code as location_code,
  location.name as location_name,
  movement.stock_status,
  coalesce(movement.lot, '') as lot,
  lower(coalesce(movement.lot, '')) as normalized_lot,
  movement.expiration_date,
  sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
    then movement.quantity else -movement.quantity end) as physical_quantity,
  sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
    then movement.quantity * movement.unit_cost
    else -(movement.quantity * movement.unit_cost) end) as inventory_value,
  case
    when sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
      then movement.quantity else -movement.quantity end) > 0
    then round(
      sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
        then movement.quantity * movement.unit_cost
        else -(movement.quantity * movement.unit_cost) end)
      / sum(case when movement.movement_type in ('entrada', 'ajuste-positivo')
        then movement.quantity else -movement.quantity end), 4)
    else 0
  end as average_cost
from public.inventory_movements movement
join public.warehouses warehouse
  on warehouse.organization_id = movement.organization_id
 and warehouse.id = movement.warehouse_id
join public.warehouse_locations location
  on location.organization_id = movement.organization_id
 and location.warehouse_id = movement.warehouse_id
 and location.id = movement.location_id
group by
  movement.organization_id, movement.product_id, movement.product_code,
  movement.product_description, movement.unit_of_measure, movement.warehouse_id,
  warehouse.code, warehouse.name, movement.location_id, location.code, location.name,
  movement.stock_status, coalesce(movement.lot, ''),
  lower(coalesce(movement.lot, '')), movement.expiration_date;

create or replace view public.inventory_product_stock_summary
with (security_invoker = true)
as
with stock_by_product as (
  select
    summary.organization_id,
    summary.product_id,
    sum(summary.physical_quantity) as physical_quantity,
    sum(summary.sanitary_available_quantity) as sanitary_available_quantity,
    sum(summary.reserved_quantity) as reserved_quantity,
    sum(summary.assignable_quantity) as assignable_quantity,
    sum(summary.quarantine_quantity) as quarantine_quantity,
    sum(summary.damaged_quantity) as damaged_quantity,
    sum(summary.expired_quantity) as expired_quantity,
    sum(summary.inventory_value) as inventory_value,
    count(distinct summary.warehouse_id) filter (
      where summary.physical_quantity > 0
    ) as warehouse_count,
    sum(summary.bucket_count)::bigint as bucket_count,
    sum(summary.lot_count)::bigint as lot_count
  from public.inventory_stock_summary summary
  group by summary.organization_id, summary.product_id
)
select
  product.organization_id,
  product.id as product_id,
  product.code as product_code,
  product.description as product_description,
  product.laboratory,
  product.unit_of_measure,
  coalesce(stock.physical_quantity, 0::numeric) as physical_quantity,
  coalesce(stock.sanitary_available_quantity, 0::numeric)
    as sanitary_available_quantity,
  coalesce(stock.reserved_quantity, 0::numeric) as reserved_quantity,
  coalesce(stock.assignable_quantity, 0::numeric) as assignable_quantity,
  coalesce(stock.quarantine_quantity, 0::numeric) as quarantine_quantity,
  coalesce(stock.damaged_quantity, 0::numeric) as damaged_quantity,
  coalesce(stock.expired_quantity, 0::numeric) as expired_quantity,
  coalesce(stock.inventory_value, 0::numeric) as inventory_value,
  coalesce(stock.warehouse_count, 0::bigint) as warehouse_count,
  coalesce(stock.bucket_count, 0::bigint) as bucket_count,
  coalesce(stock.lot_count, 0::bigint) as lot_count
from public.products product
left join stock_by_product stock
  on stock.organization_id = product.organization_id
 and stock.product_id = product.id
where product.product_type = 'good'
  and (
    product.is_active
    or coalesce(stock.physical_quantity, 0) > 0
    or exists (
      select 1
      from public.inventory_reservations reservation
      where reservation.organization_id = product.organization_id
        and reservation.product_id = product.id
        and reservation.status = 'active'
        and reservation.quantity - reservation.quantity_consumed > 0
    )
  );

create or replace view public.inventory_low_stock_alerts
with (security_invoker = true)
as
select
  setting.organization_id,
  setting.product_id,
  product.code as product_code,
  product.description as product_description,
  product.unit_of_measure,
  setting.warehouse_id,
  warehouse.code as warehouse_code,
  warehouse.name as warehouse_name,
  coalesce(summary.assignable_quantity, 0::numeric) as assignable_quantity,
  setting.minimum_stock,
  coalesce(summary.assignable_quantity, 0::numeric) <= setting.minimum_stock
    as has_low_stock_alert
from public.product_warehouse_settings setting
join public.products product
  on product.organization_id = setting.organization_id
 and product.id = setting.product_id
join public.warehouses warehouse
  on warehouse.organization_id = setting.organization_id
 and warehouse.id = setting.warehouse_id
left join public.inventory_stock_summary summary
  on summary.organization_id = setting.organization_id
 and summary.product_id = setting.product_id
 and summary.warehouse_id = setting.warehouse_id
where product.product_type = 'good'
  and product.is_active
  and coalesce(summary.assignable_quantity, 0::numeric) <= setting.minimum_stock;

create or replace function inventory_internal.assert_inventory_read(
  requested_organization_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or requested_organization_id is null
    or not public.has_organization_permission(
      requested_organization_id,
      'INVENTORY_VIEW'
    ) then
    raise exception using
      errcode = '42501',
      message = 'INVENTORY_READ_FORBIDDEN';
  end if;
end;
$$;

alter function inventory_internal.assert_inventory_read(uuid) owner to postgres;
revoke all on function inventory_internal.assert_inventory_read(uuid)
  from public, anon, authenticated, service_role;
grant execute on function inventory_internal.assert_inventory_read(uuid)
  to postgres;

comment on function inventory_internal.assert_inventory_read(uuid) is
  'Validacion interna de identidad, organizacion y INVENTORY_VIEW para read models de Inventario.';

create or replace function public.inventory_product_options(
  requested_organization_id uuid,
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
declare
  normalized_search text := lower(btrim(coalesce(search_term, '')));
begin
  perform inventory_internal.assert_inventory_read(requested_organization_id);

  if requested_limit is null
    or requested_limit < 1
    or requested_limit > 50
    or requested_offset is null
    or requested_offset < 0 then
    raise exception using
      errcode = '22023',
      message = 'INVENTORY_READ_PAGINATION_INVALID';
  end if;

  return (
    with filtered as (
      select
        product.id as product_id,
        product.code as product_code,
        product.description as product_description,
        product.barcode,
        product.unit_of_measure,
        product.batch_control,
        product.expiration_control
      from public.products product
      where product.organization_id = requested_organization_id
        and product.product_type = 'good'
        and product.is_active
        and (
          normalized_search = ''
          or product.code ilike '%' || normalized_search || '%'
          or product.description ilike '%' || normalized_search || '%'
          or coalesce(product.barcode, '') ilike '%' || normalized_search || '%'
        )
    ),
    counted as (
      select filtered.*, count(*) over () as total_count
      from filtered
    ),
    page as (
      select *
      from counted
      order by product_code, product_id
      limit requested_limit
      offset requested_offset
    )
    select jsonb_build_object(
      'items', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'product_id', page.product_id,
              'product_code', page.product_code,
              'product_description', page.product_description,
              'barcode', page.barcode,
              'unit_of_measure', page.unit_of_measure,
              'batch_control', page.batch_control,
              'expiration_control', page.expiration_control
            )
            order by page.product_code, page.product_id
          )
          from page
        ),
        '[]'::jsonb
      ),
      'total_count', coalesce(
        (select max(counted.total_count) from counted),
        0::bigint
      )
    )
  );
end;
$$;

alter function public.inventory_product_options(uuid, text, integer, integer)
  owner to postgres;
revoke all on function public.inventory_product_options(uuid, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_product_options(uuid, text, integer, integer)
  to authenticated;

comment on function public.inventory_product_options(uuid, text, integer, integer) is
  'Opciones paginadas de bienes activos para operaciones de Inventario autorizadas.';

create or replace function public.inventory_product_stock_summary_read(
  requested_organization_id uuid,
  search_term text default '',
  requested_stock_filter text default 'todos',
  requested_sort text default 'producto-asc',
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
  normalized_search text := lower(btrim(coalesce(search_term, '')));
begin
  perform inventory_internal.assert_inventory_read(requested_organization_id);

  if requested_limit is null
    or requested_limit < 1
    or requested_limit > 50
    or requested_offset is null
    or requested_offset < 0
    or requested_stock_filter not in ('todos', 'con-stock', 'sin-stock')
    or requested_sort not in (
      'producto-asc', 'producto-desc', 'codigo-asc', 'codigo-desc',
      'stock-asc', 'stock-desc'
    ) then
    raise exception using
      errcode = '22023',
      message = 'INVENTORY_READ_PAGINATION_INVALID';
  end if;

  return (
    with stock_by_product as (
      select
        summary.organization_id,
        summary.product_id,
        sum(summary.physical_quantity) as physical_quantity,
        sum(summary.sanitary_available_quantity) as sanitary_available_quantity,
        sum(summary.reserved_quantity) as reserved_quantity,
        sum(summary.assignable_quantity) as assignable_quantity,
        sum(summary.quarantine_quantity) as quarantine_quantity,
        sum(summary.damaged_quantity) as damaged_quantity,
        sum(summary.expired_quantity) as expired_quantity,
        sum(summary.inventory_value) as inventory_value,
        count(distinct summary.warehouse_id) filter (
          where summary.physical_quantity > 0
        ) as warehouse_count,
        sum(summary.bucket_count)::bigint as bucket_count,
        sum(summary.lot_count)::bigint as lot_count
      from public.inventory_stock_summary summary
      where summary.organization_id = requested_organization_id
      group by summary.organization_id, summary.product_id
    ),
    active_residual_by_product as (
      select
        reservation.organization_id,
        reservation.product_id,
        sum(reservation.quantity - reservation.quantity_consumed) as residual_quantity
      from public.inventory_reservations reservation
      where reservation.organization_id = requested_organization_id
        and reservation.status = 'active'
        and reservation.quantity - reservation.quantity_consumed > 0
      group by reservation.organization_id, reservation.product_id
    ),
    filtered as (
      select
        product.id as product_id,
        product.code as product_code,
        product.description as product_description,
        product.laboratory,
        product.unit_of_measure,
        coalesce(stock.physical_quantity, 0::numeric) as physical_quantity,
        coalesce(stock.sanitary_available_quantity, 0::numeric)
          as sanitary_available_quantity,
        coalesce(stock.reserved_quantity, 0::numeric) as reserved_quantity,
        coalesce(stock.assignable_quantity, 0::numeric) as assignable_quantity,
        coalesce(stock.quarantine_quantity, 0::numeric) as quarantine_quantity,
        coalesce(stock.damaged_quantity, 0::numeric) as damaged_quantity,
        coalesce(stock.expired_quantity, 0::numeric) as expired_quantity,
        coalesce(stock.inventory_value, 0::numeric) as inventory_value,
        coalesce(stock.warehouse_count, 0::bigint) as warehouse_count,
        coalesce(stock.bucket_count, 0::bigint) as bucket_count,
        coalesce(stock.lot_count, 0::bigint) as lot_count
      from public.products product
      left join stock_by_product stock
        on stock.organization_id = product.organization_id
       and stock.product_id = product.id
      left join active_residual_by_product residual
        on residual.organization_id = product.organization_id
       and residual.product_id = product.id
      where product.organization_id = requested_organization_id
        and product.product_type = 'good'
        and (
          product.is_active
          or coalesce(stock.physical_quantity, 0) > 0
          or coalesce(residual.residual_quantity, 0) > 0
        )
        and (
          normalized_search = ''
          or product.code ilike '%' || normalized_search || '%'
          or product.description ilike '%' || normalized_search || '%'
          or coalesce(product.laboratory, '') ilike '%' || normalized_search || '%'
        )
        and (
          requested_stock_filter = 'todos'
          or (
            requested_stock_filter = 'con-stock'
            and coalesce(stock.assignable_quantity, 0) > 0
          )
          or (
            requested_stock_filter = 'sin-stock'
            and coalesce(stock.assignable_quantity, 0) <= 0
          )
        )
    ),
    counted as (
      select filtered.*, count(*) over () as total_count
      from filtered
    ),
    page as (
      select *
      from counted
      order by
        case when requested_sort = 'producto-asc' then product_description end asc nulls last,
        case when requested_sort = 'producto-desc' then product_description end desc nulls last,
        case when requested_sort = 'codigo-asc' then product_code end asc nulls last,
        case when requested_sort = 'codigo-desc' then product_code end desc nulls last,
        case when requested_sort = 'stock-asc' then assignable_quantity end asc nulls last,
        case when requested_sort = 'stock-desc' then assignable_quantity end desc nulls last,
        product_code asc,
        product_id asc
      limit requested_limit
      offset requested_offset
    )
    select jsonb_build_object(
      'items', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'product_id', page.product_id,
              'product_code', page.product_code,
              'product_description', page.product_description,
              'laboratory', page.laboratory,
              'unit_of_measure', page.unit_of_measure,
              'physical_quantity', page.physical_quantity,
              'sanitary_available_quantity', page.sanitary_available_quantity,
              'reserved_quantity', page.reserved_quantity,
              'assignable_quantity', page.assignable_quantity,
              'quarantine_quantity', page.quarantine_quantity,
              'damaged_quantity', page.damaged_quantity,
              'expired_quantity', page.expired_quantity,
              'inventory_value', page.inventory_value,
              'warehouse_count', page.warehouse_count,
              'bucket_count', page.bucket_count,
              'lot_count', page.lot_count
            )
            order by
              case when requested_sort = 'producto-asc' then page.product_description end asc nulls last,
              case when requested_sort = 'producto-desc' then page.product_description end desc nulls last,
              case when requested_sort = 'codigo-asc' then page.product_code end asc nulls last,
              case when requested_sort = 'codigo-desc' then page.product_code end desc nulls last,
              case when requested_sort = 'stock-asc' then page.assignable_quantity end asc nulls last,
              case when requested_sort = 'stock-desc' then page.assignable_quantity end desc nulls last,
              page.product_code asc,
              page.product_id asc
          )
          from page
        ),
        '[]'::jsonb
      ),
      'total_count', coalesce(
        (select max(counted.total_count) from counted),
        0::bigint
      )
    )
  );
end;
$$;

alter function public.inventory_product_stock_summary_read(uuid, text, text, text, integer, integer)
  owner to postgres;
revoke all on function public.inventory_product_stock_summary_read(uuid, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_product_stock_summary_read(uuid, text, text, text, integer, integer)
  to authenticated;

comment on function public.inventory_product_stock_summary_read(uuid, text, text, text, integer, integer) is
  'Read model paginado de existencias autorizado por INVENTORY_VIEW.';

create or replace function public.inventory_low_stock_alerts_read(
  requested_organization_id uuid,
  search_term text default '',
  requested_warehouse_id uuid default null,
  requested_sort text default 'producto-asc',
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
  normalized_search text := lower(btrim(coalesce(search_term, '')));
begin
  perform inventory_internal.assert_inventory_read(requested_organization_id);

  if requested_limit is null
    or requested_limit < 1
    or requested_limit > 50
    or requested_offset is null
    or requested_offset < 0
    or requested_sort not in ('producto-asc', 'stock-asc') then
    raise exception using
      errcode = '22023',
      message = 'INVENTORY_READ_PAGINATION_INVALID';
  end if;

  return (
    with filtered as (
      select
        product.id as product_id,
        product.code as product_code,
        product.description as product_description,
        product.unit_of_measure,
        setting.warehouse_id,
        warehouse.code as warehouse_code,
        warehouse.name as warehouse_name,
        coalesce(summary.assignable_quantity, 0::numeric) as assignable_quantity,
        setting.minimum_stock
      from public.product_warehouse_settings setting
      join public.products product
        on product.organization_id = setting.organization_id
       and product.id = setting.product_id
      join public.warehouses warehouse
        on warehouse.organization_id = setting.organization_id
       and warehouse.id = setting.warehouse_id
      left join public.inventory_stock_summary summary
        on summary.organization_id = setting.organization_id
       and summary.product_id = setting.product_id
       and summary.warehouse_id = setting.warehouse_id
      where setting.organization_id = requested_organization_id
        and product.product_type = 'good'
        and product.is_active
        and (
          requested_warehouse_id is null
          or setting.warehouse_id = requested_warehouse_id
        )
        and (
          normalized_search = ''
          or product.code ilike '%' || normalized_search || '%'
          or product.description ilike '%' || normalized_search || '%'
        )
        and coalesce(summary.assignable_quantity, 0::numeric) <= setting.minimum_stock
    ),
    counted as (
      select filtered.*, count(*) over () as total_count
      from filtered
    ),
    page as (
      select *
      from counted
      order by
        case when requested_sort = 'producto-asc' then product_description end asc nulls last,
        case when requested_sort = 'stock-asc' then assignable_quantity end asc nulls last,
        product_code asc,
        product_id asc,
        warehouse_id asc
      limit requested_limit
      offset requested_offset
    )
    select jsonb_build_object(
      'items', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'product_id', page.product_id,
              'product_code', page.product_code,
              'product_description', page.product_description,
              'unit_of_measure', page.unit_of_measure,
              'warehouse_id', page.warehouse_id,
              'warehouse_code', page.warehouse_code,
              'warehouse_name', page.warehouse_name,
              'assignable_quantity', page.assignable_quantity,
              'minimum_stock', page.minimum_stock
            )
            order by
              case when requested_sort = 'producto-asc' then page.product_description end asc nulls last,
              case when requested_sort = 'stock-asc' then page.assignable_quantity end asc nulls last,
              page.product_code asc,
              page.product_id asc,
              page.warehouse_id asc
          )
          from page
        ),
        '[]'::jsonb
      ),
      'total_count', coalesce(
        (select max(counted.total_count) from counted),
        0::bigint
      )
    )
  );
end;
$$;

alter function public.inventory_low_stock_alerts_read(uuid, text, uuid, text, integer, integer)
  owner to postgres;
revoke all on function public.inventory_low_stock_alerts_read(uuid, text, uuid, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_low_stock_alerts_read(uuid, text, uuid, text, integer, integer)
  to authenticated;

comment on function public.inventory_low_stock_alerts_read(uuid, text, uuid, text, integer, integer) is
  'Read model paginado de alertas de reposicion autorizado por INVENTORY_VIEW.';

commit;
