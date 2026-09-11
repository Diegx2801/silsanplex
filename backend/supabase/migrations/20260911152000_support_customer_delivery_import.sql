-- Import/export contract for delivery addresses.
-- Delivery rows are additive/upsert operations keyed by exported address id or label;
-- rows omitted from the sheet are never deleted implicitly.

create or replace function public.upsert_imported_customer_delivery_addresses(
  requested_organization_id uuid,
  requested_customer_id uuid,
  requested_addresses jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  address_item jsonb;
  address_id uuid;
  existing_id uuid;
  address_count integer;
  default_count integer;
begin
  if jsonb_typeof(requested_addresses) is distinct from 'array'
    or jsonb_array_length(requested_addresses) = 0
    or jsonb_array_length(requested_addresses) > 20 then
    raise exception using errcode = '22023', message = 'CUSTOMER_DELIVERY_ADDRESS_LIMIT';
  end if;

  select count(*) filter (where coalesce((item.value->>'isDefault')::boolean, false))
  into default_count
  from jsonb_array_elements(requested_addresses) as item(value);
  if default_count <> 1 then
    raise exception using errcode = '22023', message = 'CUSTOMER_DELIVERY_ADDRESS_PRIMARY_REQUIRED';
  end if;

  for address_item in select value from jsonb_array_elements(requested_addresses)
  loop
    address_id := nullif(address_item->>'id', '')::uuid;

    if address_id is not null then
      if not exists (
        select 1
        from public.customer_addresses address
        where address.id = address_id
          and address.organization_id = requested_organization_id
          and address.customer_id = requested_customer_id
          and address.address_type = 'DELIVERY'
      ) then
        raise exception using errcode = '42501', message = 'CUSTOMER_ADDRESS_NOT_OWNED';
      end if;
    else
      select address.id
      into existing_id
      from public.customer_addresses address
      where address.organization_id = requested_organization_id
        and address.customer_id = requested_customer_id
        and address.address_type = 'DELIVERY'
        and address.is_active
        and nullif(btrim(address_item->>'label'), '') is not null
        and lower(address.label) = lower(btrim(address_item->>'label'))
      order by address.id
      limit 1
      for update;
      address_id := coalesce(existing_id, gen_random_uuid());
    end if;

    update public.customer_addresses
    set address_type = 'DELIVERY',
        label = nullif(btrim(address_item->>'label'), ''),
        address_line = btrim(address_item->>'addressLine'),
        ubigeo_code = nullif(btrim(address_item->>'ubigeoCode'), ''),
        reference = nullif(btrim(address_item->>'reference'), ''),
        is_default = coalesce((address_item->>'isDefault')::boolean, false),
        is_active = true
    where id = address_id
      and organization_id = requested_organization_id
      and customer_id = requested_customer_id;

    if not found then
      insert into public.customer_addresses (
        id, organization_id, customer_id, address_type, label, address_line,
        ubigeo_code, reference, is_default
      ) values (
        address_id, requested_organization_id, requested_customer_id, 'DELIVERY',
        nullif(btrim(address_item->>'label'), ''), btrim(address_item->>'addressLine'),
        nullif(btrim(address_item->>'ubigeoCode'), ''),
        nullif(btrim(address_item->>'reference'), ''),
        coalesce((address_item->>'isDefault')::boolean, false)
      );
    end if;
  end loop;

  select count(*)
  into address_count
  from public.customer_addresses address
  where address.organization_id = requested_organization_id
    and address.customer_id = requested_customer_id
    and address.address_type = 'DELIVERY'
    and address.is_active;
  if address_count > 20 then
    raise exception using errcode = '22023', message = 'CUSTOMER_DELIVERY_ADDRESS_LIMIT';
  end if;
end;
$$;

revoke all on function public.upsert_imported_customer_delivery_addresses(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_imported_customer_delivery_addresses(uuid, uuid, jsonb)
  to service_role;

create or replace function public.import_customers(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  v_organization_id uuid;
  import_mode text := upper(coalesce(nullif(btrim(payload->>'mode'), ''), 'SKIP'));
  row_item jsonb;
  normalized_item jsonb;
  address_payload jsonb;
  core_result jsonb;
  core_row jsonb;
  v_row_number integer;
  v_document_type text;
  v_document_number text;
  v_row_key text;
  v_customer_id uuid;
  seen_keys text[] := array[]::text[];
  results jsonb := '[]'::jsonb;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  failed_count integer := 0;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  v_organization_id := public.current_organization_for_permission('CUSTOMERS_MANAGE');

  if jsonb_typeof(payload->'rows') is distinct from 'array'
    or jsonb_array_length(payload->'rows') = 0
    or jsonb_array_length(payload->'rows') > 500 then
    return public.import_customers_core(payload);
  end if;

  for row_item in select value from jsonb_array_elements(payload->'rows')
  loop
    v_row_number := coalesce((row_item->>'rowNumber')::integer, 0);
    v_document_type := upper(btrim(row_item->>'documentType'));
    v_document_number := upper(regexp_replace(btrim(row_item->>'documentNumber'), '\s+', '', 'g'));
    v_row_key := v_document_type || ':' || v_document_number;

    begin
      if v_row_key = any(seen_keys) then
        skipped_count := skipped_count + 1;
        results := results || jsonb_build_array(jsonb_build_object(
          'rowNumber', v_row_number, 'documentNumber', v_document_number,
          'status', 'SKIPPED', 'message', 'Documento repetido dentro del archivo.'
        ));
        continue;
      end if;
      seen_keys := array_append(seen_keys, v_row_key);

      address_payload := row_item->'direccionesEntrega';
      if address_payload is not null then
        select coalesce(jsonb_agg(
          entry.value || jsonb_build_object(
            'addressType', 'DELIVERY',
            'addressLine', entry.value->>'direccion',
            'ubigeoCode', entry.value->>'ubigeo',
            'reference', entry.value->>'referencia',
            'isDefault', coalesce((entry.value->>'principal')::boolean, false)
          )
          order by entry.ordinality
        ), '[]'::jsonb)
        into address_payload
        from jsonb_array_elements(address_payload) with ordinality as entry(value, ordinality);
      end if;

      normalized_item := row_item - 'direccionesEntrega';
      normalized_item := normalized_item || jsonb_build_object(
        'tradeName', public.normalize_customer_import_optional(row_item->>'tradeName'),
        'contactName', public.normalize_customer_import_optional(row_item->>'contactName'),
        'email', public.normalize_customer_import_optional(row_item->>'email'),
        'phone', public.normalize_customer_import_optional(row_item->>'phone'),
        'fiscalAddress', public.normalize_customer_import_optional(row_item->>'fiscalAddress'),
        'ubigeoCode', public.normalize_customer_import_optional(row_item->>'ubigeoCode'),
        'taxpayerStatus', public.normalize_customer_import_optional(row_item->>'taxpayerStatus'),
        'domicileCondition', public.normalize_customer_import_optional(row_item->>'domicileCondition')
      );

      core_result := public.import_customers_core(jsonb_build_object(
        'mode', import_mode,
        'rows', jsonb_build_array(normalized_item)
      ));
      core_row := core_result->'rows'->0;

      if core_row->>'status' in ('CREATED', 'UPDATED')
        and jsonb_typeof(address_payload) = 'array'
        and jsonb_array_length(address_payload) > 0 then
        select customer.id into v_customer_id
        from public.customers customer
        where customer.organization_id = v_organization_id
          and customer.document_type = v_document_type
          and customer.document_number = v_document_number;
        if v_customer_id is null then
          raise exception using errcode = 'P0002', message = 'CUSTOMER_NOT_FOUND';
        end if;
        perform public.upsert_imported_customer_delivery_addresses(
          v_organization_id, v_customer_id, address_payload
        );
      end if;

      created_count := created_count + coalesce((core_result->>'created')::integer, 0);
      updated_count := updated_count + coalesce((core_result->>'updated')::integer, 0);
      skipped_count := skipped_count + coalesce((core_result->>'skipped')::integer, 0);
      failed_count := failed_count + coalesce((core_result->>'failed')::integer, 0);
      results := results || jsonb_build_array(core_row);
    exception when others then
      failed_count := failed_count + 1;
      results := results || jsonb_build_array(jsonb_build_object(
        'rowNumber', v_row_number,
        'documentNumber', v_document_number,
        'status', 'FAILED',
        'message', case
          when sqlstate = '42501' and sqlerrm = 'CUSTOMER_ADDRESS_NOT_OWNED' then 'Una dirección no pertenece al cliente indicado.'
          when sqlstate = '22023' and sqlerrm = 'CUSTOMER_DELIVERY_ADDRESS_LIMIT' then 'El cliente supera el límite de 20 direcciones de entrega.'
          when sqlstate = '22023' and sqlerrm = 'CUSTOMER_DELIVERY_ADDRESS_PRIMARY_REQUIRED' then 'La importación debe marcar exactamente una dirección principal.'
          else 'No se pudo procesar la fila.'
        end
      ));
    end;
  end loop;

  return jsonb_build_object(
    'created', created_count,
    'updated', updated_count,
    'skipped', skipped_count,
    'failed', failed_count,
    'rows', results
  );
end;
$$;

revoke all on function public.import_customers(jsonb) from public, anon;
grant execute on function public.import_customers(jsonb) to authenticated, service_role;

comment on function public.import_customers(jsonb) is
  'Importa clientes y direcciones de entrega en hojas separadas, con operaciones seguras y no destructivas.';
