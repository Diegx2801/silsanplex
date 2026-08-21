-- Cierre del maestro de clientes: identidad fiscal protegida e importacion controlada.

create or replace function public.protect_customer_fiscal_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.document_type is distinct from new.document_type
    or old.document_number is distinct from new.document_number then
    raise exception using
      errcode = '22023',
      message = 'CUSTOMER_FISCAL_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger customers_protect_fiscal_identity
before update of document_type, document_number on public.customers
for each row execute function public.protect_customer_fiscal_identity();

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
  row_number integer;
  v_document_type text;
  v_document_number text;
  v_legal_name text;
  row_key text;
  seen_keys text[] := array[]::text[];
  v_customer_id uuid;
  previous_customer jsonb;
  fiscal_address_id uuid;
  primary_contact_id uuid;
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

  if import_mode not in ('SKIP', 'UPDATE') then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_IMPORT_MODE';
  end if;
  if jsonb_typeof(payload->'rows') <> 'array'
    or jsonb_array_length(payload->'rows') = 0
    or jsonb_array_length(payload->'rows') > 500 then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_IMPORT_SIZE';
  end if;

  for row_item in select value from jsonb_array_elements(payload->'rows')
  loop
    row_number := coalesce((row_item->>'rowNumber')::integer, 0);
    v_document_type := upper(btrim(row_item->>'documentType'));
    v_document_number := upper(regexp_replace(btrim(row_item->>'documentNumber'), '\s+', '', 'g'));
    v_legal_name := btrim(row_item->>'legalName');
    row_key := v_document_type || ':' || v_document_number;
    v_customer_id := null;
    previous_customer := null;
    fiscal_address_id := null;
    primary_contact_id := null;

    begin
      if v_document_type not in ('RUC', 'DNI', 'CE', 'OTHER')
        or v_document_number is null or char_length(v_document_number) > 20
        or (v_document_type = 'RUC' and v_document_number !~ '^[0-9]{11}$')
        or (v_document_type = 'DNI' and v_document_number !~ '^[0-9]{8}$')
        or v_legal_name is null or char_length(v_legal_name) not between 2 and 160
        or char_length(coalesce(row_item->>'tradeName', '')) > 120
        or char_length(coalesce(row_item->>'contactName', '')) > 120
        or char_length(coalesce(row_item->>'email', '')) > 254
        or (nullif(btrim(row_item->>'email'), '') is not null
          and btrim(row_item->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
        or char_length(coalesce(row_item->>'phone', '')) > 30
        or (nullif(btrim(row_item->>'fiscalAddress'), '') is not null
          and char_length(btrim(row_item->>'fiscalAddress')) not between 3 and 240)
        or (nullif(btrim(row_item->>'ubigeoCode'), '') is not null
          and btrim(row_item->>'ubigeoCode') !~ '^[0-9]{6}$')
        or char_length(coalesce(row_item->>'taxpayerStatus', '')) > 40
        or char_length(coalesce(row_item->>'domicileCondition', '')) > 40 then
        raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_IMPORT_ROW';
      end if;

      if row_key = any(seen_keys) then
        skipped_count := skipped_count + 1;
        results := results || jsonb_build_array(jsonb_build_object(
          'rowNumber', row_number, 'documentNumber', v_document_number,
          'status', 'SKIPPED', 'message', 'Documento repetido dentro del archivo.'
        ));
        continue;
      end if;
      seen_keys := array_append(seen_keys, row_key);

      select customer.id, to_jsonb(customer)
      into v_customer_id, previous_customer
      from public.customers customer
      where customer.organization_id = v_organization_id
        and customer.document_type = v_document_type
        and customer.document_number = v_document_number
      for update;

      if v_customer_id is not null and import_mode = 'SKIP' then
        skipped_count := skipped_count + 1;
        results := results || jsonb_build_array(jsonb_build_object(
          'rowNumber', row_number, 'documentNumber', v_document_number,
          'status', 'SKIPPED', 'message', 'El cliente ya existe en la organizacion.'
        ));
        continue;
      end if;

      if v_customer_id is null then
        v_customer_id := gen_random_uuid();
        insert into public.customers (
          id, organization_id, document_type, document_number, legal_name,
          trade_name, taxpayer_status, domicile_condition, tax_data_source,
          is_active, created_by, updated_by
        ) values (
          v_customer_id, v_organization_id, v_document_type, v_document_number, v_legal_name,
          nullif(btrim(row_item->>'tradeName'), ''),
          nullif(upper(btrim(row_item->>'taxpayerStatus')), ''),
          nullif(upper(btrim(row_item->>'domicileCondition')), ''),
          'IMPORT', coalesce((row_item->>'isActive')::boolean, true), actor_id, actor_id
        );
        created_count := created_count + 1;
      else
        update public.customers set
          legal_name = v_legal_name,
          trade_name = coalesce(nullif(btrim(row_item->>'tradeName'), ''), customers.trade_name),
          taxpayer_status = coalesce(nullif(upper(btrim(row_item->>'taxpayerStatus')), ''), customers.taxpayer_status),
          domicile_condition = coalesce(nullif(upper(btrim(row_item->>'domicileCondition')), ''), customers.domicile_condition),
          tax_data_source = case
            when nullif(btrim(row_item->>'taxpayerStatus'), '') is not null
              or nullif(btrim(row_item->>'domicileCondition'), '') is not null then 'IMPORT'
            else customers.tax_data_source
          end,
          is_active = coalesce((row_item->>'isActive')::boolean, customers.is_active),
          updated_by = actor_id
        where customers.id = v_customer_id and customers.organization_id = v_organization_id;
        updated_count := updated_count + 1;
      end if;

      if nullif(btrim(row_item->>'fiscalAddress'), '') is not null then
        select address.id into fiscal_address_id
        from public.customer_addresses address
        where address.organization_id = v_organization_id
          and address.customer_id = v_customer_id
          and address.address_type = 'FISCAL'
          and address.is_active
        for update;

        if fiscal_address_id is null then
          insert into public.customer_addresses (
            organization_id, customer_id, address_type, address_line,
            ubigeo_code, is_default
          ) values (
            v_organization_id, v_customer_id, 'FISCAL', btrim(row_item->>'fiscalAddress'),
            nullif(btrim(row_item->>'ubigeoCode'), ''), true
          );
        else
          update public.customer_addresses set
            address_line = btrim(row_item->>'fiscalAddress'),
            ubigeo_code = coalesce(nullif(btrim(row_item->>'ubigeoCode'), ''), customer_addresses.ubigeo_code),
            is_default = true
          where customer_addresses.id = fiscal_address_id
            and customer_addresses.organization_id = v_organization_id;
        end if;
      end if;

      if nullif(btrim(row_item->>'contactName'), '') is not null
        or nullif(btrim(row_item->>'email'), '') is not null
        or nullif(btrim(row_item->>'phone'), '') is not null then
        select contact.id into primary_contact_id
        from public.customer_contacts contact
        where contact.organization_id = v_organization_id
          and contact.customer_id = v_customer_id
          and contact.is_primary and contact.is_active
        for update;

        if primary_contact_id is null then
          insert into public.customer_contacts (
            organization_id, customer_id, full_name, email, phone, is_primary
          ) values (
            v_organization_id, v_customer_id,
            nullif(btrim(row_item->>'contactName'), ''),
            nullif(lower(btrim(row_item->>'email')), ''),
            nullif(btrim(row_item->>'phone'), ''), true
          );
        else
          update public.customer_contacts set
            full_name = coalesce(nullif(btrim(row_item->>'contactName'), ''), customer_contacts.full_name),
            email = coalesce(nullif(lower(btrim(row_item->>'email')), ''), customer_contacts.email),
            phone = coalesce(nullif(btrim(row_item->>'phone'), ''), customer_contacts.phone)
          where customer_contacts.id = primary_contact_id
            and customer_contacts.organization_id = v_organization_id;
        end if;
      end if;

      insert into public.audit_events (
        organization_id, actor_user_id, action, entity_type, entity_id,
        old_values, new_values
      ) values (
        v_organization_id, actor_id,
        case when previous_customer is null then 'CUSTOMER_IMPORTED' else 'CUSTOMER_IMPORT_UPDATED' end,
        'customer', v_customer_id::text, previous_customer,
        (select to_jsonb(customer) from public.customers customer where customer.id = v_customer_id)
      );

      results := results || jsonb_build_array(jsonb_build_object(
        'rowNumber', row_number, 'documentNumber', v_document_number,
        'status', case when previous_customer is null then 'CREATED' else 'UPDATED' end,
        'message', case when previous_customer is null then 'Cliente creado.' else 'Cliente actualizado.' end
      ));
    exception when others then
      failed_count := failed_count + 1;
      results := results || jsonb_build_array(jsonb_build_object(
        'rowNumber', row_number,
        'documentNumber', coalesce(v_document_number, ''),
        'status', 'FAILED',
        'message', case
          when sqlstate = '23505' then 'El documento ya existe.'
          when sqlstate = '22023' then 'La fila contiene datos invalidos.'
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

revoke all on function public.protect_customer_fiscal_identity() from public, anon, authenticated;
revoke all on function public.import_customers(jsonb) from public, anon;
grant execute on function public.import_customers(jsonb) to authenticated;

comment on function public.import_customers(jsonb) is
  'Importa hasta 500 clientes por lote, preservando aislamiento, auditoria e hijos existentes.';
