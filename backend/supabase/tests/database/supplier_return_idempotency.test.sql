begin;

select no_plan();
create extension if not exists dblink with schema extensions;

select has_column(
  'public', 'supplier_returns', 'operation_key',
  'supplier_returns conserva la clave idempotente'
);
select has_column(
  'public', 'supplier_returns', 'operation_payload_hash',
  'supplier_returns conserva el hash del payload funcional'
);
select ok(
  (select count(*) = 1
   from pg_catalog.pg_indexes
   where schemaname = 'public'
     and indexname = 'supplier_returns_organization_operation_unique'),
  'la clave idempotente es unica por organizacion'
);
select ok(
  position('pg_advisory_xact_lock' in lower(
    pg_get_functiondef('public.register_supplier_return(jsonb)'::regprocedure)
  )) > 0,
  'register_supplier_return serializa el scope de la operation_key'
);
select ok(
  position('operation_payload_hash' in lower(
    pg_get_functiondef('public.register_supplier_return(jsonb)'::regprocedure)
  )) > 0,
  'register_supplier_return persiste y compara el hash funcional'
);
select is(
  has_function_privilege('anon', 'public.register_supplier_return(jsonb)', 'EXECUTE'),
  false,
  'anon no puede registrar devoluciones idempotentes'
);

insert into public.organizations (id, name, slug)
values
  ('e4c30000-0000-4000-8000-000000000001', 'Idempotencia devoluciones', 'e4c3-returns'),
  ('e4c30000-0000-4000-8000-000000000002', 'Idempotencia otra organizacion', 'e4c3-returns-other');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('e4c40000-0000-4000-8000-000000000001', 'e4c3.owner@test.local', '{"full_name":"E4C3 Owner"}', now(), now()),
  ('e4c40000-0000-4000-8000-000000000002', 'e4c3.other@test.local', '{"full_name":"E4C3 Other"}', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('e4c30000-0000-4000-8000-000000000001', 'e4c40000-0000-4000-8000-000000000001'),
  ('e4c30000-0000-4000-8000-000000000002', 'e4c40000-0000-4000-8000-000000000002');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('e4c30000-0000-4000-8000-000000000001', 'e4c40000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('e4c30000-0000-4000-8000-000000000001', 'e4c40000-0000-4000-8000-000000000001', 'ALMACEN'),
  ('e4c30000-0000-4000-8000-000000000002', 'e4c40000-0000-4000-8000-000000000002', 'COMPRAS'),
  ('e4c30000-0000-4000-8000-000000000002', 'e4c40000-0000-4000-8000-000000000002', 'ALMACEN');

insert into public.suppliers (id, organization_id, document_type, document_number, business_name)
values
  ('e4c50000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000001', 'ruc', '20999999992', 'Proveedor E4C3 A'),
  ('e4c50000-0000-4000-8000-000000000002', 'e4c30000-0000-4000-8000-000000000002', 'ruc', '20999999993', 'Proveedor E4C3 B');

insert into public.warehouses (id, organization_id, code, name)
values
  ('e4c60000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000001', 'E4C3-A', 'Almacen E4C3 A'),
  ('e4c60000-0000-4000-8000-000000000002', 'e4c30000-0000-4000-8000-000000000002', 'E4C3-B', 'Almacen E4C3 B');

insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name)
values
  ('e4c70000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000001', 'e4c60000-0000-4000-8000-000000000001', 'GENERAL', 'General E4C3 A'),
  ('e4c70000-0000-4000-8000-000000000002', 'e4c30000-0000-4000-8000-000000000002', 'e4c60000-0000-4000-8000-000000000002', 'GENERAL', 'General E4C3 B');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control
)
values
  ('e4c80000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000001', 'E4C3-A', 'Producto E4C3 A', 'UND', 'good', 'gravado', false, false),
  ('e4c80000-0000-4000-8000-000000000002', 'e4c30000-0000-4000-8000-000000000002', 'E4C3-B', 'Producto E4C3 B', 'UND', 'good', 'gravado', false, false);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table supplier_return_idempotency_items (
  case_name text primary key,
  organization_id uuid not null,
  supplier_id uuid not null,
  receipt_item_id uuid not null
);

do $$
declare
  current_order uuid;
  current_item uuid;
  current_document text;
begin
  for current_index in 1..6 loop
    current_document := case current_index
      when 1 then 'IDEMP-LEGACY'
      when 2 then 'IDEMP-SEQUENTIAL'
      when 3 then 'IDEMP-CONCURRENT'
      when 4 then 'IDEMP-CONFLICT'
      when 5 then 'IDEMP-DISTINCT'
      else 'IDEMP-INSPECTED'
    end;

    perform public.save_purchase_order(jsonb_build_object(
      'organization_id', 'e4c30000-0000-4000-8000-000000000001',
      'supplier_id', 'e4c50000-0000-4000-8000-000000000001',
      'document_type', 'factura',
      'series', 'E4C3',
      'document_number', current_document,
      'issue_date', current_date,
      'warehouse_id', 'e4c60000-0000-4000-8000-000000000001',
      'warehouse', 'Almacen E4C3 A',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', 'e4c80000-0000-4000-8000-000000000001',
        'quantity', 10,
        'unit_cost', 10,
        'lot', '',
        'expiration_date', ''
      ))
    ));
    select purchase.id into current_order
    from public.purchase_orders purchase
    where purchase.organization_id = 'e4c30000-0000-4000-8000-000000000001'
      and purchase.document_number = current_document;

    perform public.issue_purchase_order(
      'e4c30000-0000-4000-8000-000000000001', current_order
    );
    select item.id into current_item
    from public.purchase_order_items item
    where item.purchase_order_id = current_order;

    if current_index = 6 then
      perform public.receive_purchase_order_partial_inspected(jsonb_build_object(
        'organization_id', 'e4c30000-0000-4000-8000-000000000001',
        'purchase_order_id', current_order,
        'operation_key', ('e4c90000-0000-4000-8000-' || lpad(current_index::text, 12, '0'))::uuid,
        'items', jsonb_build_array(jsonb_build_object(
          'purchase_order_item_id', current_item,
          'quantity', 10,
          'fulfillment_mode', 'physical',
          'location_id', 'e4c70000-0000-4000-8000-000000000001',
          'lot', '',
          'expiration_date', '',
          'inspection', jsonb_build_object(
            'inspected_quantity', 10,
            'accepted_quantity', 7,
            'rejected_quantity', 3,
            'findings', jsonb_build_array(jsonb_build_object('reason_code', 'quality', 'quantity', 3))
          )
        ))
      ));
    elsif current_index = 1 then
      perform public.receive_purchase_order_partial(jsonb_build_object(
        'organization_id', 'e4c30000-0000-4000-8000-000000000001',
        'purchase_order_id', current_order,
        'operation_key', ('e4c90000-0000-4000-8000-' || lpad(current_index::text, 12, '0'))::uuid,
        'items', jsonb_build_array(jsonb_build_object(
          'purchase_order_item_id', current_item,
          'quantity', 10,
          'fulfillment_mode', 'physical',
          'location_id', 'e4c70000-0000-4000-8000-000000000001',
          'lot', '',
          'expiration_date', ''
        ))
      ));
    else
      perform public.receive_purchase_order_partial(jsonb_build_object(
        'organization_id', 'e4c30000-0000-4000-8000-000000000001',
        'purchase_order_id', current_order,
        'operation_key', ('e4c90000-0000-4000-8000-' || lpad(current_index::text, 12, '0'))::uuid,
        'items', jsonb_build_array(jsonb_build_object(
          'purchase_order_item_id', current_item,
          'quantity', 10,
          'fulfillment_mode', 'physical',
          'location_id', 'e4c70000-0000-4000-8000-000000000001',
          'lot', '',
          'expiration_date', ''
        ))
      ));
    end if;
  end loop;
end;
$$;

insert into supplier_return_idempotency_items (case_name, organization_id, supplier_id, receipt_item_id)
select cases.current_document, cases.organization_id, cases.supplier_id, receipt_item.id
from (
  values
    ('IDEMP-LEGACY', 'e4c30000-0000-4000-8000-000000000001'::uuid, 'e4c50000-0000-4000-8000-000000000001'::uuid),
    ('IDEMP-SEQUENTIAL', 'e4c30000-0000-4000-8000-000000000001'::uuid, 'e4c50000-0000-4000-8000-000000000001'::uuid),
    ('IDEMP-CONCURRENT', 'e4c30000-0000-4000-8000-000000000001'::uuid, 'e4c50000-0000-4000-8000-000000000001'::uuid),
    ('IDEMP-CONFLICT', 'e4c30000-0000-4000-8000-000000000001'::uuid, 'e4c50000-0000-4000-8000-000000000001'::uuid),
    ('IDEMP-DISTINCT', 'e4c30000-0000-4000-8000-000000000001'::uuid, 'e4c50000-0000-4000-8000-000000000001'::uuid),
    ('IDEMP-INSPECTED', 'e4c30000-0000-4000-8000-000000000001'::uuid, 'e4c50000-0000-4000-8000-000000000001'::uuid)
) as cases(current_document, organization_id, supplier_id)
join public.purchase_orders purchase
  on purchase.organization_id = cases.organization_id
 and purchase.document_number = cases.current_document
join public.purchase_order_items item on item.purchase_order_id = purchase.id
join public.purchase_receipt_items receipt_item on receipt_item.purchase_order_item_id = item.id;

select set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare
  current_order uuid;
  current_item uuid;
begin
  perform public.save_purchase_order(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000002',
    'supplier_id', 'e4c50000-0000-4000-8000-000000000002',
    'document_type', 'factura',
    'series', 'E4C3',
    'document_number', 'IDEMP-ORG-B',
    'issue_date', current_date,
    'warehouse_id', 'e4c60000-0000-4000-8000-000000000002',
    'warehouse', 'Almacen E4C3 B',
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', 'e4c80000-0000-4000-8000-000000000002',
      'quantity', 5,
      'unit_cost', 10,
      'lot', '',
      'expiration_date', ''
    ))
  ));
  select purchase.id into current_order
  from public.purchase_orders purchase
  where purchase.organization_id = 'e4c30000-0000-4000-8000-000000000002'
    and purchase.document_number = 'IDEMP-ORG-B';

  perform public.issue_purchase_order('e4c30000-0000-4000-8000-000000000002', current_order);
  select item.id into current_item from public.purchase_order_items item where item.purchase_order_id = current_order;
  perform public.receive_purchase_order_partial(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000002',
    'purchase_order_id', current_order,
    'operation_key', 'e4c90000-0000-4000-8000-000000000100',
    'items', jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id', current_item,
      'quantity', 5,
      'fulfillment_mode', 'physical',
      'location_id', 'e4c70000-0000-4000-8000-000000000002',
      'lot', '',
      'expiration_date', ''
    ))
  ));
end;
$$;

insert into supplier_return_idempotency_items (case_name, organization_id, supplier_id, receipt_item_id)
select 'IDEMP-ORG-B', 'e4c30000-0000-4000-8000-000000000002'::uuid,
       'e4c50000-0000-4000-8000-000000000002'::uuid, receipt_item.id
from public.purchase_orders purchase
join public.purchase_order_items item on item.purchase_order_id = purchase.id
join public.purchase_receipt_items receipt_item on receipt_item.purchase_order_item_id = item.id
where purchase.organization_id = 'e4c30000-0000-4000-8000-000000000002'
  and purchase.document_number = 'IDEMP-ORG-B';

select set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.purchase_orders where organization_id = 'e4c30000-0000-4000-8000-000000000001'),
  6::bigint,
  'se crean seis ordenes para los casos de idempotencia'
);
select results_eq(
  $$select purchase.document_number, count(receipt_item.id)::bigint
    from public.purchase_orders purchase
    left join public.purchase_order_items item on item.purchase_order_id = purchase.id
    left join public.purchase_receipt_items receipt_item on receipt_item.purchase_order_item_id = item.id
   where purchase.organization_id = 'e4c30000-0000-4000-8000-000000000001'
   group by purchase.document_number
   order by purchase.document_number$$,
  $$values
    ('IDEMP-CONCURRENT'::text, 1::bigint),
    ('IDEMP-CONFLICT'::text, 1::bigint),
    ('IDEMP-DISTINCT'::text, 1::bigint),
    ('IDEMP-INSPECTED'::text, 1::bigint),
    ('IDEMP-LEGACY'::text, 1::bigint),
    ('IDEMP-SEQUENTIAL'::text, 1::bigint)$$,
  'cada orden de prueba tiene una linea de recepcion'
);

select is((select count(*) from supplier_return_idempotency_items), 7::bigint, 'se preparan las lineas de prueba');
select is((select count(*) from public.purchase_receipt_inspections where purchase_order_id = (select purchase.id from public.purchase_orders purchase where purchase.document_number = 'IDEMP-INSPECTED')), 1::bigint, 'la linea inspeccionada queda disponible para probar accepted');

select set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table supplier_return_idempotency_results (
  case_name text primary key,
  first_id uuid,
  retry_id uuid
);

do $$
declare
  first_id uuid;
  retry_id uuid;
  item_id uuid := (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-SEQUENTIAL');
  supplier_id uuid := (select supplier_id from supplier_return_idempotency_items where case_name = 'IDEMP-SEQUENTIAL');
begin
  first_id := public.register_supplier_return(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000001',
    'supplier_id', supplier_id,
    'purchase_receipt_item_id', item_id,
    'operation_key', 'e4ca0000-0000-4000-8000-000000000001',
    'quantity', 3,
    'reason', '  Retry idempotente  '
  ));
  retry_id := public.register_supplier_return(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000001',
    'supplier_id', supplier_id,
    'purchase_receipt_item_id', item_id,
    'operation_key', 'e4ca0000-0000-4000-8000-000000000001',
    'quantity', 3.00,
    'reason', 'Retry idempotente'
  ));
  insert into supplier_return_idempotency_results values ('same-payload', first_id, retry_id);
end;
$$;

select is(
  (select first_id from supplier_return_idempotency_results where case_name = 'same-payload'),
  (select retry_id from supplier_return_idempotency_results where case_name = 'same-payload'),
  'mismo key y payload semantico devuelve el mismo supplier_return'
);
select is(
  (select count(*) from public.supplier_returns where organization_id = 'e4c30000-0000-4000-8000-000000000001' and operation_key = 'e4ca0000-0000-4000-8000-000000000001'),
  1::bigint,
  'el retry secuencial no inserta una segunda devolucion'
);
select ok(
  (select operation_payload_hash ~ '^[0-9a-f]{64}$' from public.supplier_returns where operation_key = 'e4ca0000-0000-4000-8000-000000000001'),
  'el hash idempotente tiene formato SHA-256'
);
set local role postgres;
select is(
  (select count(*) from public.audit_events where organization_id = 'e4c30000-0000-4000-8000-000000000001' and action = 'SUPPLIER_RETURN_REGISTERED' and new_values ->> 'operation_key' = 'e4ca0000-0000-4000-8000-000000000001'),
  1::bigint,
  'el retry no duplica el evento funcional de auditoria'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000001',
    'supplier_id', (select supplier_id from supplier_return_idempotency_items where case_name = 'IDEMP-SEQUENTIAL'),
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-SEQUENTIAL'),
    'operation_key', 'e4ca0000-0000-4000-8000-000000000001',
    'quantity', 4,
    'reason', 'Retry idempotente'
  ))$$,
  'P0001',
  'SUPPLIER_RETURN_IDEMPOTENCY_CONFLICT',
  'misma operation_key con payload diferente genera conflicto explicito'
);
select is(
  (select count(*) from public.supplier_returns where operation_key = 'e4ca0000-0000-4000-8000-000000000001'),
  1::bigint,
  'el payload conflictivo no inserta una segunda devolucion'
);

select lives_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000001',
    'supplier_id', (select supplier_id from supplier_return_idempotency_items where case_name = 'IDEMP-DISTINCT'),
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-DISTINCT'),
    'operation_key', 'e4ca0000-0000-4000-8000-000000000005',
    'quantity', 3,
    'reason', 'Operacion distinta A'
  ))$$,
  'la primera operation_key distinta se registra'
);
select lives_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000001',
    'supplier_id', (select supplier_id from supplier_return_idempotency_items where case_name = 'IDEMP-DISTINCT'),
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-DISTINCT'),
    'operation_key', 'e4ca0000-0000-4000-8000-000000000006',
    'quantity', 3,
    'reason', 'Operacion distinta B'
  ))$$,
  'la segunda operation_key distinta se registra'
);
select is(
  (select count(*) from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-DISTINCT') and status <> 'cancelled'),
  2::bigint,
  'keys distintas permiten operaciones distintas'
);

select lives_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000001',
    'supplier_id', (select supplier_id from supplier_return_idempotency_items where case_name = 'IDEMP-LEGACY'),
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-LEGACY'),
    'quantity', 2,
    'reason', 'Devolucion legacy sin clave'
  ))$$,
  'las llamadas legacy sin operation_key siguen funcionando'
);
select is(
  (select operation_key is null and operation_payload_hash is null from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-LEGACY')),
  true,
  'las devoluciones sin clave no inventan metadata de idempotencia'
);

select is(
  (select accepted_quantity from public.purchase_receipt_inspections where purchase_receipt_item_id = (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-INSPECTED')),
  7::numeric,
  'la recepcion inspeccionada conserva siete aceptadas'
);
select is(
  (select rejected_quantity from public.purchase_receipt_inspections where purchase_receipt_item_id = (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-INSPECTED')),
  3::numeric,
  'la recepcion inspeccionada conserva tres rechazadas'
);
select lives_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000001',
    'supplier_id', (select supplier_id from supplier_return_idempotency_items where case_name = 'IDEMP-INSPECTED'),
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-INSPECTED'),
    'operation_key', 'e4ca0000-0000-4000-8000-000000000007',
    'quantity', 7,
    'reason', 'Devolucion aceptada'
  ))$$,
  'una devolucion idempotente puede usar la cantidad aceptada'
);
select throws_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000001',
    'supplier_id', (select supplier_id from supplier_return_idempotency_items where case_name = 'IDEMP-INSPECTED'),
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-INSPECTED'),
    'operation_key', 'e4ca0000-0000-4000-8000-000000000008',
    'quantity', 1,
    'reason', 'Intento de devolver rechazo'
  ))$$,
  '22023',
  'SUPPLIER_RETURN_QUANTITY_INVALID',
  'la cantidad rechazada no se vuelve devolvible por idempotencia'
);

select set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000002',
    'supplier_id', (select supplier_id from supplier_return_idempotency_items where case_name = 'IDEMP-ORG-B'),
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-ORG-B'),
    'operation_key', 'e4ca0000-0000-4000-8000-000000000001',
    'quantity', 2,
    'reason', 'Misma clave en otra organizacion'
  ))$$,
  'la misma operation_key puede existir en otra organizacion'
);
select is(
  (select count(*) from public.supplier_returns where organization_id = 'e4c30000-0000-4000-8000-000000000002' and operation_key = 'e4ca0000-0000-4000-8000-000000000001'),
  1::bigint,
  'la unicidad de operation_key esta aislada por organizacion'
);

select set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000001","role":"authenticated"}', true);

set local role postgres;
create schema supplier_return_idempotency_test;
create function supplier_return_idempotency_test.run_return(
  requested_receipt_item uuid,
  requested_operation_key uuid,
  requested_quantity numeric,
  requested_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  return_id uuid;
begin
  perform set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000001', true);
  perform set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  return_id := public.register_supplier_return(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000001',
    'supplier_id', 'e4c50000-0000-4000-8000-000000000001',
    'purchase_receipt_item_id', requested_receipt_item,
    'operation_key', requested_operation_key,
    'quantity', requested_quantity,
    'reason', requested_reason
  ));
  return 'ok:' || return_id::text;
exception when others then
  return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;
revoke all on function supplier_return_idempotency_test.run_return(uuid, uuid, numeric, text) from public;

create function supplier_return_idempotency_test.slow_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_sleep(0.75);
  return new;
end;
$$;
revoke all on function supplier_return_idempotency_test.slow_insert() from public;
create trigger supplier_return_idempotency_slow_insert
before insert on public.supplier_returns
for each row execute function supplier_return_idempotency_test.slow_insert();

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000001","role":"authenticated"}', true);

reset role;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(extensions.dblink_connect('returns_idempotency_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres'), 'OK', 'abre la sesion concurrente A');
select is(extensions.dblink_connect('returns_idempotency_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres'), 'OK', 'abre la sesion concurrente B');
create temporary table supplier_return_idempotency_concurrent_results (
  worker text not null,
  result text not null
);

select is(
  extensions.dblink_send_query(
    'returns_idempotency_a',
    format('select supplier_return_idempotency_test.run_return(%L::uuid, %L::uuid, 4::numeric, %L::text)',
      (select receipt_item_id::text from supplier_return_idempotency_items where case_name = 'IDEMP-CONCURRENT'),
      'e4ca0000-0000-4000-8000-000000000003',
      'Retry concurrente')
  ),
  1,
  'inicia el primer retry concurrente con la misma clave'
);
select pg_catalog.pg_sleep(0.1);
select is(
  extensions.dblink_send_query(
    'returns_idempotency_b',
    format('select supplier_return_idempotency_test.run_return(%L::uuid, %L::uuid, 4::numeric, %L::text)',
      (select receipt_item_id::text from supplier_return_idempotency_items where case_name = 'IDEMP-CONCURRENT'),
      'e4ca0000-0000-4000-8000-000000000003',
      'Retry concurrente')
  ),
  1,
  'inicia el segundo retry concurrente con la misma clave'
);
insert into supplier_return_idempotency_concurrent_results
select 'a', result from extensions.dblink_get_result('returns_idempotency_a') as response(result text);
insert into supplier_return_idempotency_concurrent_results
select 'b', result from extensions.dblink_get_result('returns_idempotency_b') as response(result text);
select is((select count(*) from supplier_return_idempotency_concurrent_results where result like 'ok:%'), 2::bigint, 'ambos retries concurrentes reciben un resultado exitoso');
select is((select count(distinct result) from supplier_return_idempotency_concurrent_results), 1::bigint, 'ambos retries concurrentes reciben el mismo supplier_return');
select is((select count(*) from public.supplier_returns where operation_key = 'e4ca0000-0000-4000-8000-000000000003'), 1::bigint, 'la concurrencia con misma clave deja una sola devolucion');
set local role postgres;
select is((select count(*) from public.audit_events where action = 'SUPPLIER_RETURN_REGISTERED' and new_values ->> 'operation_key' = 'e4ca0000-0000-4000-8000-000000000003'), 1::bigint, 'la concurrencia con misma clave deja un solo evento funcional');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.dblink_disconnect('returns_idempotency_a');
select extensions.dblink_disconnect('returns_idempotency_b');

select extensions.dblink_connect('returns_idempotency_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('returns_idempotency_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');
truncate supplier_return_idempotency_concurrent_results;
select is(
  extensions.dblink_send_query(
    'returns_idempotency_a',
    format('select supplier_return_idempotency_test.run_return(%L::uuid, %L::uuid, 2::numeric, %L::text)',
      (select receipt_item_id::text from supplier_return_idempotency_items where case_name = 'IDEMP-CONFLICT'),
      'e4ca0000-0000-4000-8000-000000000004',
      'Payload concurrente A')
  ),
  1,
  'inicia el payload concurrente A'
);
select pg_catalog.pg_sleep(0.1);
select is(
  extensions.dblink_send_query(
    'returns_idempotency_b',
    format('select supplier_return_idempotency_test.run_return(%L::uuid, %L::uuid, 3::numeric, %L::text)',
      (select receipt_item_id::text from supplier_return_idempotency_items where case_name = 'IDEMP-CONFLICT'),
      'e4ca0000-0000-4000-8000-000000000004',
      'Payload concurrente B')
  ),
  1,
  'inicia el payload concurrente B'
);
insert into supplier_return_idempotency_concurrent_results
select 'a', result from extensions.dblink_get_result('returns_idempotency_a') as response(result text);
insert into supplier_return_idempotency_concurrent_results
select 'b', result from extensions.dblink_get_result('returns_idempotency_b') as response(result text);
select is((select count(*) from supplier_return_idempotency_concurrent_results where result like 'ok:%'), 1::bigint, 'payloads distintos concurrentes solo crean una devolucion');
select is((select count(*) from supplier_return_idempotency_concurrent_results where result like 'error:P0001:SUPPLIER_RETURN_IDEMPOTENCY_CONFLICT%'), 1::bigint, 'payload distinto concurrente falla por conflicto explicito');
select is((select count(*) from public.supplier_returns where operation_key = 'e4ca0000-0000-4000-8000-000000000004'), 1::bigint, 'payload distinto concurrente no duplica el registro');
select extensions.dblink_disconnect('returns_idempotency_a');
select extensions.dblink_disconnect('returns_idempotency_b');

select extensions.dblink_connect('returns_idempotency_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('returns_idempotency_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');
truncate supplier_return_idempotency_concurrent_results;
select is(
  extensions.dblink_send_query(
    'returns_idempotency_a',
    format('select supplier_return_idempotency_test.run_return(%L::uuid, %L::uuid, 2::numeric, %L::text)',
      (select receipt_item_id::text from supplier_return_idempotency_items where case_name = 'IDEMP-DISTINCT'),
      'e4ca0000-0000-4000-8000-000000000009',
      'Keys distintas concurrentes A')
  ),
  1,
  'inicia la key distinta concurrente A'
);
select is(
  extensions.dblink_send_query(
    'returns_idempotency_b',
    format('select supplier_return_idempotency_test.run_return(%L::uuid, %L::uuid, 2::numeric, %L::text)',
      (select receipt_item_id::text from supplier_return_idempotency_items where case_name = 'IDEMP-DISTINCT'),
      'e4ca0000-0000-4000-8000-00000000000a',
      'Keys distintas concurrentes B')
  ),
  1,
  'inicia la key distinta concurrente B'
);
insert into supplier_return_idempotency_concurrent_results
select 'a', result from extensions.dblink_get_result('returns_idempotency_a') as response(result text);
insert into supplier_return_idempotency_concurrent_results
select 'b', result from extensions.dblink_get_result('returns_idempotency_b') as response(result text);
select is((select count(*) from supplier_return_idempotency_concurrent_results where result like 'ok:%'), 2::bigint, 'keys distintas concurrentes permiten ambas operaciones');
select is((select count(*) from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-DISTINCT') and status <> 'cancelled'), 4::bigint, 'las operaciones distintas conservan sus registros sin colisionar');
select extensions.dblink_disconnect('returns_idempotency_a');
select extensions.dblink_disconnect('returns_idempotency_b');

reset role;
set local role postgres;
drop trigger supplier_return_idempotency_slow_insert on public.supplier_returns;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.complete_supplier_return(
    'e4c30000-0000-4000-8000-000000000001',
    (select id from public.supplier_returns where operation_key = 'e4ca0000-0000-4000-8000-000000000001')
  )$$,
  'la devolucion idempotente conserva la compatibilidad con complete_supplier_return'
);
select is(
  (select count(*) from public.inventory_movements where source_type = 'supplier-return' and source_id = (select id from public.supplier_returns where operation_key = 'e4ca0000-0000-4000-8000-000000000001')),
  1::bigint,
  'complete_supplier_return sigue generando una sola salida'
);
select is(
  (select status from public.supplier_returns where operation_key = 'e4ca0000-0000-4000-8000-000000000001'),
  'completed',
  'el retry idempotente conserva el resultado completed existente'
);

select set_config('request.jwt.claim.sub', 'e4c40000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"e4c40000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'e4c30000-0000-4000-8000-000000000001',
    'supplier_id', (select supplier_id from supplier_return_idempotency_items where case_name = 'IDEMP-SEQUENTIAL'),
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_idempotency_items where case_name = 'IDEMP-SEQUENTIAL'),
    'operation_key', 'e4ca0000-0000-4000-8000-00000000000b',
    'quantity', 1,
    'reason', 'Organizacion ajena'
  ))$$,
  '42501',
  'SUPPLIER_RETURN_FORBIDDEN',
  'un usuario de otra organizacion no registra devoluciones ajenas'
);

reset role;
set local role postgres;
drop schema supplier_return_idempotency_test cascade;
delete from public.supplier_returns
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
alter table public.inventory_movements enable trigger inventory_movements_immutable;
set constraints all immediate;
alter table public.purchase_receipt_inspections disable trigger purchase_receipt_inspections_immutable;
update public.purchase_receipt_inspections
set status = 'voided',
    voided_by = 'e4c40000-0000-4000-8000-000000000001',
    voided_at = now(),
    void_reason = 'Limpieza de prueba de idempotencia'
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
alter table public.purchase_receipt_inspection_reasons disable trigger purchase_receipt_inspection_reasons_immutable;
delete from public.purchase_receipt_inspection_reasons
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
set constraints all immediate;
alter table public.purchase_receipt_inspection_reasons enable trigger purchase_receipt_inspection_reasons_immutable;
delete from public.purchase_receipt_inspections
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
set constraints all immediate;
alter table public.purchase_receipt_inspections enable trigger purchase_receipt_inspections_immutable;
alter table public.purchase_receipt_items disable trigger purchase_receipt_items_immutable;
delete from public.purchase_receipt_items
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
alter table public.purchase_receipt_items enable trigger purchase_receipt_items_immutable;
alter table public.purchase_receipts disable trigger purchase_receipts_immutable;
delete from public.purchase_receipts
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
alter table public.purchase_receipts enable trigger purchase_receipts_immutable;
delete from public.purchase_order_items
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
delete from public.purchase_orders
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
delete from public.warehouse_locations
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
delete from public.warehouses
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
delete from public.suppliers
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
delete from public.user_roles
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
delete from public.organization_memberships
where organization_id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
delete from public.organizations
where id in ('e4c30000-0000-4000-8000-000000000001', 'e4c30000-0000-4000-8000-000000000002');
delete from auth.users
where id in ('e4c40000-0000-4000-8000-000000000001', 'e4c40000-0000-4000-8000-000000000002');

commit;
select * from finish();
