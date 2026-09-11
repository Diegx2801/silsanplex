-- C3: contrato tributario explicito para la importacion de productos.
-- La migracion conserva las capas P1E-1, C1 y C2 y agrega un resolver unico
-- antes de que el payload llegue a los cores historicos.

begin;

create or replace function public.product_import_inc_igv_kind(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(pg_catalog.btrim(coalesce(value, '')), '') is null then ''
    when lower(pg_catalog.btrim(value)) in ('s' || pg_catalog.chr(237), 'si')
      then 'S' || pg_catalog.chr(237)
    when lower(pg_catalog.btrim(value)) = 'no' then 'No'
    when lower(pg_catalog.btrim(value)) = 'pendiente' then 'Pendiente'
    else 'Inválido'
  end;
$$;

create or replace function public.product_import_tax_affectation_kind(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(pg_catalog.btrim(coalesce(value, '')))
    when '' then ''
    when 'gravado' then 'gravado'
    when 'exonerado' then 'exonerado'
    when 'inafecto' then 'inafecto'
    when 'por-definir' then 'por-definir'
    when 'por definir' then 'por-definir'
    else 'Inválido'
  end;
$$;

revoke all on function public.product_import_inc_igv_kind(text)
  from public, anon, authenticated, service_role;
grant execute on function public.product_import_inc_igv_kind(text) to postgres;

revoke all on function public.product_import_tax_affectation_kind(text)
  from public, anon, authenticated, service_role;
grant execute on function public.product_import_tax_affectation_kind(text) to postgres;

comment on function public.product_import_inc_igv_kind(text) is
  'Normaliza IncIGV a Sí, No, Pendiente o vacio; valores desconocidos quedan invalidos.';
comment on function public.product_import_tax_affectation_kind(text) is
  'Normaliza AfectacionTributaria a sus cuatro valores canonicos; acepta por definir como variante lexical documentada.';

create or replace function public.resolve_product_import_tax_payload(
  requested_organization_id uuid,
  requested_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  contract_column_present boolean;
  contract_mode text;
  existing_by_code jsonb := '{}'::jsonb;
  first_price_by_code jsonb := '{}'::jsonb;
  resolutions jsonb := '{}'::jsonb;
  errors_by_code jsonb := '{}'::jsonb;
  warnings jsonb := '[]'::jsonb;
  resolved_products jsonb := '[]'::jsonb;
  resolved_prices jsonb := '[]'::jsonb;
  product_item jsonb;
  price_item jsonb;
  product_out jsonb;
  price_out jsonb;
  existing_product jsonb;
  resolution jsonb;
  first_price jsonb;
  code text;
  raw_affectation text;
  affectation_kind text;
  effective_affectation text;
  first_inc_igv text;
  inc_igv_kind text;
  raw_sale text;
  raw_minimum text;
  raw_cost text;
  source_sale numeric;
  source_minimum numeric;
  existing_sale numeric;
  existing_minimum numeric;
  final_sale numeric;
  final_minimum numeric;
  reference_sale numeric;
  factor numeric;
  is_existing boolean;
  update_tax boolean;
  legacy_preserve boolean;
  deterministic boolean;
  source_sale_present boolean;
  source_minimum_present boolean;
  update_sale boolean;
  update_minimum boolean;
begin
  if requested_payload is null
    or pg_catalog.jsonb_typeof(requested_payload) <> 'object'
    or pg_catalog.jsonb_typeof(requested_payload -> 'productos') <> 'array'
    or pg_catalog.jsonb_typeof(requested_payload -> 'precios') <> 'array'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  if requested_payload ? 'afectacion_tributaria_columna_presente'
    and pg_catalog.jsonb_typeof(requested_payload -> 'afectacion_tributaria_columna_presente') <> 'boolean'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  contract_column_present := coalesce(
    (requested_payload ->> 'afectacion_tributaria_columna_presente')::boolean,
    false
  );

  if contract_column_present and exists (
    select 1
    from pg_catalog.jsonb_array_elements(requested_payload -> 'productos') source(item)
    where nullif(pg_catalog.btrim(source.item ->> 'afectacion_tributaria'), '') is not null
  ) then
    contract_mode := 'explicit_value';
  elsif contract_column_present then
    contract_mode := 'explicit_blank';
  else
    contract_mode := 'legacy';
  end if;

  -- Estas validaciones estructurales siguen siendo globales, como en el core
  -- historico. Las reglas tributarias y de precios se acumulan por SKU abajo.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(requested_payload -> 'productos') source(item)
    where pg_catalog.jsonb_typeof(source.item) <> 'object'
      or not coalesce(pg_catalog.jsonb_typeof(source.item -> 'codigo') = 'string', false)
      or nullif(pg_catalog.btrim(source.item ->> 'codigo'), '') is null
      or not coalesce(
        upper(pg_catalog.btrim(source.item ->> 'codigo')) ~ '^[A-Z0-9][A-Z0-9._-]{0,29}$',
        false
      )
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(requested_payload -> 'precios') source(item)
    where pg_catalog.jsonb_typeof(source.item) <> 'object'
      or not coalesce(pg_catalog.jsonb_typeof(source.item -> 'codigo_producto') = 'string', false)
      or nullif(pg_catalog.btrim(source.item ->> 'codigo_producto'), '') is null
      or not coalesce(
        upper(pg_catalog.btrim(source.item ->> 'codigo_producto')) ~ '^[A-Z0-9][A-Z0-9._-]{0,29}$',
        false
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  select coalesce(
    pg_catalog.jsonb_object_agg(codes.code, pg_catalog.to_jsonb(product)),
    '{}'::jsonb
  )
  into existing_by_code
  from (
    select distinct upper(pg_catalog.btrim(source.item ->> 'codigo')) as code
    from pg_catalog.jsonb_array_elements(requested_payload -> 'productos') source(item)
    union
    select distinct upper(pg_catalog.btrim(source.item ->> 'codigo_producto')) as code
    from pg_catalog.jsonb_array_elements(requested_payload -> 'precios') source(item)
  ) codes
  join public.products product
    on product.organization_id = requested_organization_id
   and product.code = codes.code;

  select coalesce(
    pg_catalog.jsonb_object_agg(selected.code, selected.item),
    '{}'::jsonb
  )
  into first_price_by_code
  from (
    select distinct on (upper(pg_catalog.btrim(source.item ->> 'codigo_producto')))
      upper(pg_catalog.btrim(source.item ->> 'codigo_producto')) as code,
      source.item
    from pg_catalog.jsonb_array_elements(requested_payload -> 'precios')
      with ordinality source(item, ordinality)
    order by
      upper(pg_catalog.btrim(source.item ->> 'codigo_producto')),
      coalesce((source.item ->> 'fila')::integer, source.ordinality::integer),
      source.ordinality
  ) selected;

  for product_item in
    select source.item
    from pg_catalog.jsonb_array_elements(requested_payload -> 'productos')
      with ordinality source(item, ordinality)
    order by source.ordinality
  loop
    code := upper(pg_catalog.btrim(product_item ->> 'codigo'));
    existing_product := existing_by_code -> code;
    is_existing := existing_product is not null;
    first_price := first_price_by_code -> code;
    first_inc_igv := public.product_import_inc_igv_kind(first_price ->> 'inc_igv');
    raw_affectation := nullif(pg_catalog.btrim(product_item ->> 'afectacion_tributaria'), '');
    update_tax := false;
    legacy_preserve := false;

    if not contract_column_present then
      if raw_affectation is not null then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code,
          array[code],
          coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'producto',
              'fila', product_item -> 'fila',
              'codigo', product_item -> 'codigo',
              'motivo', 'PRODUCT_IMPORT_TAX_AFFECTATION_INVALID'
            )
          ),
          true
        );
      end if;

      if first_inc_igv = 'S' || pg_catalog.chr(237) then
        effective_affectation := 'gravado';
        update_tax := true;
      elsif is_existing then
        effective_affectation := coalesce(existing_product ->> 'tax_affectation', 'por-definir');
        legacy_preserve := true;
      else
        effective_affectation := 'por-definir';
      end if;
    else
      affectation_kind := public.product_import_tax_affectation_kind(raw_affectation);
      if affectation_kind = 'Inválido' then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code,
          array[code],
          coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'producto',
              'fila', product_item -> 'fila',
              'codigo', product_item -> 'codigo',
              'motivo', 'PRODUCT_IMPORT_TAX_AFFECTATION_INVALID'
            )
          ),
          true
        );
      end if;

      if raw_affectation is null then
        if is_existing then
          effective_affectation := coalesce(existing_product ->> 'tax_affectation', 'por-definir');
        else
          effective_affectation := 'por-definir';
        end if;
      else
        effective_affectation := case
          when affectation_kind = 'Inválido' then coalesce(existing_product ->> 'tax_affectation', 'por-definir')
          else affectation_kind
        end;
        update_tax := true;
      end if;
    end if;

    resolutions := pg_catalog.jsonb_set(
      resolutions,
      array[code],
      pg_catalog.jsonb_build_object(
        'modo', contract_mode,
        'producto_existente', is_existing,
        'afectacion_efectiva', effective_affectation,
        'actualiza_tax_affectation', update_tax,
        'legacy_preserve', legacy_preserve
      ),
      true
    );

    product_out := (product_item - 'afectacion_tributaria') || pg_catalog.jsonb_build_object(
      'tax_affectation', effective_affectation
    );
    resolved_products := resolved_products || pg_catalog.jsonb_build_array(product_out);
  end loop;

  for price_item in
    select source.item
    from pg_catalog.jsonb_array_elements(requested_payload -> 'precios')
      with ordinality source(item, ordinality)
    order by source.ordinality
  loop
    code := upper(pg_catalog.btrim(price_item ->> 'codigo_producto'));
    existing_product := existing_by_code -> code;
    is_existing := existing_product is not null;
    resolution := resolutions -> code;

    if resolution is null then
      first_price := first_price_by_code -> code;
      first_inc_igv := public.product_import_inc_igv_kind(first_price ->> 'inc_igv');
      legacy_preserve := false;
      update_tax := false;
      if not contract_column_present then
        if first_inc_igv = 'S' || pg_catalog.chr(237) then
          effective_affectation := 'gravado';
          update_tax := true;
        elsif is_existing then
          effective_affectation := coalesce(existing_product ->> 'tax_affectation', 'por-definir');
          legacy_preserve := true;
        else
          effective_affectation := 'por-definir';
        end if;
      elsif is_existing then
        effective_affectation := coalesce(existing_product ->> 'tax_affectation', 'por-definir');
      else
        effective_affectation := 'por-definir';
      end if;
      resolution := pg_catalog.jsonb_build_object(
        'modo', case when contract_column_present then 'explicit_blank' else 'legacy' end,
        'producto_existente', is_existing,
        'afectacion_efectiva', effective_affectation,
        'actualiza_tax_affectation', update_tax,
        'legacy_preserve', legacy_preserve
      );
      resolutions := pg_catalog.jsonb_set(resolutions, array[code], resolution, true);
    else
      effective_affectation := resolution ->> 'afectacion_efectiva';
      legacy_preserve := coalesce((resolution ->> 'legacy_preserve')::boolean, false);
    end if;

    effective_affectation := resolution ->> 'afectacion_efectiva';
    legacy_preserve := coalesce((resolution ->> 'legacy_preserve')::boolean, false);
    inc_igv_kind := public.product_import_inc_igv_kind(price_item ->> 'inc_igv');

    if inc_igv_kind = 'Inválido' then
      errors_by_code := pg_catalog.jsonb_set(
        errors_by_code,
        array[code],
        coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'tipo', 'precio',
            'fila', price_item -> 'fila',
            'codigo', price_item -> 'codigo_producto',
            'motivo', 'PRODUCT_IMPORT_INC_IGV_INVALID'
          )
        ),
        true
      );
      resolved_prices := resolved_prices || pg_catalog.jsonb_build_array(price_item);
      continue;
    end if;

    raw_sale := nullif(pg_catalog.btrim(price_item ->> 'precio_venta'), '');
    raw_minimum := nullif(pg_catalog.btrim(price_item ->> 'precio_minimo'), '');
    raw_cost := nullif(pg_catalog.btrim(price_item ->> 'costo_base'), '');
    source_sale_present := raw_sale is not null;
    source_minimum_present := raw_minimum is not null;
    source_sale := null;
    source_minimum := null;
    existing_sale := nullif(existing_product ->> 'sale_price', '')::numeric;
    existing_minimum := nullif(existing_product ->> 'minimum_sale_price', '')::numeric;

    if source_sale_present then
      if raw_sale !~ '^(0|[0-9]+)(\.[0-9]{1,2})?$' then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code,
          array[code],
          coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'precio', 'fila', price_item -> 'fila',
              'codigo', price_item -> 'codigo_producto',
              'motivo', 'PRODUCT_IMPORT_INVALID_PAYLOAD'
            )
          ),
          true
        );
        resolved_prices := resolved_prices || pg_catalog.jsonb_build_array(price_item);
        continue;
      end if;
      if raw_sale::numeric > 999999999999.99 then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code,
          array[code],
          coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'precio', 'fila', price_item -> 'fila',
              'codigo', price_item -> 'codigo_producto',
              'motivo', 'PRODUCT_IMPORT_PRICE_OVERFLOW'
            )
          ),
          true
        );
        resolved_prices := resolved_prices || pg_catalog.jsonb_build_array(price_item);
        continue;
      end if;
      source_sale := raw_sale::numeric;
    end if;

    if source_minimum_present then
      if raw_minimum !~ '^(0|[0-9]+)(\.[0-9]{1,2})?$' then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code,
          array[code],
          coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'precio', 'fila', price_item -> 'fila',
              'codigo', price_item -> 'codigo_producto',
              'motivo', 'PRODUCT_IMPORT_INVALID_PAYLOAD'
            )
          ),
          true
        );
        resolved_prices := resolved_prices || pg_catalog.jsonb_build_array(price_item);
        continue;
      end if;
      if raw_minimum::numeric > 999999999999.99 then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code,
          array[code],
          coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'precio', 'fila', price_item -> 'fila',
              'codigo', price_item -> 'codigo_producto',
              'motivo', 'PRODUCT_IMPORT_PRICE_OVERFLOW'
            )
          ),
          true
        );
        resolved_prices := resolved_prices || pg_catalog.jsonb_build_array(price_item);
        continue;
      end if;
      source_minimum := raw_minimum::numeric;
    end if;

    if raw_cost is not null then
      if raw_cost !~ '^(0|[0-9]+)(\.[0-9]{1,2})?$' then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code,
          array[code],
          coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'precio', 'fila', price_item -> 'fila',
              'codigo', price_item -> 'codigo_producto',
              'motivo', 'PRODUCT_IMPORT_INVALID_PAYLOAD'
            )
          ),
          true
        );
        resolved_prices := resolved_prices || pg_catalog.jsonb_build_array(price_item);
        continue;
      end if;
      if raw_cost::numeric > 999999999999.99 then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code,
          array[code],
          coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'precio', 'fila', price_item -> 'fila',
              'codigo', price_item -> 'codigo_producto',
              'motivo', 'PRODUCT_IMPORT_PRICE_OVERFLOW'
            )
          ),
          true
        );
        resolved_prices := resolved_prices || pg_catalog.jsonb_build_array(price_item);
        continue;
      end if;
    end if;

    deterministic := false;
    factor := 1;
    if legacy_preserve and inc_igv_kind <> ('S' || pg_catalog.chr(237)) then
      deterministic := false;
    elsif effective_affectation in ('exonerado', 'inafecto') then
      deterministic := true;
    elsif effective_affectation = 'gravado' and inc_igv_kind in ('S' || pg_catalog.chr(237), 'No') then
      deterministic := true;
      if inc_igv_kind = 'No' then factor := 1.18; end if;
    elsif effective_affectation = 'por-definir'
      and inc_igv_kind = ('S' || pg_catalog.chr(237)) then
      deterministic := true;
      warnings := warnings || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'tipo', 'precio', 'fila', price_item -> 'fila',
          'codigo', price_item -> 'codigo_producto',
          'motivo', 'PRODUCT_IMPORT_TAX_AFFECTATION_PENDING'
        )
      );
    end if;

    if deterministic then
      final_sale := case when source_sale_present
        then pg_catalog.round(source_sale * factor, 2)
        else existing_sale end;
      final_minimum := case when source_minimum_present
        then pg_catalog.round(source_minimum * factor, 2)
        else existing_minimum end;
      reference_sale := final_sale;

      if final_sale is not null and final_sale > 999999999999.99 then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code, array[code], coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'precio', 'fila', price_item -> 'fila',
              'codigo', price_item -> 'codigo_producto',
              'motivo', 'PRODUCT_IMPORT_PRICE_OVERFLOW'
            )
          ), true
        );
      elsif final_minimum is not null and final_minimum > 999999999999.99 then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code, array[code], coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'precio', 'fila', price_item -> 'fila',
              'codigo', price_item -> 'codigo_producto',
              'motivo', 'PRODUCT_IMPORT_PRICE_OVERFLOW'
            )
          ), true
        );
      elsif source_minimum_present and reference_sale is null then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code, array[code], coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'precio', 'fila', price_item -> 'fila',
              'codigo', price_item -> 'codigo_producto',
              'motivo', 'PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID'
            )
          ), true
        );
      elsif final_minimum is not null and reference_sale is not null and final_minimum > reference_sale then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code, array[code], coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'precio', 'fila', price_item -> 'fila',
              'codigo', price_item -> 'codigo_producto',
              'motivo', 'PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID'
            )
          ), true
        );
      elsif final_sale is not null and not source_minimum_present
        and existing_minimum is not null and existing_minimum > final_sale
      then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code, array[code], coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'precio', 'fila', price_item -> 'fila',
              'codigo', price_item -> 'codigo_producto',
              'motivo', 'PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID'
            )
          ), true
        );
      end if;

      update_sale := source_sale_present;
      update_minimum := source_minimum_present;
      price_out := price_item - array['precio_venta', 'precio_minimo']::text[];
      if final_sale is not null then
        price_out := price_out || pg_catalog.jsonb_build_object('precio_venta', final_sale);
      end if;
      if final_minimum is not null then
        price_out := price_out || pg_catalog.jsonb_build_object('precio_minimo', final_minimum);
      end if;
      price_out := pg_catalog.jsonb_set(
        price_out,
        '{inc_igv}',
        pg_catalog.to_jsonb(inc_igv_kind),
        true
      ) || pg_catalog.jsonb_build_object(
        'tax_affectation', effective_affectation,
        '_c3_update_sale_price', update_sale,
        '_c3_update_minimum_sale_price', update_minimum
      );
    else
      if source_sale_present or source_minimum_present then
        warnings := warnings || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'tipo', 'precio', 'fila', price_item -> 'fila',
            'codigo', price_item -> 'codigo_producto',
            'motivo', 'PRODUCT_IMPORT_AMBIGUOUS_INC_IGV'
          )
        );
      end if;

      -- La ruta legacy conserva P1E-1: en un SKU nuevo ambiguo no se
      -- convierte el minimo en error, simplemente no se persiste.
      if source_minimum_present and not is_existing and contract_column_present then
        errors_by_code := pg_catalog.jsonb_set(
          errors_by_code, array[code], coalesce(errors_by_code -> code, '[]'::jsonb) || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'tipo', 'precio', 'fila', price_item -> 'fila',
              'codigo', price_item -> 'codigo_producto',
              'motivo', 'PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID'
            )
          ), true
        );
      end if;

      price_out := price_item - array['precio_venta', 'precio_minimo']::text[];
      if is_existing then
        if existing_sale is not null then
          price_out := price_out || pg_catalog.jsonb_build_object('precio_venta', existing_sale);
        end if;
        if existing_minimum is not null then
          price_out := price_out || pg_catalog.jsonb_build_object('precio_minimo', existing_minimum);
        end if;
      end if;
      price_out := pg_catalog.jsonb_set(
        price_out,
        '{inc_igv}',
        pg_catalog.to_jsonb(inc_igv_kind),
        true
      ) || pg_catalog.jsonb_build_object(
        'tax_affectation', effective_affectation,
        '_c3_update_sale_price', false,
        '_c3_update_minimum_sale_price', false
      );
    end if;

    resolved_prices := resolved_prices || pg_catalog.jsonb_build_array(price_out);
  end loop;

  return pg_catalog.jsonb_build_object(
    'modo', contract_mode,
    'payload', pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(requested_payload, '{productos}', resolved_products, true),
      '{precios}', resolved_prices, true
    ),
    'resoluciones', resolutions,
    'errores', errors_by_code,
    'advertencias', warnings,
    'afectacion_tributaria_columna_presente', contract_column_present
  );
end;
$$;

revoke all on function public.resolve_product_import_tax_payload(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_product_import_tax_payload(uuid, jsonb) to postgres;

comment on function public.resolve_product_import_tax_payload(uuid, jsonb) is
  'Resolver unico C3: modo de contrato, afectacion efectiva, IncIGV, precios canonicos, minimos, warnings y errores por SKU.';

-- El core C2 sigue siendo la unica capa que valida duplicados, conflictos,
-- inserciones y locks. Solo se le agrega el contexto canonico que produce el
-- resolver; no se reabre ninguna consulta dependiente de P x Q.
-- Normaliza funciones historicas creadas desde Windows; .gitattributes conserva
-- esta migracion con LF para que sus patrones sean portables.
do $migration$
declare
  function_definition text;
  original_definition text;
begin
  select replace(
    pg_get_functiondef('public.import_products_catalog_core(uuid, jsonb)'::regprocedure),
    pg_catalog.chr(13),
    ''
  )
  into function_definition;
  original_definition := function_definition;

  function_definition := replace(
    function_definition,
    $old$      nullif(btrim(source.item ->> 'laboratorio'), '') as laboratory
    from jsonb_array_elements(payload -> 'productos')$old$,
    $new$      nullif(btrim(source.item ->> 'laboratorio'), '') as laboratory,
      nullif(btrim(source.item ->> 'tax_affectation'), '') as tax_affectation
    from jsonb_array_elements(payload -> 'productos')$new$
  );

  function_definition := replace(
    function_definition,
    $old$      normalized.laboratory
    from normalized$old$,
    $new$      normalized.laboratory,
      normalized.tax_affectation
    from normalized$new$
  );

  function_definition := replace(
    function_definition,
    $old$        'laboratorio', selected.laboratory
      )$old$,
    $new$        'laboratorio', selected.laboratory,
        'tax_affectation', selected.tax_affectation
      )$new$
  );

  function_definition := replace(
    function_definition,
    $old$      end as inc_igv
    from jsonb_array_elements(payload -> 'precios')$old$,
    $new$      end as inc_igv,
      nullif(btrim(source.item ->> 'tax_affectation'), '') as tax_affectation
    from jsonb_array_elements(payload -> 'precios')$new$
  );

  function_definition := replace(
    function_definition,
    $old$      normalized.inc_igv
    from normalized$old$,
    $new$      normalized.inc_igv,
      normalized.tax_affectation
    from normalized$new$
  );

  function_definition := replace(
    function_definition,
    $old$        'inc_igv', selected.inc_igv
      )$old$,
    $new$        'inc_igv', selected.inc_igv,
        'tax_affectation', selected.tax_affectation
      )$new$
  );

  function_definition := replace(
    function_definition,
    $old$            'laboratorio', upper(nullif(btrim(item ->> 'laboratorio'), ''))
          )$old$,
    $new$            'laboratorio', upper(nullif(btrim(item ->> 'laboratorio'), '')),
            'tax_affectation', lower(nullif(btrim(item ->> 'tax_affectation'), ''))
          )$new$
  );

  function_definition := replace(
    function_definition,
    $old$            'inc_igv', item ->> 'inc_igv'
          )$old$,
    $new$            'inc_igv', item ->> 'inc_igv',
            'tax_affectation', lower(nullif(btrim(item ->> 'tax_affectation'), ''))
          )$new$
  );

  function_definition := replace(
    function_definition,
    $old$        'laboratorio', upper(nullif(btrim(source.item ->> 'laboratorio'), ''))
      ) as semantic_row$old$,
    $new$        'laboratorio', upper(nullif(btrim(source.item ->> 'laboratorio'), '')),
        'tax_affectation', lower(nullif(btrim(source.item ->> 'tax_affectation'), ''))
      ) as semantic_row$new$
  );

  function_definition := replace(
    function_definition,
    $old$        'inc_igv', case lower(nullif(btrim(source.item ->> 'inc_igv'), ''))$old$,
    $new$        'tax_affectation', lower(nullif(btrim(source.item ->> 'tax_affectation'), '')),
        'inc_igv', case lower(nullif(btrim(source.item ->> 'inc_igv'), ''))$new$
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$existing\.tax_affectation is distinct from case\s+when price_item\.item ->> 'inc_igv' = '[^']+'\s+then 'gravado'\s+else 'por-definir'\s+end$pattern$,
    $replacement$existing.tax_affectation is distinct from coalesce(nullif(price_item.item ->> 'tax_affectation', ''), existing.tax_affectation)$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$existing\.tax_affectation is not distinct from case\s+when price_item\.item ->> 'inc_igv' = '[^']+'\s+then 'gravado'\s+else 'por-definir'\s+end$pattern$,
    $replacement$existing.tax_affectation is not distinct from coalesce(nullif(price_item.item ->> 'tax_affectation', ''), existing.tax_affectation)$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$case\s+when price_item\.item is not null\s+and price_item\.item ->> 'inc_igv' = '[^']+'\s+then 'gravado'\s+else 'por-definir'\s+end$pattern$,
    $replacement$coalesce(nullif(price_item.item ->> 'tax_affectation', ''), nullif(product_item.item ->> 'tax_affectation', ''), 'por-definir')$replacement$,
    'g'
  );

  function_definition := replace(
    function_definition,
    $old$  normalized_payload := jsonb_build_object(
    'productos',$old$,
    $new$  normalized_payload := jsonb_build_object(
    'c3_source_payload_hash', payload -> '_c3_source_payload_hash',
    'productos',$new$
  );

  if function_definition = original_definition
    or position('normalized.tax_affectation' in function_definition) = 0
    or position('c3_source_payload_hash' in function_definition) = 0
    or position('coalesce(nullif(price_item.item ->> ''tax_affectation''' in function_definition) = 0
    or position('existing.tax_affectation is distinct from case' in function_definition) > 0
    or position('existing.tax_affectation is not distinct from case' in function_definition) > 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'C3_PRODUCT_IMPORT_CATALOG_CORE_PATCH_FAILED';
  end if;

  execute function_definition;
end;
$migration$;

create or replace function public.persist_product_import_alternate_units(
  requested_organization_id uuid,
  resolved_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  alternate record;
  resolved_unit_code text;
  resolved_unit_id uuid;
  raw_equivalence text;
  actor_id uuid := (select auth.uid());
begin
  if resolved_payload is null
    or pg_catalog.jsonb_typeof(resolved_payload -> 'precios') <> 'array'
  then
    raise exception using errcode = 'P0001', message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  for alternate in
    select ranked.item
    from (
      select deduplicated.item,
        row_number() over (
          partition by upper(pg_catalog.btrim(deduplicated.item ->> 'codigo_producto'))
          order by deduplicated.row_number, deduplicated.ordinality
        ) as position
      from (
        select distinct on (
          upper(pg_catalog.btrim(source.item ->> 'codigo_producto')),
          coalesce(
            public.normalized_measurement_unit_code(source.item ->> 'unidad_medida'),
            upper(pg_catalog.btrim(source.item ->> 'unidad_medida'))
          )
        )
          source.item,
          coalesce((source.item ->> 'fila')::integer, source.ordinality::integer) as row_number,
          source.ordinality
        from pg_catalog.jsonb_array_elements(resolved_payload -> 'precios')
          with ordinality source(item, ordinality)
        where nullif(pg_catalog.btrim(source.item ->> 'unidad_medida'), '') is not null
        order by
          upper(pg_catalog.btrim(source.item ->> 'codigo_producto')),
          coalesce(
            public.normalized_measurement_unit_code(source.item ->> 'unidad_medida'),
            upper(pg_catalog.btrim(source.item ->> 'unidad_medida'))
          ),
          coalesce((source.item ->> 'fila')::integer, source.ordinality::integer),
          source.ordinality
      ) deduplicated
    ) ranked
    where ranked.position > 1
  loop
    raw_equivalence := nullif(pg_catalog.btrim(alternate.item ->> 'equivalencia'), '');
    if raw_equivalence is null
      or raw_equivalence !~ '^\d+(\.\d{1,6})?$'
    then
      raise exception using
        errcode = '22023',
        message = 'PRODUCT_IMPORT_UNIT_CONVERSION_REQUIRED';
    end if;
    if raw_equivalence::numeric <= 0 then
      raise exception using
        errcode = '22023',
        message = 'PRODUCT_IMPORT_UNIT_CONVERSION_REQUIRED';
    end if;

    resolved_unit_code := public.normalized_measurement_unit_code(
      alternate.item ->> 'unidad_medida'
    );
    select unit.id
    into resolved_unit_id
    from public.measurement_units unit
    where unit.organization_id = requested_organization_id
      and unit.is_active
      and (
        (resolved_unit_code is not null and unit.code = resolved_unit_code)
        or (
          resolved_unit_code is null
          and lower(unit.name) = lower(pg_catalog.btrim(alternate.item ->> 'unidad_medida'))
        )
      );

    if resolved_unit_id is null then
      raise exception using
        errcode = '22023',
        message = 'PRODUCT_IMPORT_UNIT_INVALID';
    end if;

    insert into public.product_unit_conversions (
      organization_id,
      product_id,
      unit_id,
      conversion_factor,
      barcode,
      sale_price,
      is_active,
      created_by,
      updated_by
    )
    select
      requested_organization_id,
      product.id,
      resolved_unit_id,
      raw_equivalence::numeric,
      nullif(pg_catalog.btrim(alternate.item ->> 'codigo_barras'), ''),
      case
        when coalesce((alternate.item ->> '_c3_update_sale_price')::boolean, false)
        then nullif(alternate.item ->> 'precio_venta', '')::numeric
        else null
      end,
      true,
      actor_id,
      actor_id
    from public.products product
    where product.organization_id = requested_organization_id
      and product.code = upper(pg_catalog.btrim(alternate.item ->> 'codigo_producto'))
    on conflict (organization_id, product_id, unit_id) do update set
      conversion_factor = excluded.conversion_factor,
      barcode = excluded.barcode,
      sale_price = coalesce(excluded.sale_price, product_unit_conversions.sale_price),
      is_active = true,
      updated_by = excluded.updated_by;
  end loop;
end;
$$;

revoke all on function public.persist_product_import_alternate_units(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.persist_product_import_alternate_units(uuid, jsonb) to postgres;

comment on function public.persist_product_import_alternate_units(uuid, jsonb) is
  'Persiste unidades alternativas de importacion; sus precios ya llegan transformados por el resolver C3.';

create or replace function public.import_products(
  requested_organization_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  full_payload_hash text;
  existing_result jsonb;
  resolved jsonb;
  resolved_payload jsonb;
  errors_by_code jsonb;
  warnings jsonb;
  rejected_rows jsonb;
  import_result jsonb;
  reduced_payload jsonb;
  batch_id uuid := gen_random_uuid();
  created_unit_ids uuid[] := '{}'::uuid[];
begin
  if actor_id is null
    or not public.has_organization_permission(
      requested_organization_id,
      'PRODUCTS_MANAGE'
    )
  then
    raise exception using errcode = '42501', message = 'PRODUCT_IMPORT_FORBIDDEN';
  end if;

  perform public.assert_product_import_limits(payload);

  -- P1E-1 validaba este invariante en la ruta completa legacy y exponia
  -- PRODUCT_IMPORT_INVALID_PAYLOAD. Conservarlo aqui evita cambiar el
  -- contrato historico mientras la ruta C3 parcial informa el error estable
  -- por SKU.
  if coalesce(payload -> 'afectacion_tributaria_columna_presente', 'false'::jsonb)
      = 'false'::jsonb
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(payload -> 'precios', '[]'::jsonb)
      ) source(item)
      where nullif(pg_catalog.btrim(source.item ->> 'precio_minimo'), '') is not null
        and nullif(pg_catalog.btrim(source.item ->> 'precio_venta'), '') is not null
        and pg_catalog.btrim(source.item ->> 'precio_minimo') ~ '^(0|[0-9]+)(\.[0-9]{1,2})?$'
        and pg_catalog.btrim(source.item ->> 'precio_venta') ~ '^(0|[0-9]+)(\.[0-9]{1,2})?$'
        and (source.item ->> 'precio_minimo')::numeric
          > (source.item ->> 'precio_venta')::numeric
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'product-import:' || requested_organization_id::text,
      0
    )
  );

  full_payload_hash := encode(
    extensions.digest(payload::text, 'sha256'),
    'hex'
  );

  select batch.result
  into existing_result
  from public.product_import_batches batch
  where batch.organization_id = requested_organization_id
    and batch.payload_hash = full_payload_hash;
  if found then
    return existing_result;
  end if;

  resolved := public.resolve_product_import_tax_payload(
    requested_organization_id,
    payload
  );
  errors_by_code := coalesce(resolved -> 'errores', '{}'::jsonb);
  warnings := coalesce(resolved -> 'advertencias', '[]'::jsonb);

  if exists (select 1 from pg_catalog.jsonb_each(errors_by_code)) then
    select coalesce(
      pg_catalog.jsonb_agg(error_row order by error_row ->> 'codigo', error_row ->> 'fila'),
      '[]'::jsonb
    )
    into rejected_rows
    from pg_catalog.jsonb_each(errors_by_code) grouped
    cross join lateral pg_catalog.jsonb_array_elements(grouped.value) error_row;

    import_result := pg_catalog.jsonb_build_object(
      'estado', 'rechazado',
      'hash', full_payload_hash,
      'id_lote', batch_id,
      'creados', 0,
      'sin_cambios', 0,
      'filas_rechazadas', rejected_rows,
      'advertencias', warnings
    );

    insert into public.product_import_batches (
      id, organization_id, payload_hash, result, created_by
    ) values (
      batch_id, requested_organization_id, full_payload_hash, import_result, actor_id
    );
    insert into public.audit_events (
      organization_id, actor_user_id, action, entity_type, entity_id,
      new_values, metadata
    ) values (
      requested_organization_id, actor_id, 'PRODUCT_IMPORT_REJECTED',
      'product_import', batch_id::text, import_result,
      pg_catalog.jsonb_build_object(
        'source', 'database_function',
        'payload_hash', full_payload_hash,
        'c3_mode', resolved ->> 'modo'
      )
    );
    return import_result;
  end if;

  resolved_payload := pg_catalog.jsonb_set(
    resolved -> 'payload',
    '{_c3_source_payload_hash}',
    pg_catalog.to_jsonb(full_payload_hash),
    true
  );

  with inserted_units as (
    insert into public.measurement_units (organization_id, code, name)
    select distinct
      requested_organization_id,
      'CUSTOM_' || upper(substr(md5(upper(pg_catalog.btrim(source.item ->> 'unidad_medida'))), 1, 12)),
      pg_catalog.btrim(source.item ->> 'unidad_medida')
    from pg_catalog.jsonb_array_elements(resolved_payload -> 'precios') source(item)
    where nullif(pg_catalog.btrim(source.item ->> 'unidad_medida'), '') is not null
      and public.normalized_measurement_unit_code(source.item ->> 'unidad_medida') is null
    on conflict on constraint measurement_units_organization_code_unique do nothing
    returning id
  )
  select coalesce(pg_catalog.array_agg(inserted_units.id), '{}'::uuid[])
  into created_unit_ids
  from inserted_units;

  -- Solo la primera unidad por SKU entra al core historico. Las restantes se
  -- guardan despues mediante el helper lineal de conversiones.
  reduced_payload := pg_catalog.jsonb_set(
    resolved_payload,
    '{precios}',
    coalesce((
      select pg_catalog.jsonb_agg(selected.item order by selected.row_number)
      from (
        select ranked.item, ranked.row_number
        from (
          select source.item,
            coalesce((source.item ->> 'fila')::integer, source.ordinality::integer) as row_number,
            coalesce(
              public.normalized_measurement_unit_code(source.item ->> 'unidad_medida'),
              upper(pg_catalog.btrim(source.item ->> 'unidad_medida'))
            ) as unit_key,
            first_value(coalesce(
              public.normalized_measurement_unit_code(source.item ->> 'unidad_medida'),
              upper(pg_catalog.btrim(source.item ->> 'unidad_medida'))
            )) over (
              partition by upper(pg_catalog.btrim(source.item ->> 'codigo_producto'))
              order by coalesce((source.item ->> 'fila')::integer, source.ordinality::integer),
                source.ordinality
            ) as base_unit_key
          from pg_catalog.jsonb_array_elements(resolved_payload -> 'precios')
            with ordinality source(item, ordinality)
        ) ranked
        where ranked.unit_key is not distinct from ranked.base_unit_key
      ) selected
    ), '[]'::jsonb),
    true
  );

  import_result := public.import_products_single_unit_core(
    requested_organization_id,
    reduced_payload
  );

  if import_result ->> 'estado' = 'completado' then
    perform public.persist_product_import_alternate_units(
      requested_organization_id,
      resolved_payload
    );
  else
    delete from public.measurement_units unit
    where unit.id = any(created_unit_ids)
      and not exists (
        select 1 from public.products product
        where product.organization_id = unit.organization_id
          and product.base_unit_id = unit.id
      )
      and not exists (
        select 1 from public.product_unit_conversions conversion
        where conversion.organization_id = unit.organization_id
          and conversion.unit_id = unit.id
      );
  end if;

  import_result := import_result || pg_catalog.jsonb_build_object(
    'hash', full_payload_hash,
    'advertencias', warnings || coalesce(import_result -> 'advertencias', '[]'::jsonb)
  );
  update public.product_import_batches batch
  set payload_hash = full_payload_hash,
      result = import_result
  where batch.id = (import_result ->> 'id_lote')::uuid
    and batch.organization_id = requested_organization_id;

  return import_result;
end;
$$;

revoke all on function public.import_products(uuid, jsonb) from public, anon;
grant execute on function public.import_products(uuid, jsonb) to authenticated, service_role;

comment on function public.import_products(uuid, jsonb) is
  'Importacion C3 completa: hash del payload crudo y resolucion tributaria centralizada antes del core C2.';

create or replace function public.import_products_partial(
  requested_organization_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_id uuid := (select auth.uid());
  import_mode text;
  partial_payload_hash text;
  cached_result jsonb;
  resolved jsonb;
  resolved_payload jsonb;
  errors_by_code jsonb;
  warnings jsonb;
  resolutions jsonb;
  prices_by_code jsonb := '{}'::jsonb;
  product_item jsonb;
  price_item jsonb;
  sku_prices jsonb;
  sku_payload jsonb;
  sku_result jsonb;
  resolution jsonb;
  existing_product public.products%rowtype;
  resolved_unit_id uuid;
  resolved_unit_code text;
  created_unit_ids uuid[] := '{}'::uuid[];
  rejected_rows jsonb := '[]'::jsonb;
  import_result jsonb;
  failure_message text;
  batch_id uuid := gen_random_uuid();
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  failed_count integer := 0;
  unchanged_count integer := 0;
begin
  import_mode := upper(coalesce(payload ->> 'modo', 'SKIP'));
  if actor_id is null
    or not public.has_organization_permission(
      requested_organization_id,
      'PRODUCTS_MANAGE'
    )
  then
    raise exception using errcode = '42501', message = 'PRODUCT_IMPORT_FORBIDDEN';
  end if;

  if payload is null
    or pg_catalog.jsonb_typeof(payload) <> 'object'
    or pg_catalog.jsonb_typeof(payload -> 'productos') <> 'array'
    or pg_catalog.jsonb_typeof(payload -> 'precios') <> 'array'
    or import_mode not in ('SKIP', 'UPDATE')
  then
    raise exception using errcode = '22023', message = 'PRODUCT_IMPORT_INVALID_PAYLOAD';
  end if;

  perform public.assert_product_import_limits(payload);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'product-import:' || requested_organization_id::text,
      0
    )
  );
  partial_payload_hash := encode(
    extensions.digest(payload::text, 'sha256'),
    'hex'
  );

  select batch.result
  into cached_result
  from public.product_import_batches batch
  where batch.organization_id = requested_organization_id
    and batch.payload_hash = partial_payload_hash;
  if found then
    return cached_result;
  end if;

  resolved := public.resolve_product_import_tax_payload(
    requested_organization_id,
    payload
  );
  errors_by_code := coalesce(resolved -> 'errores', '{}'::jsonb);
  warnings := coalesce(resolved -> 'advertencias', '[]'::jsonb);
  resolutions := coalesce(resolved -> 'resoluciones', '{}'::jsonb);
  resolved_payload := pg_catalog.jsonb_set(
    resolved -> 'payload',
    '{_c3_source_payload_hash}',
    pg_catalog.to_jsonb(partial_payload_hash),
    true
  );

  select coalesce(
    pg_catalog.jsonb_object_agg(grouped.product_code, grouped.items),
    '{}'::jsonb
  )
  into prices_by_code
  from (
    select
      upper(pg_catalog.btrim(source.item ->> 'codigo_producto')) as product_code,
      pg_catalog.jsonb_agg(
        source.item
        order by coalesce((source.item ->> 'fila')::integer, source.ordinality::integer),
          source.ordinality
      ) as items
    from pg_catalog.jsonb_array_elements(resolved_payload -> 'precios')
      with ordinality source(item, ordinality)
    where nullif(upper(pg_catalog.btrim(source.item ->> 'codigo_producto')), '') is not null
    group by upper(pg_catalog.btrim(source.item ->> 'codigo_producto'))
  ) grouped;

  with inserted_units as (
    insert into public.measurement_units (organization_id, code, name)
    select distinct
      requested_organization_id,
      'CUSTOM_' || upper(substr(md5(upper(pg_catalog.btrim(source.item ->> 'unidad_medida'))), 1, 12)),
      pg_catalog.btrim(source.item ->> 'unidad_medida')
    from pg_catalog.jsonb_array_elements(resolved_payload -> 'precios') source(item)
    where nullif(pg_catalog.btrim(source.item ->> 'unidad_medida'), '') is not null
      and public.normalized_measurement_unit_code(source.item ->> 'unidad_medida') is null
    on conflict on constraint measurement_units_organization_code_unique do nothing
    returning id
  )
  select coalesce(pg_catalog.array_agg(inserted_units.id), '{}'::uuid[])
  into created_unit_ids
  from inserted_units;

  -- Se procesa en el mismo orden, con un mapa de precios ya construido (O(P + Q)).
  for product_item in
    select source.item
    from pg_catalog.jsonb_array_elements(resolved_payload -> 'productos') source(item)
    order by upper(pg_catalog.btrim(source.item ->> 'codigo'))
  loop
    begin
      if errors_by_code ? upper(pg_catalog.btrim(product_item ->> 'codigo')) then
        failed_count := failed_count + 1;
        rejected_rows := rejected_rows || coalesce(
          errors_by_code -> upper(pg_catalog.btrim(product_item ->> 'codigo')),
          '[]'::jsonb
        );
        continue;
      end if;

      select product.*
      into existing_product
      from public.products product
      where product.organization_id = requested_organization_id
        and product.code = upper(pg_catalog.btrim(product_item ->> 'codigo'));

      if found and import_mode = 'SKIP' then
        skipped_count := skipped_count + 1;
        continue;
      end if;

      sku_prices := coalesce(
        prices_by_code -> upper(pg_catalog.btrim(product_item ->> 'codigo')),
        '[]'::jsonb
      );
      price_item := sku_prices -> 0;
      resolution := resolutions -> upper(pg_catalog.btrim(product_item ->> 'codigo'));

      if existing_product.id is not null then
        resolved_unit_id := existing_product.base_unit_id;
        if price_item is not null
          and nullif(pg_catalog.btrim(price_item ->> 'unidad_medida'), '') is not null
        then
          resolved_unit_code := public.normalized_measurement_unit_code(
            price_item ->> 'unidad_medida'
          );
          select unit.id
          into resolved_unit_id
          from public.measurement_units unit
          where unit.organization_id = requested_organization_id
            and unit.is_active
            and (
              (resolved_unit_code is not null and unit.code = resolved_unit_code)
              or (
                resolved_unit_code is null
                and lower(unit.name) = lower(pg_catalog.btrim(price_item ->> 'unidad_medida'))
              )
            );
          if resolved_unit_id is null then
            raise exception using errcode = '22023', message = 'PRODUCT_IMPORT_UNIT_INVALID';
          end if;
        end if;

        update public.products product set
          description = coalesce(nullif(pg_catalog.btrim(product_item ->> 'descripcion'), ''), product.description),
          category = coalesce(nullif(pg_catalog.btrim(product_item ->> 'categoria'), ''), product.category),
          subline = coalesce(nullif(pg_catalog.btrim(product_item ->> 'sublinea'), ''), product.subline),
          laboratory = coalesce(nullif(pg_catalog.btrim(product_item ->> 'laboratorio'), ''), product.laboratory),
          extended_description = coalesce(nullif(pg_catalog.btrim(product_item ->> 'descripcion_ampliada'), ''), product.extended_description),
          barcode = coalesce(nullif(pg_catalog.btrim(product_item ->> 'codigo_barras'), ''), product.barcode),
          presentation = coalesce(nullif(pg_catalog.btrim(product_item ->> 'presentacion'), ''), product.presentation),
          health_registry = coalesce(nullif(pg_catalog.btrim(product_item ->> 'registro_sanitario'), ''), product.health_registry),
          maximum_stock = coalesce(nullif(product_item ->> 'stock_maximo', '')::numeric, product.maximum_stock),
          width_cm = coalesce(nullif(product_item ->> 'ancho_cm', '')::numeric, product.width_cm),
          height_cm = coalesce(nullif(product_item ->> 'alto_cm', '')::numeric, product.height_cm),
          length_cm = coalesce(nullif(product_item ->> 'largo_cm', '')::numeric, product.length_cm),
          weight_kg = coalesce(nullif(product_item ->> 'peso_kg', '')::numeric, product.weight_kg),
          batch_control = coalesce((product_item ->> 'control_lote')::boolean, product.batch_control),
          expiration_control = coalesce((product_item ->> 'control_vencimiento')::boolean, product.expiration_control),
          prescription_sale = coalesce((product_item ->> 'venta_receta')::boolean, product.prescription_sale),
          base_unit_id = resolved_unit_id,
          sale_price = case
            when price_item is not null
              and coalesce((price_item ->> '_c3_update_sale_price')::boolean, false)
              and price_item ? 'precio_venta'
            then (price_item ->> 'precio_venta')::numeric
            else product.sale_price
          end,
          cost = coalesce(nullif(price_item ->> 'costo_base', '')::numeric, product.cost),
          minimum_sale_price = case
            when price_item is not null
              and coalesce((price_item ->> '_c3_update_minimum_sale_price')::boolean, false)
              and price_item ? 'precio_minimo'
            then (price_item ->> 'precio_minimo')::numeric
            else product.minimum_sale_price
          end,
          tax_affectation = case
            when coalesce((resolution ->> 'actualiza_tax_affectation')::boolean, false)
            then resolution ->> 'afectacion_efectiva'
            else product.tax_affectation
          end,
          updated_by = actor_id
        where product.id = existing_product.id;
      end if;

      sku_payload := pg_catalog.jsonb_build_object(
        'modo', import_mode,
        'afectacion_tributaria_columna_presente',
          coalesce((resolved_payload ->> 'afectacion_tributaria_columna_presente')::boolean, false),
        'productos', pg_catalog.jsonb_build_array(product_item),
        'precios', sku_prices,
        'partial_run_id', batch_id,
        '_c3_source_payload_hash', partial_payload_hash
      );
      sku_result := public.import_products_single_unit_core(
        requested_organization_id,
        sku_payload
      );
      if sku_result ->> 'estado' <> 'completado' then
        raise exception using errcode = '22023', message = 'PRODUCT_SKU_REJECTED';
      end if;

      perform public.persist_product_import_alternate_units(
        requested_organization_id,
        sku_payload
      );

      if existing_product.id is null then
        created_count := created_count + 1;
      else
        updated_count := updated_count + 1;
      end if;
      unchanged_count := unchanged_count + coalesce((sku_result ->> 'sin_cambios')::integer, 0);
    exception when others then
      get stacked diagnostics failure_message = message_text;
      failed_count := failed_count + 1;
      rejected_rows := rejected_rows || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'tipo', 'producto',
          'fila', product_item -> 'fila',
          'codigo', product_item -> 'codigo',
          'motivo', failure_message
        )
      );
    end;
  end loop;

  delete from public.measurement_units unit
  where unit.id = any(created_unit_ids)
    and not exists (
      select 1 from public.products product
      where product.organization_id = unit.organization_id
        and product.base_unit_id = unit.id
    )
    and not exists (
      select 1 from public.product_unit_conversions conversion
      where conversion.organization_id = unit.organization_id
        and conversion.unit_id = unit.id
    );

  import_result := pg_catalog.jsonb_build_object(
    'estado', case
      when failed_count = 0 then 'completado'
      when created_count + updated_count + skipped_count > 0 then 'parcial'
      else 'rechazado'
    end,
    'hash', partial_payload_hash,
    'id_lote', batch_id,
    'creados', created_count,
    'actualizados', updated_count,
    'omitidos', skipped_count,
    'fallidos', failed_count,
    'sin_cambios', unchanged_count,
    'filas_rechazadas', rejected_rows,
    'advertencias', warnings
  );

  insert into public.product_import_batches (
    id, organization_id, payload_hash, result, created_by
  ) values (
    batch_id, requested_organization_id, partial_payload_hash, import_result, actor_id
  );
  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    new_values, metadata
  ) values (
    requested_organization_id, actor_id, 'PRODUCT_IMPORT_COMPLETED',
    'product_import', batch_id::text, import_result,
    pg_catalog.jsonb_build_object(
      'source', 'partial_import',
      'mode', import_mode,
      'payload_hash', partial_payload_hash,
      'c3_mode', resolved ->> 'modo'
    )
  );
  return import_result;
end;
$$;

revoke all on function public.import_products_partial(uuid, jsonb) from public, anon;
grant execute on function public.import_products_partial(uuid, jsonb) to authenticated, service_role;

comment on function public.import_products_partial(uuid, jsonb) is
  'Importacion C3 por SKU: errores tributarios aislados, transformacion canonica y semantica P1E-1 preservada.';

commit;
