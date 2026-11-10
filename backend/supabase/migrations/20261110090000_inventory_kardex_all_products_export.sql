begin;

create or replace function public.inventory_kardex_all_products_export_read(
  requested_organization_id uuid,
  requested_date_from date,
  requested_date_to date,
  search_term text default '',
  requested_warehouse_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_search text := lower(left(btrim(coalesce(search_term, '')), 100));
  total_export_rows bigint;
begin
  if actor_id is null
    or not public.has_organization_permission(requested_organization_id, 'INVENTORY_EXPORT') then
    raise exception using errcode = '42501', message = 'INVENTORY_REPORT_FORBIDDEN';
  end if;

  if requested_organization_id is null
    or requested_date_from is null
    or requested_date_to is null
    or requested_date_from > requested_date_to then
    raise exception using errcode = '22023', message = 'INVENTORY_REPORT_FILTER_INVALID';
  end if;

  select count(*)
  into total_export_rows
  from public.inventory_movements movement
  where movement.organization_id = requested_organization_id
    and movement.operation_date between requested_date_from and requested_date_to
    and (requested_warehouse_id is null or movement.warehouse_id = requested_warehouse_id)
    and (
      normalized_search = ''
      or strpos(lower(movement.product_code), normalized_search) > 0
      or strpos(lower(movement.product_description), normalized_search) > 0
      or strpos(lower(movement.warehouse), normalized_search) > 0
    );

  if total_export_rows > 10000 then
    raise exception using errcode = '22023', message = 'INVENTORY_REPORT_EXPORT_LIMIT_EXCEEDED';
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
        coalesce(location.code, '') as location_code,
        coalesce(location.name, 'Sin ubicación') as location_name,
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
      left join public.warehouse_locations location
        on location.organization_id = kardex.organization_id
       and location.warehouse_id = kardex.warehouse_id
       and location.id = kardex.location_id
      left join public.profiles profile on profile.id = kardex.created_by
      where kardex.organization_id = requested_organization_id
        and kardex.operation_date between requested_date_from and requested_date_to
        and (requested_warehouse_id is null or kardex.warehouse_id = requested_warehouse_id)
        and (
          normalized_search = ''
          or strpos(lower(kardex.product_code), normalized_search) > 0
          or strpos(lower(kardex.product_description), normalized_search) > 0
          or strpos(lower(kardex.warehouse), normalized_search) > 0
        )
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', filtered.id,
          'ledger_sequence', filtered.ledger_sequence,
          'operation_date', filtered.operation_date,
          'created_at', filtered.created_at,
          'product_id', filtered.product_id,
          'product_code', filtered.product_code,
          'product_description', filtered.product_description,
          'unit_of_measure', filtered.unit_of_measure,
          'warehouse_id', filtered.warehouse_id,
          'warehouse', filtered.warehouse,
          'location_code', filtered.location_code,
          'location_name', filtered.location_name,
          'stock_status', filtered.stock_status,
          'lot', filtered.lot,
          'expiration_date', filtered.expiration_date,
          'movement_type', filtered.movement_type,
          'inbound_quantity', filtered.inbound_quantity,
          'outbound_quantity', filtered.outbound_quantity,
          'opening_quantity', filtered.opening_quantity,
          'closing_quantity', filtered.closing_quantity,
          'document_reference', filtered.document_reference,
          'source_type', filtered.source_type,
          'reason', filtered.reason,
          'responsible', filtered.responsible
        ) order by filtered.operation_date, filtered.ledger_sequence, filtered.product_code, filtered.id)
        from filtered
      ), '[]'::jsonb),
      'total_count', (select count(*) from filtered)
    )
  );
end;
$$;

alter function public.inventory_kardex_all_products_export_read(uuid, date, date, text, uuid)
  owner to postgres;
revoke all on function public.inventory_kardex_all_products_export_read(uuid, date, date, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_kardex_all_products_export_read(uuid, date, date, text, uuid)
  to authenticated;

comment on function public.inventory_kardex_all_products_export_read(uuid, date, date, text, uuid) is
  'Exporta el detalle operativo del Kardex de todos los productos dentro del periodo y filtros autorizados, con máximo de 10 000 movimientos.';

commit;
