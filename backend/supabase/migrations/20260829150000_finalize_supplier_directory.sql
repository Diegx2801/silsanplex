-- Operaciones controladas del mantenedor de proveedores.

alter table public.suppliers drop constraint suppliers_tax_provenance_consistency;
alter table public.suppliers add constraint suppliers_tax_provenance_consistency check (
  tax_data_source is null
  or tax_data_source in ('MANUAL', 'IMPORT')
  or tax_checked_at is not null
);

create or replace function public.set_supplier_status(
  requested_supplier_id uuid,
  requested_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  v_organization_id uuid;
begin
  v_organization_id := public.current_organization_for_permission('SUPPLIERS_MANAGE');
  update public.suppliers
  set is_active = requested_active, updated_by = actor_id
  where id = requested_supplier_id and suppliers.organization_id = v_organization_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'SUPPLIER_NOT_FOUND';
  end if;
end;
$$;

create or replace function public.import_suppliers(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  v_organization_id uuid;
  import_mode text := upper(coalesce(payload->>'mode', 'SKIP'));
  row_item jsonb;
  row_number integer;
  v_document_type text;
  v_document_number text;
  v_business_name text;
  supplier_id uuid;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  failed_count integer := 0;
  results jsonb := '[]'::jsonb;
begin
  v_organization_id := public.current_organization_for_permission('SUPPLIERS_MANAGE');
  if import_mode not in ('SKIP', 'UPDATE') or jsonb_typeof(payload->'rows') <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_SUPPLIER_IMPORT_PAYLOAD';
  end if;
  if jsonb_array_length(payload->'rows') > 500 then
    raise exception using errcode = '22023', message = 'SUPPLIER_IMPORT_LIMIT_EXCEEDED';
  end if;

  for row_item in select value from jsonb_array_elements(payload->'rows') loop
    supplier_id := null;
    row_number := coalesce((row_item->>'rowNumber')::integer, 0);
    v_document_type := lower(btrim(row_item->>'documentType'));
    v_document_number := upper(btrim(row_item->>'documentNumber'));
    v_business_name := btrim(row_item->>'legalName');
    if v_document_type = 'other' then v_document_type := 'otro'; end if;

    begin
      if v_document_type not in ('ruc', 'dni', 'ce', 'pasaporte', 'otro')
        or coalesce(v_document_number, '') = '' or coalesce(v_business_name, '') = ''
        or char_length(v_business_name) not between 2 and 160 then
        raise exception using errcode = '22023', message = 'INVALID_SUPPLIER_IMPORT_ROW';
      end if;

      select id into supplier_id from public.suppliers
      where suppliers.organization_id = v_organization_id
        and suppliers.document_type = v_document_type
        and suppliers.document_number = v_document_number
      for update;

      if supplier_id is not null and import_mode = 'SKIP' then
        skipped_count := skipped_count + 1;
        results := results || jsonb_build_array(jsonb_build_object('rowNumber', row_number, 'documentNumber', v_document_number, 'status', 'SKIPPED', 'message', 'El proveedor ya existe.'));
        continue;
      end if;

      if supplier_id is null then
        insert into public.suppliers (
          organization_id, code, document_type, document_number, business_name,
          trade_name, contact_name, email, phone, fiscal_address, ubigeo_code,
          taxpayer_status, domicile_condition, tax_data_source, is_active,
          created_by, updated_by
        ) values (
          v_organization_id, nullif(upper(btrim(row_item->>'code')), ''), v_document_type,
          v_document_number, v_business_name, nullif(btrim(row_item->>'tradeName'), ''),
          nullif(btrim(row_item->>'contactName'), ''), nullif(lower(btrim(row_item->>'email')), ''),
          nullif(btrim(row_item->>'phone'), ''), nullif(btrim(row_item->>'fiscalAddress'), ''),
          nullif(btrim(row_item->>'ubigeoCode'), ''), nullif(upper(btrim(row_item->>'taxpayerStatus')), ''),
          nullif(upper(btrim(row_item->>'domicileCondition')), ''),
          case
            when nullif(btrim(row_item->>'taxpayerStatus'), '') is not null
              or nullif(btrim(row_item->>'domicileCondition'), '') is not null
              or nullif(btrim(row_item->>'fiscalAddress'), '') is not null
            then 'IMPORT'
            else null
          end,
          coalesce((row_item->>'isActive')::boolean, true), actor_id, actor_id
        );
        created_count := created_count + 1;
        results := results || jsonb_build_array(jsonb_build_object('rowNumber', row_number, 'documentNumber', v_document_number, 'status', 'CREATED', 'message', 'Proveedor creado.'));
      else
        update public.suppliers set
          code = coalesce(nullif(upper(btrim(row_item->>'code')), ''), suppliers.code),
          business_name = v_business_name,
          trade_name = coalesce(nullif(btrim(row_item->>'tradeName'), ''), suppliers.trade_name),
          contact_name = coalesce(nullif(btrim(row_item->>'contactName'), ''), suppliers.contact_name),
          email = coalesce(nullif(lower(btrim(row_item->>'email')), ''), suppliers.email),
          phone = coalesce(nullif(btrim(row_item->>'phone'), ''), suppliers.phone),
          fiscal_address = coalesce(nullif(btrim(row_item->>'fiscalAddress'), ''), suppliers.fiscal_address),
          ubigeo_code = coalesce(nullif(btrim(row_item->>'ubigeoCode'), ''), suppliers.ubigeo_code),
          taxpayer_status = coalesce(nullif(upper(btrim(row_item->>'taxpayerStatus')), ''), suppliers.taxpayer_status),
          domicile_condition = coalesce(nullif(upper(btrim(row_item->>'domicileCondition')), ''), suppliers.domicile_condition),
          tax_data_source = case when nullif(btrim(row_item->>'taxpayerStatus'), '') is not null or nullif(btrim(row_item->>'domicileCondition'), '') is not null then 'IMPORT' else suppliers.tax_data_source end,
          is_active = coalesce((row_item->>'isActive')::boolean, suppliers.is_active),
          updated_by = actor_id
        where id = supplier_id and suppliers.organization_id = v_organization_id;
        updated_count := updated_count + 1;
        results := results || jsonb_build_array(jsonb_build_object('rowNumber', row_number, 'documentNumber', v_document_number, 'status', 'UPDATED', 'message', 'Proveedor actualizado.'));
      end if;
    exception when others then
      failed_count := failed_count + 1;
      results := results || jsonb_build_array(jsonb_build_object('rowNumber', row_number, 'documentNumber', v_document_number, 'status', 'FAILED', 'message', 'La fila no cumple las reglas del directorio.'));
    end;
  end loop;

  return jsonb_build_object('created', created_count, 'updated', updated_count, 'skipped', skipped_count, 'failed', failed_count, 'rows', results);
end;
$$;

revoke all on function public.set_supplier_status(uuid, boolean) from public, anon;
revoke all on function public.import_suppliers(jsonb) from public, anon;
grant execute on function public.set_supplier_status(uuid, boolean) to authenticated, service_role;
grant execute on function public.import_suppliers(jsonb) to authenticated, service_role;
