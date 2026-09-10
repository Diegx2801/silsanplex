begin;

select no_plan();

select has_function(
  'public',
  'product_import_inc_igv_kind',
  array['text'],
  'existe el normalizador de IncIGV C3'
);
select has_function(
  'public',
  'product_import_tax_affectation_kind',
  array['text'],
  'existe el normalizador de AfectacionTributaria C3'
);
select has_function(
  'public',
  'resolve_product_import_tax_payload',
  array['uuid', 'jsonb'],
  'existe el resolver tributario unico C3'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.resolve_product_import_tax_payload(uuid,jsonb)',
    'EXECUTE'
  ),
  'el resolver interno no se expone al cliente'
);
select is(
  public.product_import_inc_igv_kind('  si  '),
  'Sí',
  'IncIGV acepta trim y Si sin tilde'
);
select is(
  public.product_import_inc_igv_kind('  Sí  '),
  'Sí',
  'IncIGV conserva la forma canonica Sí'
);
select is(
  public.product_import_inc_igv_kind(''),
  '',
  'IncIGV vacio conserva el estado vacio'
);
select is(
  public.product_import_inc_igv_kind('desconocido'),
  'Inválido',
  'IncIGV desconocido no se convierte silenciosamente'
);
select is(
  public.product_import_tax_affectation_kind(' Por Definir '),
  'por-definir'::text,
  'AfectacionTributaria acepta la variante lexical documentada'
);
select is(
  public.product_import_tax_affectation_kind('desconocida'),
  'Inválido',
  'AfectacionTributaria desconocida no se convierte a por-definir'
);

insert into public.organizations (id, name, slug)
values
  ('c3c30000-0000-4000-8000-000000000001', 'Importacion C3', 'importacion-c3'),
  ('c3c30000-0000-4000-8000-000000000002', 'Importacion C3 ajena', 'importacion-c3-ajena');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, sale_price, minimum_sale_price, is_active,
  batch_control, expiration_control
)
values
  (
    'c3c40000-0000-4000-8000-000000000001',
    'c3c30000-0000-4000-8000-000000000001',
    'C3-LEG-EXO', 'Legacy exonerado', 'UND', 'good',
    'exonerado', 200, 100, true, false, false
  ),
  (
    'c3c40000-0000-4000-8000-000000000002',
    'c3c30000-0000-4000-8000-000000000001',
    'C3-LEG-INAF', 'Legacy inafecto', 'UND', 'good',
    'inafecto', 300, 150, true, false, false
  ),
  (
    'c3c40000-0000-4000-8000-000000000003',
    'c3c30000-0000-4000-8000-000000000001',
    'C3-LEG-PDEF', 'Legacy por definir', 'UND', 'good',
    'por-definir', 400, 200, true, false, false
  ),
  (
    'c3c40000-0000-4000-8000-000000000004',
    'c3c30000-0000-4000-8000-000000000001',
    'C3-EXP-GRAV', 'Explicito gravado', 'UND', 'good',
    'gravado', 100, 50, true, false, false
  ),
  (
    'c3c40000-0000-4000-8000-000000000005',
    'c3c30000-0000-4000-8000-000000000001',
    'C3-EXP-EXO', 'Explicito exonerado', 'UND', 'good',
    'exonerado', 200, 100, true, false, false
  ),
  (
    'c3c40000-0000-4000-8000-000000000006',
    'c3c30000-0000-4000-8000-000000000001',
    'C3-EXP-INAF', 'Explicito inafecto', 'UND', 'good',
    'inafecto', 300, 150, true, false, false
  ),
  (
    'c3c40000-0000-4000-8000-000000000007',
    'c3c30000-0000-4000-8000-000000000001',
    'C3-EXP-PDEF', 'Explicito por definir', 'UND', 'good',
    'por-definir', 400, 200, true, false, false
  );

create function pg_temp.resolve_case(
  requested_code text,
  requested_column_present boolean,
  requested_affectation text default null,
  requested_sale text default null,
  requested_minimum text default null,
  requested_inc text default '',
  include_price boolean default true
)
returns jsonb
language sql
as $$
  select public.resolve_product_import_tax_payload(
    'c3c30000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'afectacion_tributaria_columna_presente', requested_column_present,
      'productos', jsonb_build_array(
        jsonb_build_object(
          'fila', 2,
          'codigo', requested_code,
          'descripcion', 'Producto C3'
        ) || case
          when requested_column_present
          then jsonb_build_object(
            'afectacion_tributaria', coalesce(requested_affectation, '')
          )
          else '{}'::jsonb
        end
      ),
      'precios', case
        when include_price then jsonb_build_array(
          jsonb_build_object(
            'fila', 2,
            'codigo_producto', requested_code,
            'producto', 'Producto C3',
            'unidad_medida', 'Unidad',
            'precio_venta', requested_sale,
            'precio_minimo', requested_minimum,
            'inc_igv', requested_inc
          )
        )
        else '[]'::jsonb
      end
    )
  );
$$;

-- Modo A: columna ausente / legacy P1E-1.
select is(
  pg_temp.resolve_case('C3-LEG-NEW-SI', false, null, '10', '8', 'Sí') ->> 'modo',
  'legacy',
  'legacy se determina sin el indicador de columna'
);
select is(
  pg_temp.resolve_case('C3-LEG-NEW-SI', false, null, '10', '8', 'Sí')
    -> 'payload' -> 'productos' -> 0 ->> 'tax_affectation',
  'gravado',
  'legacy nuevo con Sí queda gravado'
);
select is(
  (pg_temp.resolve_case('C3-LEG-NEW-SI', false, null, '10', '8', 'Sí')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  10::numeric,
  'legacy nuevo con Sí conserva precio fuente final'
);
select is(
  pg_temp.resolve_case('C3-LEG-EXO', false, null, '10', '8', 'Sí')
    -> 'payload' -> 'productos' -> 0 ->> 'tax_affectation',
  'gravado',
  'legacy existente con Sí conserva la semantica P1E-1 de gravado'
);
select is(
  (pg_temp.resolve_case('C3-LEG-EXO', false, null, '10', '8', 'Sí')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  10::numeric,
  'legacy existente con Sí trata el precio fuente como final'
);
select is(
  pg_temp.resolve_case('C3-LEG-NEW-NO', false, null, '10', '8', 'No')
    -> 'payload' -> 'productos' -> 0 ->> 'tax_affectation',
  'por-definir',
  'legacy nuevo con No queda por-definir'
);
select is(
  pg_temp.resolve_case('C3-LEG-NEW-NO', false, null, '10', '8', 'No')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta',
  null::text,
  'legacy nuevo con No no persiste precio ambiguo'
);
select is(
  pg_temp.resolve_case('C3-LEG-NEW-PEND', false, null, '10', null, 'Pendiente')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta',
  null::text,
  'legacy nuevo con Pendiente no persiste precio ambiguo'
);
select is(
  pg_temp.resolve_case('C3-LEG-NEW-EMPTY', false, null, '10', null, '')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta',
  null::text,
  'legacy nuevo con IncIGV vacio no persiste precio ambiguo'
);
select is(
  pg_temp.resolve_case('C3-LEG-EXO', false, null, '10', '8', 'No')
    -> 'payload' -> 'productos' -> 0 ->> 'tax_affectation',
  'exonerado',
  'legacy existente con No preserva afectacion existente'
);
select is(
  (pg_temp.resolve_case('C3-LEG-EXO', false, null, '10', '8', 'No')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  200::numeric,
  'legacy existente con No preserva precio existente y no lo reinterpreta'
);
select is(
  (pg_temp.resolve_case('C3-LEG-INAF', false, null, '10', null, 'Pendiente')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  300::numeric,
  'legacy existente con Pendiente preserva precio existente'
);
select is(
  (pg_temp.resolve_case('C3-LEG-PDEF', false, null, '10', null, '')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  400::numeric,
  'legacy existente con vacio preserva precio existente'
);
select ok(
  pg_temp.resolve_case('C3-LEG-EXO', false, null, '10', null, 'No')
    -> 'advertencias' @> '[{"motivo":"PRODUCT_IMPORT_AMBIGUOUS_INC_IGV"}]'::jsonb,
  'legacy existente ambiguo emite warning estable'
);

-- Modo B: columna presente y celda vacia.
select is(
  pg_temp.resolve_case('C3-EXPLICIT-BLANK-NEW', true, '', '10', '8', 'Sí')
    ->> 'modo',
  'explicit_blank',
  'columna presente con celda vacia no es legacy'
);
select is(
  pg_temp.resolve_case('C3-EXPLICIT-BLANK-NEW', true, '', '10', '8', 'Sí')
    -> 'payload' -> 'productos' -> 0 ->> 'tax_affectation',
  'por-definir',
  'celda vacia en nuevo producto queda por-definir'
);
select is(
  (pg_temp.resolve_case('C3-EXPLICIT-BLANK-NEW', true, '', '10', '8', 'Sí')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  10::numeric,
  'por-definir con Sí conserva precio final'
);
select ok(
  pg_temp.resolve_case('C3-EXPLICIT-BLANK-NEW', true, '', '10', '8', 'Sí')
    -> 'advertencias' @> '[{"motivo":"PRODUCT_IMPORT_TAX_AFFECTATION_PENDING"}]'::jsonb,
  'por-definir con Sí advierte clasificacion pendiente'
);
select is(
  pg_temp.resolve_case('C3-EXPLICIT-BLANK-NEW', true, '', '10', null, 'No')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta',
  null::text,
  'por-definir con No sigue indeterminado'
);
select is(
  (pg_temp.resolve_case('C3-EXP-GRAV', true, '', '10', '8', 'Sí')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  10::numeric,
  'celda vacia preserva gravado y Sí no transforma'
);
select is(
  (pg_temp.resolve_case('C3-EXP-GRAV', true, '', '10', '8', 'No')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  11.8::numeric,
  'celda vacia usa gravado existente y aplica una vez 1.18'
);
select is(
  (pg_temp.resolve_case('C3-EXP-GRAV', true, '', '10', '8', 'Pendiente')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  100::numeric,
  'celda vacia gravado con Pendiente preserva precio existente'
);
select is(
  pg_temp.resolve_case('C3-EXP-GRAV', true, '', '10', '8', 'Pendiente')
    -> 'resoluciones' -> 'C3-EXP-GRAV' ->> 'actualiza_tax_affectation',
  'false',
  'celda vacia no sobrescribe tax_affectation'
);
select is(
  (pg_temp.resolve_case('C3-EXP-EXO', true, '', '10', '8', 'No')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  10::numeric,
  'celda vacia exonerado no agrega IGV'
);
select is(
  (pg_temp.resolve_case('C3-EXP-INAF', true, '', '10', '8', 'Pendiente')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  10::numeric,
  'celda vacia inafecto no agrega IGV'
);
select is(
  (pg_temp.resolve_case('C3-EXP-PDEF', true, '', '10', null, 'No')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  400::numeric,
  'celda vacia por-definir con No preserva precio existente'
);
select ok(
  pg_temp.resolve_case('C3-EXP-PDEF', true, '', '10', null, 'No')
    -> 'advertencias' @> '[{"motivo":"PRODUCT_IMPORT_AMBIGUOUS_INC_IGV"}]'::jsonb,
  'celda vacia por-definir con No emite warning ambiguo'
);

-- Modo C: valor explicito con autoridad fiscal.
select is(
  pg_temp.resolve_case('C3-EXPLICIT-GRAV-SI', true, 'gravado', '10', '8', 'Sí')
    -> 'payload' -> 'productos' -> 0 ->> 'tax_affectation',
  'gravado',
  'valor explicito gravado es autoridad'
);
select is(
  (pg_temp.resolve_case('C3-EXPLICIT-GRAV-NO', true, 'gravado', '10', '8', 'No')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  11.8::numeric,
  'valor explicito gravado con No aplica 1.18'
);
select is(
  (pg_temp.resolve_case('C3-EXPLICIT-EXO', true, 'exonerado', '10', '8', 'No')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  10::numeric,
  'valor explicito exonerado no agrega IGV'
);
select is(
  (pg_temp.resolve_case('C3-EXPLICIT-INAF', true, 'inafecto', '10', '8', 'Sí')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  10::numeric,
  'valor explicito inafecto no agrega IGV'
);
select is(
  pg_temp.resolve_case('C3-EXPLICIT-PDEF-SI', true, 'por-definir', '10', '8', 'Sí')
    -> 'payload' -> 'productos' -> 0 ->> 'tax_affectation',
  'por-definir'::text,
  'valor explicito por-definir no se convierte a gravado'
);
select is(
  (pg_temp.resolve_case('C3-EXPLICIT-PDEF-SI', true, 'por-definir', '10', '8', 'Sí')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  10::numeric,
  'por-definir con Sí permite precio final'
);
select is(
  pg_temp.resolve_case('C3-EXPLICIT-PDEF-NO', true, 'por-definir', '10', null, 'No')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta',
  null::text,
  'por-definir con No no inventa transformacion'
);
select is(
  pg_temp.resolve_case('C3-EXP-GRAV', true, 'exonerado', '10', null, 'Sí')
    -> 'resoluciones' -> 'C3-EXP-GRAV' ->> 'afectacion_efectiva',
  'exonerado',
  'UPDATE explicito puede cambiar la afectacion'
);
select is(
  pg_temp.resolve_case('C3-EXP-GRAV', true, 'exonerado', '10', null, 'Sí')
    -> 'resoluciones' -> 'C3-EXP-GRAV' ->> 'actualiza_tax_affectation',
  'true',
  'UPDATE explicito marca actualizacion fiscal'
);

-- Minimos, redondeo y overflow.
select is(
  (pg_temp.resolve_case('C3-EXPLICIT-MIN', true, 'gravado', '10', '9', 'No')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta')::numeric,
  11.8::numeric,
  'precio gravado No queda redondeado a dos decimales'
);
select is(
  (pg_temp.resolve_case('C3-EXPLICIT-MIN', true, 'gravado', '10', '9', 'No')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_minimo')::numeric,
  10.62::numeric,
  'minimo usa la misma base y transformacion tributaria'
);
select is(
  (pg_temp.resolve_case('C3-EXP-GRAV', true, '', null, '10', 'No')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_minimo')::numeric,
  11.8::numeric,
  'solo minimo usa sale_price existente como referencia determinista'
);
select is(
  pg_temp.resolve_case('C3-EXPLICIT-PDEF-SI', true, 'por-definir', '10', '10', 'Sí')
    -> 'errores',
  '{}'::jsonb,
  'por-definir con Sí permite minimo final valido'
);
select is(
  (pg_temp.resolve_case('C3-EXPLICIT-ZERO', true, 'gravado', '0', '0', 'Sí')
    -> 'payload' -> 'precios' -> 0 ->> 'precio_venta'
  )::numeric,
  0::numeric,
  'precio cero sigue siendo un precio final valido'
);
select ok(
  pg_temp.resolve_case(
    'C3-EXP-OVER-SALE', true, 'gravado', '999999999999.99', null, 'No'
  ) -> 'errores' -> 'C3-EXP-OVER-SALE' -> 0 ->> 'motivo'
    = 'PRODUCT_IMPORT_PRICE_OVERFLOW',
  'overflow sale_price se valida despues de transformar'
);
select ok(
  pg_temp.resolve_case(
    'C3-EXP-OVER-MIN', true, 'gravado', '10', '999999999999.99', 'No'
  ) -> 'errores' -> 'C3-EXP-OVER-MIN' -> 0 ->> 'motivo'
    = 'PRODUCT_IMPORT_PRICE_OVERFLOW',
  'overflow minimum_sale_price se valida despues de transformar'
);
select ok(
  pg_temp.resolve_case(
    'C3-EXP-MIN-GREATER', true, 'gravado', '10', '11', 'Sí'
  ) -> 'errores' -> 'C3-EXP-MIN-GREATER' -> 0 ->> 'motivo'
    = 'PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID',
  'minimum_sale_price mayor que sale_price final produce error estable'
);
select ok(
  pg_temp.resolve_case(
    'C3-EXP-MIN-NO-REFERENCE', true, 'gravado', null, '2', 'Sí'
  ) -> 'errores' -> 'C3-EXP-MIN-NO-REFERENCE' -> 0 ->> 'motivo'
    = 'PRODUCT_IMPORT_MINIMUM_SALE_PRICE_INVALID',
  'minimo nuevo sin precio de referencia produce error estable'
);
select is(
  pg_temp.resolve_case('C3-EXPLICIT-NO-PRICE', true, '', null, null, '', false)
    -> 'errores',
  '{}'::jsonb,
  'producto nuevo sin precio mantiene P1D'
);

select ok(
  pg_temp.resolve_case(
    'C3-INVALID-AFF', true, 'no-aplica', '10', null, 'Sí'
  ) -> 'errores' -> 'C3-INVALID-AFF' -> 0 ->> 'motivo'
    = 'PRODUCT_IMPORT_TAX_AFFECTATION_INVALID',
  'afectacion invalida produce error de fila estable'
);
select ok(
  pg_temp.resolve_case(
    'C3-INVALID-INC', true, 'gravado', '10', null, 'incluido'
  ) -> 'errores' -> 'C3-INVALID-INC' -> 0 ->> 'motivo'
    = 'PRODUCT_IMPORT_INC_IGV_INVALID',
  'IncIGV invalido produce error de fila estable'
);

-- La unidad minima de escritura sigue siendo el SKU en la RPC parcial.
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'c3c50000-0000-4000-8000-000000000001',
  'importacion.c3@test.local',
  '{}',
  now(),
  now()
);
insert into public.organization_memberships (organization_id, user_id)
values (
  'c3c30000-0000-4000-8000-000000000001',
  'c3c50000-0000-4000-8000-000000000001'
);
insert into public.user_roles (organization_id, user_id, role_code)
values (
  'c3c30000-0000-4000-8000-000000000001',
  'c3c50000-0000-4000-8000-000000000001',
  'LOGISTICA'
);

create function pg_temp.explicit_update_payload()
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'modo', 'UPDATE',
    'afectacion_tributaria_columna_presente', true,
    'productos', jsonb_build_array(
      jsonb_build_object(
        'fila', 2, 'codigo', 'C3-EXP-GRAV',
        'descripcion', 'Explicito gravado',
        'afectacion_tributaria', 'exonerado'
      )
    ),
    'precios', jsonb_build_array(
      jsonb_build_object(
        'fila', 2, 'codigo_producto', 'C3-EXP-GRAV',
        'producto', 'Explicito gravado', 'unidad_medida', 'Unidad',
        'precio_venta', '10.00', 'precio_minimo', '5.00', 'inc_igv', 'S' || chr(237)
      )
    )
  );
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'c3c50000-0000-4000-8000-000000000001',
  true
);

select is(
  (public.import_products_partial(
    'c3c30000-0000-4000-8000-000000000001',
    pg_temp.explicit_update_payload()
  ) ->> 'estado'),
  'completado',
  'UPDATE explicito completa el SKU con cambio de afectacion'
);
reset role;
select results_eq(
  $$select tax_affectation, sale_price, minimum_sale_price
    from public.products
    where organization_id = 'c3c30000-0000-4000-8000-000000000001'
      and code = 'C3-EXP-GRAV'$$,
  $$values ('exonerado'::text, 10::numeric, 5::numeric)$$,
  'UPDATE explicito persiste afectacion y precios finales'
);

create function pg_temp.atomic_payload()
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'modo', 'UPDATE',
    'afectacion_tributaria_columna_presente', true,
    'productos', jsonb_build_array(
      jsonb_build_object(
        'fila', 2, 'codigo', 'C3-ATOMIC-OK', 'descripcion', 'Producto valido',
        'afectacion_tributaria', 'gravado'
      ),
      jsonb_build_object(
        'fila', 3, 'codigo', 'C3-ATOMIC-BAD', 'descripcion', 'Producto invalido',
        'afectacion_tributaria', 'no-aplica'
      )
    ),
    'precios', jsonb_build_array(
      jsonb_build_object(
        'fila', 2, 'codigo_producto', 'C3-ATOMIC-OK',
        'producto', 'Producto valido', 'unidad_medida', 'Unidad',
        'precio_venta', '10.00', 'precio_minimo', '8.00', 'inc_igv', 'Sí'
      ),
      jsonb_build_object(
        'fila', 3, 'codigo_producto', 'C3-ATOMIC-BAD',
        'producto', 'Producto invalido', 'unidad_medida', 'Unidad',
        'precio_venta', '10.00', 'precio_minimo', '8.00', 'inc_igv', 'Sí'
      )
    )
  );
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'c3c50000-0000-4000-8000-000000000001',
  true
);

select is(
  (public.import_products_partial(
    'c3c30000-0000-4000-8000-000000000001',
    pg_temp.atomic_payload()
  ) ->> 'estado'),
  'parcial',
  'partial permite continuar con SKU valido y fiscalmente invalido'
);
reset role;
select is(
  (public.import_products_partial(
    'c3c30000-0000-4000-8000-000000000001',
    pg_temp.atomic_payload()
  ) ->> 'id_lote'),
  (
    select result ->> 'id_lote'
    from public.product_import_batches
    where organization_id = 'c3c30000-0000-4000-8000-000000000001'
      and payload_hash = encode(
        extensions.digest(pg_temp.atomic_payload()::text, 'sha256'),
        'hex'
      )
    limit 1
  ),
  'retry del mismo payload devuelve el lote cacheado por hash'
);
select results_eq(
  $$select tax_affectation, sale_price, minimum_sale_price
    from public.products
    where organization_id = 'c3c30000-0000-4000-8000-000000000001'
      and code = 'C3-ATOMIC-OK'$$,
  $$values ('gravado'::text, 10::numeric, 8::numeric)$$,
  'SKU valido se escribe con precio canonico'
);
select is(
  (
    select count(*) from public.products
    where organization_id = 'c3c30000-0000-4000-8000-000000000001'
      and code = 'C3-ATOMIC-BAD'
  ),
  0::bigint,
  'SKU fiscalmente invalido no deja escritura parcial'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'c3c50000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$select public.import_products_partial(
    'c3c30000-0000-4000-8000-000000000002',
    '{"modo":"UPDATE","productos":[],"precios":[]}'::jsonb
  )$$,
  '42501',
  'PRODUCT_IMPORT_FORBIDDEN',
  'se mantiene aislamiento multi-organizacion'
);

reset role;

-- Invariantes estructurales C1/C2 y hash sin cambiar de politica.
select ok(
  position(
    'perform public.assert_product_import_limits(payload);'
    in pg_get_functiondef('public.import_products_partial(uuid,jsonb)'::regprocedure)
  ) > 0,
  'partial conserva el helper de limites C2'
);
select ok(
  position(
    'pg_catalog.pg_advisory_xact_lock'
    in pg_get_functiondef('public.import_products_partial(uuid,jsonb)'::regprocedure)
  ) > 0,
  'partial conserva advisory lock por organizacion'
);
select ok(
  position(
    'extensions.digest(payload::text'
    in pg_get_functiondef('public.import_products_partial(uuid,jsonb)'::regprocedure)
  ) > 0,
  'partial conserva hash sobre payload crudo'
);
select ok(
  position(
    'afectacion_tributaria_columna_presente'
    in pg_get_functiondef('public.import_products_partial(uuid,jsonb)'::regprocedure)
  ) > 0,
  'el indicador de columna viaja en el payload de la cadena activa'
);
select ok(
  position(
    'prices_by_code'
    in pg_get_functiondef('public.import_products_partial(uuid,jsonb)'::regprocedure)
  ) > 0,
  'partial conserva el mapa O(P + Q) de C2'
);
select ok(
  position(
    'import_products_single_unit_core'
    in pg_get_functiondef('public.import_products_partial(uuid,jsonb)'::regprocedure)
  ) > 0,
  'partial conserva la cadena C1 de control de serie'
);
select ok(
  position(
    'persist_product_import_alternate_units'
    in pg_get_functiondef('public.import_products_partial(uuid,jsonb)'::regprocedure)
  ) > 0,
  'partial conserva la persistencia de unidades y conversiones'
);
select ok(
  position(
    'product_import_tax_affectation_kind'
    in pg_get_functiondef('public.resolve_product_import_tax_payload(uuid,jsonb)'::regprocedure)
  ) > 0,
  'el resolver centraliza la normalizacion fiscal'
);

select * from finish();
rollback;
