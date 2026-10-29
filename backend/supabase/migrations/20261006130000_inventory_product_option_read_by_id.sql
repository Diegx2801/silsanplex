create or replace function public.inventory_product_option_read_by_id(
  requested_organization_id uuid,
  requested_product_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform inventory_internal.assert_inventory_read(requested_organization_id);

  return (
    select jsonb_build_object(
      'items', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'product_id', product.id,
            'product_code', product.code,
            'product_description', product.description,
            'barcode', product.barcode,
            'unit_of_measure', product.unit_of_measure,
            'batch_control', product.batch_control,
            'expiration_control', product.expiration_control
          )
        ),
        '[]'::jsonb
      ),
      'total_count', count(*)
    )
    from public.products product
    where product.organization_id = requested_organization_id
      and product.id = requested_product_id
      and product.product_type = 'good'
      and product.is_active
  );
end;
$$;

alter function public.inventory_product_option_read_by_id(uuid, uuid)
  owner to postgres;
revoke all on function public.inventory_product_option_read_by_id(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_product_option_read_by_id(uuid, uuid)
  to authenticated;

comment on function public.inventory_product_option_read_by_id(uuid, uuid) is
  'Lee la opcion completa de un bien activo para acciones contextuales de Inventario, validando INVENTORY_VIEW.';
