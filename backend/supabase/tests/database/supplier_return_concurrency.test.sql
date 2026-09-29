begin;

select plan(47);
create extension if not exists dblink with schema extensions;

select has_function(
  'public',
  'register_supplier_return',
  array['jsonb'],
  'la funcion de devolucion permanece disponible'
);
select ok(
  position(
    'for update of receipt_item' in lower(
      pg_get_functiondef('public.register_supplier_return(jsonb)'::regprocedure)
    )
  ) > 0,
  'la funcion bloquea la linea de recepcion antes de validar el saldo'
);
select is(
  has_function_privilege(
    'anon',
    'public.register_supplier_return(jsonb)',
    'EXECUTE'
  ),
  false,
  'anon no puede registrar devoluciones'
);

insert into public.organizations (id, name, slug)
values
  ('d0c00000-0000-4000-8000-000000000001', 'Devoluciones concurrentes', 'devoluciones-concurrentes'),
  ('d0c00000-0000-4000-8000-000000000002', 'Otra organizacion', 'devoluciones-otra');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('d0c10000-0000-4000-8000-000000000001', 'returns.owner@test.local', '{"full_name":"Returns Owner"}', now(), now()),
  ('d0c10000-0000-4000-8000-000000000002', 'returns.no-permission@test.local', '{"full_name":"Returns No Permission"}', now(), now()),
  ('d0c10000-0000-4000-8000-000000000003', 'returns.other-org@test.local', '{"full_name":"Returns Other Org"}', now(), now());

insert into public.organization_memberships (organization_id, user_id)
values
  ('d0c00000-0000-4000-8000-000000000001', 'd0c10000-0000-4000-8000-000000000001'),
  ('d0c00000-0000-4000-8000-000000000001', 'd0c10000-0000-4000-8000-000000000002'),
  ('d0c00000-0000-4000-8000-000000000002', 'd0c10000-0000-4000-8000-000000000003');

insert into public.user_roles (organization_id, user_id, role_code)
values
  ('d0c00000-0000-4000-8000-000000000001', 'd0c10000-0000-4000-8000-000000000001', 'COMPRAS'),
  ('d0c00000-0000-4000-8000-000000000001', 'd0c10000-0000-4000-8000-000000000001', 'ALMACEN'),
  ('d0c00000-0000-4000-8000-000000000002', 'd0c10000-0000-4000-8000-000000000003', 'COMPRAS');

insert into public.suppliers (id, organization_id, document_type, document_number, business_name)
values (
  'd0c20000-0000-4000-8000-000000000001',
  'd0c00000-0000-4000-8000-000000000001',
  'ruc', '20999999991', 'Proveedor devoluciones concurrentes'
);

insert into public.warehouses (id, organization_id, code, name)
values (
  'd0c30000-0000-4000-8000-000000000001',
  'd0c00000-0000-4000-8000-000000000001',
  'RET-CONC', 'Almacen devoluciones concurrentes'
);

insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name)
values (
  'd0c40000-0000-4000-8000-000000000001',
  'd0c00000-0000-4000-8000-000000000001',
  'd0c30000-0000-4000-8000-000000000001',
  'GENERAL', 'General devoluciones concurrentes'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control
)
values (
  'd0c50000-0000-4000-8000-000000000001',
  'd0c00000-0000-4000-8000-000000000001',
  'RET-CONC-GOOD', 'Bien devoluciones concurrentes', 'UND', 'good',
  'gravado', false, false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0c10000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"d0c10000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$
declare
  order_id uuid;
  requested_operation uuid;
  order_number text;
begin
  for current_index in 1..8 loop
    order_number := 'SRC-' || lpad(current_index::text, 3, '0');
    requested_operation := ('d0c60000-0000-4000-8000-' || lpad(current_index::text, 12, '0'))::uuid;
    perform public.save_purchase_order(jsonb_build_object(
      'organization_id', 'd0c00000-0000-4000-8000-000000000001',
      'supplier_id', 'd0c20000-0000-4000-8000-000000000001',
      'document_type', 'factura',
      'series', 'SRC',
      'document_number', order_number,
      'issue_date', current_date,
      'warehouse_id', 'd0c30000-0000-4000-8000-000000000001',
      'warehouse', 'Almacen devoluciones concurrentes',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', 'd0c50000-0000-4000-8000-000000000001',
        'quantity', 10,
        'unit_cost', 10,
        'lot', '',
        'expiration_date', ''
      ))
    ));

    select purchase.id
    into order_id
    from public.purchase_orders purchase
    where purchase.organization_id = 'd0c00000-0000-4000-8000-000000000001'
      and purchase.document_number = order_number;

    perform public.issue_purchase_order(
      'd0c00000-0000-4000-8000-000000000001',
      order_id
    );

    if current_index = 7 then
      perform public.receive_purchase_order_partial(jsonb_build_object(
        'organization_id', 'd0c00000-0000-4000-8000-000000000001',
        'purchase_order_id', order_id,
        'operation_key', requested_operation,
        'items', jsonb_build_array(jsonb_build_object(
          'purchase_order_item_id', (select item.id from public.purchase_order_items item where item.purchase_order_id = order_id),
          'quantity', 10,
          'fulfillment_mode', 'physical',
          'location_id', 'd0c40000-0000-4000-8000-000000000001',
          'lot', '',
          'expiration_date', ''
        ))
      ));
    elsif current_index = 8 then
      perform public.receive_purchase_order_partial_inspected(jsonb_build_object(
        'organization_id', 'd0c00000-0000-4000-8000-000000000001',
        'purchase_order_id', order_id,
        'operation_key', requested_operation,
        'items', jsonb_build_array(jsonb_build_object(
          'purchase_order_item_id', (select item.id from public.purchase_order_items item where item.purchase_order_id = order_id),
          'quantity', 10,
          'fulfillment_mode', 'physical',
          'location_id', 'd0c40000-0000-4000-8000-000000000001',
          'lot', '',
          'expiration_date', '',
          'inspection', jsonb_build_object(
            'inspected_quantity', 10,
            'accepted_quantity', 7,
            'rejected_quantity', 3,
            'findings', jsonb_build_array(jsonb_build_object(
              'reason_code', 'quality',
              'quantity', 3
            ))
          )
        ))
      ));
    else
      perform public.receive_purchase_order_partial_inspected(jsonb_build_object(
        'organization_id', 'd0c00000-0000-4000-8000-000000000001',
        'purchase_order_id', order_id,
        'operation_key', requested_operation,
        'items', jsonb_build_array(jsonb_build_object(
          'purchase_order_item_id', (select item.id from public.purchase_order_items item where item.purchase_order_id = order_id),
          'quantity', 10,
          'fulfillment_mode', 'physical',
          'location_id', 'd0c40000-0000-4000-8000-000000000001',
          'lot', '',
          'expiration_date', '',
          'inspection', jsonb_build_object(
            'inspected_quantity', 10,
            'accepted_quantity', 10,
            'rejected_quantity', 0,
            'findings', '[]'::jsonb
          )
        ))
      ));
    end if;
  end loop;
end;
$$;

reset role;
commit;

create temporary table supplier_return_concurrency_items (
  case_name text primary key,
  receipt_item_id uuid not null
);
grant select on supplier_return_concurrency_items to authenticated;

insert into supplier_return_concurrency_items (case_name, receipt_item_id)
values
  ('seven', (select receipt_item.id from public.purchase_receipt_items receipt_item join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = 'SRC-001')),
  ('six-four', (select receipt_item.id from public.purchase_receipt_items receipt_item join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = 'SRC-002')),
  ('five-five', (select receipt_item.id from public.purchase_receipt_items receipt_item join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = 'SRC-003')),
  ('ten-one', (select receipt_item.id from public.purchase_receipt_items receipt_item join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = 'SRC-004')),
  ('distinct-a', (select receipt_item.id from public.purchase_receipt_items receipt_item join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = 'SRC-005')),
  ('distinct-b', (select receipt_item.id from public.purchase_receipt_items receipt_item join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = 'SRC-006')),
  ('historical', (select receipt_item.id from public.purchase_receipt_items receipt_item join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = 'SRC-007')),
  ('rejected', (select receipt_item.id from public.purchase_receipt_items receipt_item join public.purchase_receipts receipt on receipt.id = receipt_item.receipt_id join public.purchase_orders purchase on purchase.id = receipt.purchase_order_id where purchase.document_number = 'SRC-008'));

select is((select count(*) from supplier_return_concurrency_items), 8::bigint, 'se preparan ocho lineas de recepcion independientes');
select is((select count(*) from public.purchase_receipt_inspections where organization_id = 'd0c00000-0000-4000-8000-000000000001'), 7::bigint, 'siete recepciones tienen inspeccion');
select is((select count(*) from public.purchase_receipt_inspections inspection where inspection.purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'historical')), 0::bigint, 'la recepcion legacy queda sin inspeccion');
select is((select accepted_quantity from public.purchase_receipt_inspections inspection where inspection.purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'rejected')), 7::numeric, 'la inspeccion conserva siete unidades aceptadas');
select is((select rejected_quantity from public.purchase_receipt_inspections inspection where inspection.purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'rejected')), 3::numeric, 'la inspeccion conserva tres unidades rechazadas');

create schema supplier_return_concurrency_test;
create function supplier_return_concurrency_test.run_return(
  requested_receipt_item uuid,
  requested_quantity numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  return_id uuid;
begin
  perform set_config('request.jwt.claim.sub', 'd0c10000-0000-4000-8000-000000000001', true);
  perform set_config('request.jwt.claims', '{"sub":"d0c10000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  return_id := public.register_supplier_return(jsonb_build_object(
    'organization_id', 'd0c00000-0000-4000-8000-000000000001',
    'supplier_id', 'd0c20000-0000-4000-8000-000000000001',
    'purchase_receipt_item_id', requested_receipt_item,
    'quantity', requested_quantity,
    'reason', 'Prueba de concurrencia'
  ));
  return 'ok:' || return_id::text;
exception when others then
  return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;
revoke all on function supplier_return_concurrency_test.run_return(uuid, numeric) from public;

create function supplier_return_concurrency_test.slow_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_sleep(0.75);
  return new;
end;
$$;
revoke all on function supplier_return_concurrency_test.slow_insert() from public;
create trigger supplier_return_concurrency_slow_insert
before insert on public.supplier_returns
for each row execute function supplier_return_concurrency_test.slow_insert();

select is(extensions.dblink_connect('returns_concurrency_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres'), 'OK', 'abre la sesion concurrente A');
select is(extensions.dblink_connect('returns_concurrency_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres'), 'OK', 'abre la sesion concurrente B');

create temporary table supplier_return_concurrency_results (
  worker text not null,
  result text not null
);

select is(
  extensions.dblink_send_query(
    'returns_concurrency_a',
    format('select supplier_return_concurrency_test.run_return(%L::uuid, 7::numeric)', (select receipt_item_id::text from supplier_return_concurrency_items where case_name = 'seven'))
  ),
  1,
  'inicia la devolucion 7 de la sesion A'
);
select is(
  extensions.dblink_send_query(
    'returns_concurrency_b',
    format('select supplier_return_concurrency_test.run_return(%L::uuid, 7::numeric)', (select receipt_item_id::text from supplier_return_concurrency_items where case_name = 'seven'))
  ),
  1,
  'inicia la devolucion 7 de la sesion B'
);
insert into supplier_return_concurrency_results
select 'a', result from extensions.dblink_get_result('returns_concurrency_a') as response(result text);
insert into supplier_return_concurrency_results
select 'b', result from extensions.dblink_get_result('returns_concurrency_b') as response(result text);
select is((select count(*) from supplier_return_concurrency_results where result like 'ok:%'), 1::bigint, 'con saldo 10 solo una devolucion 7 se registra');
select is((select count(*) from supplier_return_concurrency_results where result like 'error:22023:SUPPLIER_RETURN_QUANTITY_INVALID%'), 1::bigint, 'la segunda devolucion 7 falla por limite excedido');
select is((select coalesce(sum(quantity), 0) from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'seven') and status <> 'cancelled'), 7::numeric, 'el total concurrente 7+7 no supera 10');
select extensions.dblink_disconnect('returns_concurrency_a');
select extensions.dblink_disconnect('returns_concurrency_b');
select extensions.dblink_connect('returns_concurrency_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('returns_concurrency_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');

truncate supplier_return_concurrency_results;
select is(extensions.dblink_send_query('returns_concurrency_a', format('select supplier_return_concurrency_test.run_return(%L::uuid, 6::numeric)', (select receipt_item_id::text from supplier_return_concurrency_items where case_name = 'six-four'))), 1, 'inicia 6 concurrente');
select is(extensions.dblink_send_query('returns_concurrency_b', format('select supplier_return_concurrency_test.run_return(%L::uuid, 4::numeric)', (select receipt_item_id::text from supplier_return_concurrency_items where case_name = 'six-four'))), 1, 'inicia 4 concurrente');
insert into supplier_return_concurrency_results
select 'a', result from extensions.dblink_get_result('returns_concurrency_a') as response(result text);
insert into supplier_return_concurrency_results
select 'b', result from extensions.dblink_get_result('returns_concurrency_b') as response(result text);
select is((select count(*) from supplier_return_concurrency_results where result like 'ok:%'), 2::bigint, '6+4 puede completar ambas devoluciones');
select is((select sum(quantity) from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'six-four') and status <> 'cancelled'), 10::numeric, '6+4 termina exactamente en 10');
select extensions.dblink_disconnect('returns_concurrency_a');
select extensions.dblink_disconnect('returns_concurrency_b');
select extensions.dblink_connect('returns_concurrency_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('returns_concurrency_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');

truncate supplier_return_concurrency_results;
select is(extensions.dblink_send_query('returns_concurrency_a', format('select supplier_return_concurrency_test.run_return(%L::uuid, 5::numeric)', (select receipt_item_id::text from supplier_return_concurrency_items where case_name = 'five-five'))), 1, 'inicia 5 concurrente A');
select is(extensions.dblink_send_query('returns_concurrency_b', format('select supplier_return_concurrency_test.run_return(%L::uuid, 5::numeric)', (select receipt_item_id::text from supplier_return_concurrency_items where case_name = 'five-five'))), 1, 'inicia 5 concurrente B');
insert into supplier_return_concurrency_results
select 'a', result from extensions.dblink_get_result('returns_concurrency_a') as response(result text);
insert into supplier_return_concurrency_results
select 'b', result from extensions.dblink_get_result('returns_concurrency_b') as response(result text);
select is((select count(*) from supplier_return_concurrency_results where result like 'ok:%'), 2::bigint, '5+5 puede completar ambas devoluciones');
select is((select sum(quantity) from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'five-five') and status <> 'cancelled'), 10::numeric, '5+5 termina exactamente en 10');
select extensions.dblink_disconnect('returns_concurrency_a');
select extensions.dblink_disconnect('returns_concurrency_b');
select extensions.dblink_connect('returns_concurrency_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('returns_concurrency_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');

truncate supplier_return_concurrency_results;
select is(extensions.dblink_send_query('returns_concurrency_a', format('select supplier_return_concurrency_test.run_return(%L::uuid, 10::numeric)', (select receipt_item_id::text from supplier_return_concurrency_items where case_name = 'ten-one'))), 1, 'inicia 10 concurrente');
select pg_catalog.pg_sleep(0.1);
select is(extensions.dblink_send_query('returns_concurrency_b', format('select supplier_return_concurrency_test.run_return(%L::uuid, 1::numeric)', (select receipt_item_id::text from supplier_return_concurrency_items where case_name = 'ten-one'))), 1, 'inicia 1 concurrente');
insert into supplier_return_concurrency_results
select 'a', result from extensions.dblink_get_result('returns_concurrency_a') as response(result text);
insert into supplier_return_concurrency_results
select 'b', result from extensions.dblink_get_result('returns_concurrency_b') as response(result text);
select is((select count(*) from supplier_return_concurrency_results where result like 'ok:%'), 1::bigint, '10+1 permite una sola devolucion');
select is((select count(*) from supplier_return_concurrency_results where result like 'error:22023:SUPPLIER_RETURN_QUANTITY_INVALID%'), 1::bigint, '10+1 rechaza la devolucion sobrante');
select is((select sum(quantity) from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'ten-one') and status <> 'cancelled'), 10::numeric, '10+1 conserva exactamente la devolucion de 10');
select extensions.dblink_disconnect('returns_concurrency_a');
select extensions.dblink_disconnect('returns_concurrency_b');
select extensions.dblink_connect('returns_concurrency_a', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('returns_concurrency_b', 'host=supabase_db_backend dbname=postgres user=postgres password=postgres');

truncate supplier_return_concurrency_results;
select is(extensions.dblink_send_query('returns_concurrency_a', format('select supplier_return_concurrency_test.run_return(%L::uuid, 3::numeric)', (select receipt_item_id::text from supplier_return_concurrency_items where case_name = 'distinct-a'))), 1, 'inicia devolucion de una linea independiente');
select is(extensions.dblink_send_query('returns_concurrency_b', format('select supplier_return_concurrency_test.run_return(%L::uuid, 3::numeric)', (select receipt_item_id::text from supplier_return_concurrency_items where case_name = 'distinct-b'))), 1, 'inicia otra devolucion de linea independiente');
insert into supplier_return_concurrency_results
select 'a', result from extensions.dblink_get_result('returns_concurrency_a') as response(result text);
insert into supplier_return_concurrency_results
select 'b', result from extensions.dblink_get_result('returns_concurrency_b') as response(result text);
select is((select count(*) from supplier_return_concurrency_results where result like 'ok:%'), 2::bigint, 'lineas de recepcion distintas no se bloquean funcionalmente entre si');
select is((select sum(quantity) from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'distinct-a') and status <> 'cancelled'), 3::numeric, 'la primera linea independiente conserva su saldo');
select is((select sum(quantity) from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'distinct-b') and status <> 'cancelled'), 3::numeric, 'la segunda linea independiente conserva su saldo');

select extensions.dblink_disconnect('returns_concurrency_a');
select extensions.dblink_disconnect('returns_concurrency_b');
drop trigger supplier_return_concurrency_slow_insert on public.supplier_returns;

set role authenticated;
select set_config('request.jwt.claim.sub', 'd0c10000-0000-4000-8000-000000000001', false);
select set_config('request.jwt.claims', '{"sub":"d0c10000-0000-4000-8000-000000000001","role":"authenticated"}', false);
select is((select count(*) from public.purchase_receipt_inspections inspection where inspection.purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'historical')), 0::bigint, 'la recepcion historica no se convierte implicitamente en inspeccion');
select lives_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'd0c00000-0000-4000-8000-000000000001',
    'supplier_id', 'd0c20000-0000-4000-8000-000000000001',
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_concurrency_items where case_name = 'historical'),
    'quantity', 10,
    'reason', 'Devolucion historica compatible'
  ))$$,
  'la recepcion sin inspeccion conserva el limite fisico historico'
);
select throws_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'd0c00000-0000-4000-8000-000000000001',
    'supplier_id', 'd0c20000-0000-4000-8000-000000000001',
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_concurrency_items where case_name = 'historical'),
    'quantity', 1,
    'reason', 'Exceso historico'
  ))$$,
  '22023',
  'SUPPLIER_RETURN_QUANTITY_INVALID',
  'la recepcion historica no permite superar la cantidad fisica'
);
select is((select sum(quantity) from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'historical') and status <> 'cancelled'), 10::numeric, 'la devolucion historica queda limitada a 10');

select is((select accepted_quantity from public.purchase_receipt_inspections inspection where inspection.purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'rejected')), 7::numeric, 'la devolucion inspeccionada usa la cantidad aceptada');
select lives_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'd0c00000-0000-4000-8000-000000000001',
    'supplier_id', 'd0c20000-0000-4000-8000-000000000001',
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_concurrency_items where case_name = 'rejected'),
    'quantity', 7,
    'reason', 'Devolucion de aceptado'
  ))$$,
  'la cantidad aceptada se puede devolver posteriormente'
);
select throws_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'd0c00000-0000-4000-8000-000000000001',
    'supplier_id', 'd0c20000-0000-4000-8000-000000000001',
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_concurrency_items where case_name = 'rejected'),
    'quantity', 1,
    'reason', 'Devolucion del rechazado'
  ))$$,
  '22023',
  'SUPPLIER_RETURN_QUANTITY_INVALID',
  'la cantidad rechazada no es devolvible posteriormente'
);
select is((select sum(quantity) from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'rejected') and status <> 'cancelled'), 7::numeric, 'la devolucion inspeccionada no excede el aceptado');

select lives_ok(
  $$select public.complete_supplier_return(
    'd0c00000-0000-4000-8000-000000000001',
    (select id from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'six-four') and quantity = 6 and status = 'registered')
  )$$,
  'la finalizacion de devolucion conserva el flujo de inventario'
);
select is((select count(*) from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'six-four') and status = 'completed'), 1::bigint, 'la devolucion finalizada cambia a completed');
select is((select sum(quantity) from public.inventory_movements where source_type = 'supplier-return' and source_id = (select id from public.supplier_returns where purchase_receipt_item_id = (select receipt_item_id from supplier_return_concurrency_items where case_name = 'six-four') and quantity = 6)), 6::numeric, 'la finalizacion crea una sola salida por la cantidad solicitada');

select set_config('request.jwt.claim.sub', 'd0c10000-0000-4000-8000-000000000002', false);
select set_config('request.jwt.claims', '{"sub":"d0c10000-0000-4000-8000-000000000002","role":"authenticated"}', false);
select throws_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'd0c00000-0000-4000-8000-000000000001',
    'supplier_id', 'd0c20000-0000-4000-8000-000000000001',
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_concurrency_items where case_name = 'five-five'),
    'quantity', 1,
    'reason', 'Usuario sin permiso'
  ))$$,
  '42501',
  'SUPPLIER_RETURN_FORBIDDEN',
  'un usuario sin SUPPLIERS_MANAGE no registra devoluciones'
);

select set_config('request.jwt.claim.sub', 'd0c10000-0000-4000-8000-000000000003', false);
select set_config('request.jwt.claims', '{"sub":"d0c10000-0000-4000-8000-000000000003","role":"authenticated"}', false);
select is((select count(*) from public.supplier_returns where organization_id = 'd0c00000-0000-4000-8000-000000000001'), 0::bigint, 'otra organizacion no puede leer devoluciones ajenas');
select throws_ok(
  $$select public.register_supplier_return(jsonb_build_object(
    'organization_id', 'd0c00000-0000-4000-8000-000000000001',
    'supplier_id', 'd0c20000-0000-4000-8000-000000000001',
    'purchase_receipt_item_id', (select receipt_item_id from supplier_return_concurrency_items where case_name = 'five-five'),
    'quantity', 1,
    'reason', 'Otra organizacion'
  ))$$,
  '42501',
  'SUPPLIER_RETURN_FORBIDDEN',
  'otra organizacion no puede registrar devoluciones ajenas'
);
reset role;

begin;
drop schema supplier_return_concurrency_test cascade;
delete from public.supplier_returns where organization_id = 'd0c00000-0000-4000-8000-000000000001';
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements where organization_id = 'd0c00000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
set constraints all immediate;
alter table public.purchase_receipt_inspections disable trigger purchase_receipt_inspections_immutable;
update public.purchase_receipt_inspections
set status = 'voided',
    voided_by = 'd0c10000-0000-4000-8000-000000000001',
    voided_at = now(),
    void_reason = 'Limpieza de prueba de concurrencia'
where organization_id = 'd0c00000-0000-4000-8000-000000000001';
alter table public.purchase_receipt_inspection_reasons disable trigger purchase_receipt_inspection_reasons_immutable;
delete from public.purchase_receipt_inspection_reasons where organization_id = 'd0c00000-0000-4000-8000-000000000001';
set constraints all immediate;
alter table public.purchase_receipt_inspection_reasons enable trigger purchase_receipt_inspection_reasons_immutable;
delete from public.purchase_receipt_inspections where organization_id = 'd0c00000-0000-4000-8000-000000000001';
set constraints all immediate;
alter table public.purchase_receipt_inspections enable trigger purchase_receipt_inspections_immutable;
alter table public.purchase_receipt_items disable trigger purchase_receipt_items_immutable;
delete from public.purchase_receipt_items where organization_id = 'd0c00000-0000-4000-8000-000000000001';
alter table public.purchase_receipt_items enable trigger purchase_receipt_items_immutable;
alter table public.purchase_receipts disable trigger purchase_receipts_immutable;
delete from public.purchase_receipts where organization_id = 'd0c00000-0000-4000-8000-000000000001';
alter table public.purchase_receipts enable trigger purchase_receipts_immutable;
delete from public.purchase_order_items where organization_id = 'd0c00000-0000-4000-8000-000000000001';
delete from public.purchase_orders where organization_id = 'd0c00000-0000-4000-8000-000000000001';
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'd0c00000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'd0c00000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.products where organization_id = 'd0c00000-0000-4000-8000-000000000001';
delete from public.warehouse_locations where organization_id = 'd0c00000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'd0c00000-0000-4000-8000-000000000001';
delete from public.suppliers where organization_id = 'd0c00000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id in ('d0c00000-0000-4000-8000-000000000001', 'd0c00000-0000-4000-8000-000000000002');
delete from public.organization_memberships where organization_id in ('d0c00000-0000-4000-8000-000000000001', 'd0c00000-0000-4000-8000-000000000002');
delete from public.organizations where id in ('d0c00000-0000-4000-8000-000000000001', 'd0c00000-0000-4000-8000-000000000002');
delete from auth.users where id in ('d0c10000-0000-4000-8000-000000000001', 'd0c10000-0000-4000-8000-000000000002', 'd0c10000-0000-4000-8000-000000000003');
commit;

select * from finish();
