begin;

-- Exportar es una capacidad independiente de consultar. El Kardex no expone
-- costos; el permiso controla únicamente la descarga de su detalle operativo.
insert into public.permissions (code, name, description, is_directly_assignable)
values (
  'INVENTORY_EXPORT',
  'Exportar inventario',
  'Exportar reportes operativos de inventario autorizados.',
  true
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true,
    is_directly_assignable = true;

insert into public.role_permissions (role_code, permission_code)
values
  ('ADMIN', 'INVENTORY_EXPORT'),
  ('GERENCIA', 'INVENTORY_EXPORT'),
  ('LOGISTICA', 'INVENTORY_EXPORT'),
  ('ALMACEN', 'INVENTORY_EXPORT')
on conflict do nothing;

insert into public.permission_dependencies (permission_code, required_permission_code)
values ('INVENTORY_EXPORT', 'INVENTORY_VIEW')
on conflict do nothing;

-- Mantiene saldos independientes por posición física y condición del stock.
-- Un saldo de lote no debe mezclar ubicaciones, cuarentena ni productos dañados.
create or replace view public.inventory_kardex
with (security_invoker = true)
as
select
  movement.id,
  movement.organization_id,
  movement.product_id,
  movement.product_code,
  movement.product_description,
  movement.unit_of_measure,
  movement.movement_type,
  movement.quantity,
  movement.warehouse,
  movement.lot,
  movement.expiration_date,
  movement.operation_date,
  movement.reason,
  movement.source_type,
  movement.source_id,
  movement.created_by,
  movement.created_at,
  movement.warehouse_id,
  movement.location_id,
  movement.stock_status,
  movement.unit_cost,
  movement.transfer_id,
  case
    when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity
    else 0::numeric
  end as inbound_quantity,
  case
    when movement.movement_type in ('salida', 'ajuste-negativo') then movement.quantity
    else 0::numeric
  end as outbound_quantity,
  case
    when movement.movement_type in ('entrada', 'ajuste-positivo')
      then movement.quantity * movement.unit_cost
    else 0::numeric
  end as inbound_value,
  case
    when movement.movement_type in ('salida', 'ajuste-negativo')
      then movement.quantity * movement.unit_cost
    else 0::numeric
  end as outbound_value,
  sum(
    case
      when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity
      else -movement.quantity
    end
  ) over (
    partition by movement.organization_id, movement.product_id,
      movement.warehouse_id, movement.location_id, movement.stock_status,
      coalesce(movement.lot, ''), movement.expiration_date
    order by movement.operation_date, movement.ledger_sequence
    rows between unbounded preceding and current row
  ) as running_quantity,
  sum(
    case
      when movement.movement_type in ('entrada', 'ajuste-positivo')
        then movement.quantity * movement.unit_cost
      else -(movement.quantity * movement.unit_cost)
    end
  ) over (
    partition by movement.organization_id, movement.product_id,
      movement.warehouse_id, movement.location_id, movement.stock_status,
      coalesce(movement.lot, ''), movement.expiration_date
    order by movement.operation_date, movement.ledger_sequence
    rows between unbounded preceding and current row
  ) as running_value,
  movement.ledger_sequence,
  movement.document_reference
from public.inventory_movements movement;

create index if not exists inventory_movements_kardex_position_idx
  on public.inventory_movements (
    organization_id, product_id, warehouse_id, location_id, stock_status,
    lot, expiration_date, operation_date, ledger_sequence
  );

create or replace function public.inventory_kardex_report_read(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_date_from date,
  requested_date_to date,
  requested_warehouse_id uuid default null,
  requested_lot text default '',
  requested_limit integer default 25,
  requested_offset integer default 0,
  requested_export boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_lot text := lower(left(btrim(coalesce(requested_lot, '')), 60));
  total_export_rows bigint;
begin
  if requested_export is null
    or actor_id is null
    or not public.has_organization_permission(
      requested_organization_id,
      case when requested_export then 'INVENTORY_EXPORT' else 'INVENTORY_VIEW' end
    ) then
    raise exception using errcode = '42501', message = 'INVENTORY_REPORT_FORBIDDEN';
  end if;

  if requested_organization_id is null
    or requested_product_id is null
    or requested_date_from is null
    or requested_date_to is null
    or requested_date_from > requested_date_to
    or requested_limit is null
    or requested_offset is null
    or requested_offset < 0
    or (requested_export and (requested_limit <> 10000 or requested_offset <> 0))
    or (not requested_export and (requested_limit < 1 or requested_limit > 100)) then
    raise exception using
      errcode = '22023',
      message = 'INVENTORY_REPORT_FILTER_INVALID';
  end if;

  if requested_export then
    select count(*)
    into total_export_rows
    from public.inventory_movements movement
    where movement.organization_id = requested_organization_id
      and movement.product_id = requested_product_id
      and movement.operation_date between requested_date_from and requested_date_to
      and (requested_warehouse_id is null or movement.warehouse_id = requested_warehouse_id)
      and (
        normalized_lot = ''
        or strpos(lower(coalesce(movement.lot, '')), normalized_lot) > 0
      );

    if total_export_rows > 10000 then
      raise exception using
        errcode = '22023',
        message = 'INVENTORY_REPORT_EXPORT_LIMIT_EXCEEDED';
    end if;
  end if;

  return (
    with filtered as materialized (
      select
        kardex.id,
        kardex.ledger_sequence,
        kardex.operation_date,
        kardex.created_at,
        kardex.product_id,
        kardex.product_code,
        kardex.product_description,
        coalesce(kardex.unit_of_measure, '') as unit_of_measure,
        kardex.warehouse_id,
        kardex.warehouse,
        location.code as location_code,
        location.name as location_name,
        kardex.stock_status,
        coalesce(kardex.lot, '') as lot,
        kardex.expiration_date,
        kardex.movement_type,
        kardex.inbound_quantity,
        kardex.outbound_quantity,
        kardex.running_quantity - kardex.inbound_quantity + kardex.outbound_quantity as opening_quantity,
        kardex.running_quantity as closing_quantity,
        coalesce(kardex.document_reference, '') as document_reference,
        kardex.source_type,
        kardex.reason,
        coalesce(profile.full_name, 'Usuario no disponible') as responsible
      from public.inventory_kardex kardex
      join public.warehouse_locations location
        on location.organization_id = kardex.organization_id
       and location.warehouse_id = kardex.warehouse_id
       and location.id = kardex.location_id
      left join public.profiles profile on profile.id = kardex.created_by
      where kardex.organization_id = requested_organization_id
        and kardex.product_id = requested_product_id
        and kardex.operation_date between requested_date_from and requested_date_to
        and (requested_warehouse_id is null or kardex.warehouse_id = requested_warehouse_id)
        and (
          normalized_lot = ''
          or strpos(lower(coalesce(kardex.lot, '')), normalized_lot) > 0
        )
    ), counted as (
      select filtered.*, count(*) over () as total_count
      from filtered
    ), page as (
      select counted.*,
        row_number() over (order by operation_date, ledger_sequence) as page_order
      from counted
      order by operation_date, ledger_sequence
      limit requested_limit
      offset requested_offset
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', page.id,
          'ledger_sequence', page.ledger_sequence,
          'operation_date', page.operation_date,
          'created_at', page.created_at,
          'product_id', page.product_id,
          'product_code', page.product_code,
          'product_description', page.product_description,
          'unit_of_measure', page.unit_of_measure,
          'warehouse_id', page.warehouse_id,
          'warehouse', page.warehouse,
          'location_code', page.location_code,
          'location_name', page.location_name,
          'stock_status', page.stock_status,
          'lot', page.lot,
          'expiration_date', page.expiration_date,
          'movement_type', page.movement_type,
          'inbound_quantity', page.inbound_quantity,
          'outbound_quantity', page.outbound_quantity,
          'opening_quantity', page.opening_quantity,
          'closing_quantity', page.closing_quantity,
          'document_reference', page.document_reference,
          'source_type', page.source_type,
          'reason', page.reason,
          'responsible', page.responsible
        ) order by page.page_order)
        from page
      ), '[]'::jsonb),
      'total_count', coalesce((select max(counted.total_count) from counted), 0::bigint)
    )
  );
end;
$$;

alter function public.inventory_kardex_report_read(uuid, uuid, date, date, uuid, text, integer, integer, boolean)
  owner to postgres;
revoke all on function public.inventory_kardex_report_read(uuid, uuid, date, date, uuid, text, integer, integer, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_kardex_report_read(uuid, uuid, date, date, uuid, text, integer, integer, boolean)
  to authenticated;

comment on view public.inventory_kardex is
  'Kardex inmutable con saldo acumulado por producto, almacén, ubicación, condición, lote y vencimiento.';
comment on function public.inventory_kardex_report_read(uuid, uuid, date, date, uuid, text, integer, integer, boolean) is
  'Lee el Kardex detallado por producto y periodo; exige INVENTORY_EXPORT para exportación completa y acotada.';

commit;
