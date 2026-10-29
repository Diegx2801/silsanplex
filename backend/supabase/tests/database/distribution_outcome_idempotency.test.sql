begin;

-- These fixtures use current_date as the business date. Keep the test session
-- aligned with SILSAN's calendar even when the runner itself uses UTC.
set local timezone = 'America/Lima';

select plan(35);

select is(
  has_function_privilege('anon', 'public.record_distribution_delivery_outcome(jsonb)', 'EXECUTE'),
  false,
  'anon cannot execute the outcome RPC'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.record_distribution_delivery_outcome(jsonb)'::regprocedure),
  'outcome RPC remains SECURITY DEFINER'
);

insert into public.organizations (id, name, slug) values
  ('d2c20000-0000-4000-8000-000000000001', 'Outcome idempotency test', 'outcome-idempotency-test'),
  ('d2c20000-0000-4000-8000-000000000002', 'Outcome idempotency tenant test', 'outcome-idempotency-tenant-test');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('e2c20000-0000-4000-8000-000000000001', 'outcome-idempotency-a@test.local', '{"full_name":"Outcome idempotency test A"}', now(), now()),
  ('e2c20000-0000-4000-8000-000000000002', 'outcome-idempotency-b@test.local', '{"full_name":"Outcome idempotency test B"}', now(), now());

insert into public.organization_memberships (organization_id, user_id) values
  ('d2c20000-0000-4000-8000-000000000001', 'e2c20000-0000-4000-8000-000000000001'),
  ('d2c20000-0000-4000-8000-000000000002', 'e2c20000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('d2c20000-0000-4000-8000-000000000001', 'e2c20000-0000-4000-8000-000000000001', 'LOGISTICA'),
  ('d2c20000-0000-4000-8000-000000000002', 'e2c20000-0000-4000-8000-000000000002', 'LOGISTICA');

insert into public.customers (
  id, organization_id, document_type, document_number, legal_name, created_by, updated_by
) values
  ('c2c20000-0000-4000-8000-000000000001', 'd2c20000-0000-4000-8000-000000000001', 'RUC', '20262000001', 'Outcome test customer A', 'e2c20000-0000-4000-8000-000000000001', 'e2c20000-0000-4000-8000-000000000001'),
  ('c2c20000-0000-4000-8000-000000000002', 'd2c20000-0000-4000-8000-000000000002', 'RUC', '20262000002', 'Outcome test customer B', 'e2c20000-0000-4000-8000-000000000002', 'e2c20000-0000-4000-8000-000000000002');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, tax_affectation, batch_control,
  product_type, created_by, updated_by
) values
  ('b2c20000-0000-4000-8000-000000000001', 'd2c20000-0000-4000-8000-000000000001', 'OUT-IDEM-1', 'Outcome item A1', 'UND', 'gravado', false, 'good', 'e2c20000-0000-4000-8000-000000000001', 'e2c20000-0000-4000-8000-000000000001'),
  ('b2c20000-0000-4000-8000-000000000002', 'd2c20000-0000-4000-8000-000000000001', 'OUT-IDEM-2', 'Outcome item A2', 'UND', 'gravado', false, 'good', 'e2c20000-0000-4000-8000-000000000001', 'e2c20000-0000-4000-8000-000000000001'),
  ('b2c20000-0000-4000-8000-000000000003', 'd2c20000-0000-4000-8000-000000000002', 'OUT-IDEM-3', 'Outcome item B1', 'UND', 'gravado', false, 'good', 'e2c20000-0000-4000-8000-000000000002', 'e2c20000-0000-4000-8000-000000000002');

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by) values
  ('a2c20000-0000-4000-8000-000000000001', 'd2c20000-0000-4000-8000-000000000001', 'OUTA', 'Outcome warehouse A', 'e2c20000-0000-4000-8000-000000000001', 'e2c20000-0000-4000-8000-000000000001'),
  ('a2c20000-0000-4000-8000-000000000002', 'd2c20000-0000-4000-8000-000000000002', 'OUTB', 'Outcome warehouse B', 'e2c20000-0000-4000-8000-000000000002', 'e2c20000-0000-4000-8000-000000000002');

insert into public.orders (
  id, organization_id, order_number, customer_id, warehouse_id, delivery_address_snapshot,
  order_date, status, fulfillment_status, operation_key, created_by, updated_by
) values
  ('a2c20000-0000-4000-8000-000000000011', 'd2c20000-0000-4000-8000-000000000001', 'PED-260001', 'c2c20000-0000-4000-8000-000000000001', 'a2c20000-0000-4000-8000-000000000001', '{"address_line":"Test address A1"}', current_date - 2, 'confirmado', 'dispatched', 'a2c20000-0000-4000-8000-000000000111', 'e2c20000-0000-4000-8000-000000000001', 'e2c20000-0000-4000-8000-000000000001'),
  ('a2c20000-0000-4000-8000-000000000012', 'd2c20000-0000-4000-8000-000000000001', 'PED-260002', 'c2c20000-0000-4000-8000-000000000001', 'a2c20000-0000-4000-8000-000000000001', '{"address_line":"Test address A2"}', current_date - 2, 'confirmado', 'dispatched', 'a2c20000-0000-4000-8000-000000000112', 'e2c20000-0000-4000-8000-000000000001', 'e2c20000-0000-4000-8000-000000000001'),
  ('a2c20000-0000-4000-8000-000000000013', 'd2c20000-0000-4000-8000-000000000002', 'PED-260003', 'c2c20000-0000-4000-8000-000000000002', 'a2c20000-0000-4000-8000-000000000002', '{"address_line":"Test address B1"}', current_date - 2, 'confirmado', 'dispatched', 'a2c20000-0000-4000-8000-000000000113', 'e2c20000-0000-4000-8000-000000000002', 'e2c20000-0000-4000-8000-000000000002');

insert into public.order_items (
  id, organization_id, order_id, product_id, product_code, product_description,
  unit_of_measure, quantity, unit_price
) values
  ('a2c20000-0000-4000-8000-000000000101', 'd2c20000-0000-4000-8000-000000000001', 'a2c20000-0000-4000-8000-000000000011', 'b2c20000-0000-4000-8000-000000000001', 'OUT-IDEM-1', 'Outcome item A1', 'UND', 3, 10),
  ('a2c20000-0000-4000-8000-000000000102', 'd2c20000-0000-4000-8000-000000000001', 'a2c20000-0000-4000-8000-000000000011', 'b2c20000-0000-4000-8000-000000000002', 'OUT-IDEM-2', 'Outcome item A2', 'UND', 3, 10),
  ('a2c20000-0000-4000-8000-000000000103', 'd2c20000-0000-4000-8000-000000000001', 'a2c20000-0000-4000-8000-000000000012', 'b2c20000-0000-4000-8000-000000000001', 'OUT-IDEM-1', 'Outcome item A1', 'UND', 6, 10),
  ('a2c20000-0000-4000-8000-000000000104', 'd2c20000-0000-4000-8000-000000000002', 'a2c20000-0000-4000-8000-000000000013', 'b2c20000-0000-4000-8000-000000000003', 'OUT-IDEM-3', 'Outcome item B1', 'UND', 6, 10);

-- These rows represent already-dispatched shipments. Bypass only the
-- creation-time fulfillment guard while seeding the isolated SQL fixture.
alter table public.distribution_deliveries disable trigger distribution_deliveries_require_fulfilled_order;
insert into public.distribution_deliveries (
  id, organization_id, order_id, order_number, customer_name, issue_date, delivery_date,
  guide_number, transport_type, tracking_status, delivery_status, modalidad, transportista,
  conductor, vehiculo, placa, evidencia, incidencias, direction, numero_despacho, order_items,
  created_by, updated_by
) values
  ('f2c20000-0000-4000-8000-000000000001', 'd2c20000-0000-4000-8000-000000000001', 'a2c20000-0000-4000-8000-000000000011', 'PED-260001', 'Outcome test customer A', current_date - 2, current_date, 'OUT-IDEM-GUIDE-A1', 'interno', 'en_curso', 'programado', 'movilidad_propia', '', 'E2E Driver', 'E2E Vehicle', 'E2E-001', '', '[]'::jsonb, 'Test address A1', 'OUT-IDEM-DESPATCH-A1', jsonb_build_array(jsonb_build_object('id', 'a2c20000-0000-4000-8000-000000000101', 'cantidad', 3), jsonb_build_object('id', 'a2c20000-0000-4000-8000-000000000102', 'cantidad', 3)), 'e2c20000-0000-4000-8000-000000000001', 'e2c20000-0000-4000-8000-000000000001'),
  ('f2c20000-0000-4000-8000-000000000002', 'd2c20000-0000-4000-8000-000000000001', 'a2c20000-0000-4000-8000-000000000012', 'PED-260002', 'Outcome test customer A', current_date - 2, current_date, 'OUT-IDEM-GUIDE-A2', 'interno', 'en_curso', 'programado', 'movilidad_propia', '', 'E2E Driver', 'E2E Vehicle', 'E2E-002', '', '[]'::jsonb, 'Test address A2', 'OUT-IDEM-DESPATCH-A2', jsonb_build_array(jsonb_build_object('id', 'a2c20000-0000-4000-8000-000000000103', 'cantidad', 6)), 'e2c20000-0000-4000-8000-000000000001', 'e2c20000-0000-4000-8000-000000000001'),
  ('f2c20000-0000-4000-8000-000000000003', 'd2c20000-0000-4000-8000-000000000002', 'a2c20000-0000-4000-8000-000000000013', 'PED-260003', 'Outcome test customer B', current_date - 2, current_date, 'OUT-IDEM-GUIDE-B1', 'interno', 'en_curso', 'programado', 'movilidad_propia', '', 'E2E Driver', 'E2E Vehicle', 'E2E-003', '', '[]'::jsonb, 'Test address B1', 'OUT-IDEM-DESPATCH-B1', jsonb_build_array(jsonb_build_object('id', 'a2c20000-0000-4000-8000-000000000104', 'cantidad', 6)), 'e2c20000-0000-4000-8000-000000000002', 'e2c20000-0000-4000-8000-000000000002');
alter table public.distribution_deliveries enable trigger distribution_deliveries_require_fulfilled_order;

update public.distribution_deliveries set delivery_status = 'preparando' where id in (
  'f2c20000-0000-4000-8000-000000000001', 'f2c20000-0000-4000-8000-000000000002', 'f2c20000-0000-4000-8000-000000000003'
);
update public.distribution_deliveries set delivery_status = 'en_curso' where id in (
  'f2c20000-0000-4000-8000-000000000001', 'f2c20000-0000-4000-8000-000000000002', 'f2c20000-0000-4000-8000-000000000003'
);
update public.distribution_deliveries
set delivery_status = 'en_destino', tracking_status = 'en_destino'
where id in (
  'f2c20000-0000-4000-8000-000000000001', 'f2c20000-0000-4000-8000-000000000002', 'f2c20000-0000-4000-8000-000000000003'
);

insert into public.distribution_delivery_items (
  organization_id, delivery_id, order_id, order_line_id, quantity
) values
  ('d2c20000-0000-4000-8000-000000000001', 'f2c20000-0000-4000-8000-000000000001', 'a2c20000-0000-4000-8000-000000000011', 'a2c20000-0000-4000-8000-000000000101', 3),
  ('d2c20000-0000-4000-8000-000000000001', 'f2c20000-0000-4000-8000-000000000001', 'a2c20000-0000-4000-8000-000000000011', 'a2c20000-0000-4000-8000-000000000102', 3),
  ('d2c20000-0000-4000-8000-000000000001', 'f2c20000-0000-4000-8000-000000000002', 'a2c20000-0000-4000-8000-000000000012', 'a2c20000-0000-4000-8000-000000000103', 6),
  ('d2c20000-0000-4000-8000-000000000002', 'f2c20000-0000-4000-8000-000000000003', 'a2c20000-0000-4000-8000-000000000013', 'a2c20000-0000-4000-8000-000000000104', 6);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2c20000-0000-4000-8000-000000000001', true);

select lives_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd2c20000-0000-4000-8000-000000000001',
    'entregaId', 'f2c20000-0000-4000-8000-000000000001',
    'expectedLockVersion', 1,
    'operationKey', 'd2c2a000-0000-4000-8000-000000000001',
    'resultado', 'entrega_parcial', 'fecha', current_date,
    'evidencia', '  constancia exacta  ',
    'lineas', jsonb_build_array(
      jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000102', 'cantidad', 1),
      jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000101', 'cantidad', 1)
    )
  ))
$$, 'the initial partial outcome is persisted');

select is((select lock_version from public.distribution_deliveries where id = 'f2c20000-0000-4000-8000-000000000001'), 2::bigint, 'a new outcome increments the delivery version once');
select is((select fulfillment_status from public.orders where id = 'a2c20000-0000-4000-8000-000000000011'), 'partially_fulfilled', 'the existing order fulfillment trigger records partial fulfillment');
select is(public.record_distribution_delivery_outcome(jsonb_build_object(
  'organizationId', 'd2c20000-0000-4000-8000-000000000001',
  'entregaId', 'f2c20000-0000-4000-8000-000000000001',
  'expectedLockVersion', 1,
  'operationKey', 'd2c2a000-0000-4000-8000-000000000001',
  'resultado', ' entrega_parcial ', 'fecha', current_date,
  'evidencia', 'constancia exacta', 'incidencias', '[]'::jsonb,
  'lineas', jsonb_build_array(
    jsonb_build_object('orderLineId', upper('a2c20000-0000-4000-8000-000000000101'), 'cantidad', 1.000),
    jsonb_build_object('orderLineId', upper('a2c20000-0000-4000-8000-000000000102'), 'cantidad', 1.000)
  )
)), (select id from public.distribution_delivery_outcomes where organization_id = 'd2c20000-0000-4000-8000-000000000001' and operation_key = 'd2c2a000-0000-4000-8000-000000000001'), 'an identical normalized replay ignores line order and stale expected version');
select is((select count(*) from public.distribution_delivery_outcomes where organization_id = 'd2c20000-0000-4000-8000-000000000001'), 1::bigint, 'an identical replay creates no second outcome');
select is((select count(*) from public.distribution_delivery_outcome_lines where organization_id = 'd2c20000-0000-4000-8000-000000000001'), 2::bigint, 'an identical replay creates no duplicate outcome lines');
reset role;
select is((select count(*) from public.audit_events where action = 'DISTRIBUTION_OUTCOME_RECORDED' and entity_id = 'f2c20000-0000-4000-8000-000000000001'), 1::bigint, 'an identical replay creates no second audit event');
set local role authenticated;
select is((select lock_version from public.distribution_deliveries where id = 'f2c20000-0000-4000-8000-000000000001'), 2::bigint, 'an identical replay does not increment the delivery version');

select throws_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd2c20000-0000-4000-8000-000000000001', 'entregaId', 'f2c20000-0000-4000-8000-000000000001',
    'expectedLockVersion', 2, 'operationKey', 'd2c2a000-0000-4000-8000-000000000001',
    'resultado', 'entrega_parcial', 'fecha', current_date, 'evidencia', 'constancia exacta',
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000101', 'cantidad', 2), jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000102', 'cantidad', 1))
  ))
$$, 'P0001', 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED', 'rejects the same key with a different quantity');
select throws_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd2c20000-0000-4000-8000-000000000001', 'entregaId', 'f2c20000-0000-4000-8000-000000000001',
    'expectedLockVersion', 2, 'operationKey', 'd2c2a000-0000-4000-8000-000000000001',
    'resultado', 'entrega_parcial', 'fecha', current_date, 'evidencia', 'otra constancia',
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000101', 'cantidad', 1), jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000102', 'cantidad', 1))
  ))
$$, 'P0001', 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED', 'rejects the same key with different evidence');
select throws_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd2c20000-0000-4000-8000-000000000001', 'entregaId', 'f2c20000-0000-4000-8000-000000000001',
    'expectedLockVersion', 2, 'operationKey', 'd2c2a000-0000-4000-8000-000000000001',
    'resultado', 'entrega_parcial', 'fecha', current_date - 1, 'evidencia', 'constancia exacta',
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000101', 'cantidad', 1), jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000102', 'cantidad', 1))
  ))
$$, 'P0001', 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED', 'rejects the same key with a different effective date');
select throws_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd2c20000-0000-4000-8000-000000000001', 'entregaId', 'f2c20000-0000-4000-8000-000000000001',
    'expectedLockVersion', 2, 'operationKey', 'd2c2a000-0000-4000-8000-000000000001',
    'resultado', 'entrega_parcial', 'fecha', current_date, 'evidencia', 'constancia exacta',
    'incidencias', jsonb_build_array('Incidencia diferente'),
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000101', 'cantidad', 1), jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000102', 'cantidad', 1))
  ))
$$, 'P0001', 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED', 'rejects the same key with different incidents');
select throws_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd2c20000-0000-4000-8000-000000000001', 'entregaId', 'f2c20000-0000-4000-8000-000000000001',
    'expectedLockVersion', 2, 'operationKey', 'd2c2a000-0000-4000-8000-000000000001',
    'resultado', 'entregado', 'fecha', current_date, 'evidencia', 'constancia exacta',
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000101', 'cantidad', 1), jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000102', 'cantidad', 1))
  ))
$$, 'P0001', 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED', 'rejects the same key with a different result status');
select throws_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd2c20000-0000-4000-8000-000000000001', 'entregaId', 'f2c20000-0000-4000-8000-000000000002',
    'expectedLockVersion', 1, 'operationKey', 'd2c2a000-0000-4000-8000-000000000001',
    'resultado', 'entrega_parcial', 'fecha', current_date, 'evidencia', 'constancia exacta',
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000103', 'cantidad', 1))
  ))
$$, 'P0001', 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED', 'rejects the same key for a different delivery');
select throws_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd2c20000-0000-4000-8000-000000000001', 'entregaId', 'f2c20000-0000-4000-8000-000000000001',
    'expectedLockVersion', 2, 'operationKey', 'd2c2a000-0000-4000-8000-000000000001',
    'resultado', 'fallido', 'fecha', current_date, 'evidencia', 'constancia exacta',
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000101', 'cantidad', 1), jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000102', 'cantidad', 1))
  ))
$$, '22023', 'DISTRIBUTION_OUTCOME_INVALID', 'does not allow an invalid state to reuse a prior result');

reset role;
select is((select count(*) from public.distribution_delivery_outcomes where organization_id = 'd2c20000-0000-4000-8000-000000000001'), 1::bigint, 'rejected payload changes create no outcomes');
select is((select count(*) from public.distribution_delivery_outcome_lines where organization_id = 'd2c20000-0000-4000-8000-000000000001'), 2::bigint, 'rejected payload changes create no lines');
select is((select count(*) from public.audit_events where action = 'DISTRIBUTION_OUTCOME_RECORDED' and entity_id = 'f2c20000-0000-4000-8000-000000000001'), 1::bigint, 'rejected payload changes create no audit events');
select is((select lock_version from public.distribution_deliveries where id = 'f2c20000-0000-4000-8000-000000000001'), 2::bigint, 'rejected payload changes do not advance the version');

set local role authenticated;
select lives_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd2c20000-0000-4000-8000-000000000001', 'entregaId', 'f2c20000-0000-4000-8000-000000000002',
    'expectedLockVersion', 1, 'operationKey', 'd2c2a000-0000-4000-8000-000000000002',
    'resultado', 'rechazado', 'fecha', current_date, 'categoriaIncidencia', 'cliente_ausente',
    'incidencias', jsonb_build_array('Cliente ausente'), 'lineas', '[]'::jsonb
  ))
$$, 'a classified rejection is persisted');
select throws_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd2c20000-0000-4000-8000-000000000001', 'entregaId', 'f2c20000-0000-4000-8000-000000000002',
    'expectedLockVersion', 2, 'operationKey', 'd2c2a000-0000-4000-8000-000000000002',
    'resultado', 'rechazado', 'fecha', current_date, 'categoriaIncidencia', 'otro',
    'incidencias', jsonb_build_array('Cliente ausente'), 'lineas', '[]'::jsonb
  ))
$$, 'P0001', 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED', 'rejects a reused key with a different failure category');
reset role;
select is((select count(*) from public.distribution_delivery_outcomes where organization_id = 'd2c20000-0000-4000-8000-000000000001' and delivery_id = 'f2c20000-0000-4000-8000-000000000002'), 1::bigint, 'the category conflict creates no additional outcome');
select is((select lock_version from public.distribution_deliveries where id = 'f2c20000-0000-4000-8000-000000000002'), 2::bigint, 'the category conflict does not advance its delivery version');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2c20000-0000-4000-8000-000000000002', true);
select public.record_distribution_delivery_outcome(jsonb_build_object(
  'organizationId', 'd2c20000-0000-4000-8000-000000000002', 'entregaId', 'f2c20000-0000-4000-8000-000000000003',
  'expectedLockVersion', 1, 'operationKey', 'd2c2a000-0000-4000-8000-000000000001',
  'resultado', 'entregado', 'fecha', current_date, 'evidencia', 'Tenant B received all',
  'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000104', 'cantidad', 6))
)) as tenant_b_outcome_id \gset
reset role;
select is(:'tenant_b_outcome_id'::uuid, (select id from public.distribution_delivery_outcomes where organization_id = 'd2c20000-0000-4000-8000-000000000002' and operation_key = 'd2c2a000-0000-4000-8000-000000000001'), 'the same UUID key is independent in another authorized organization');
select is((select count(*) from public.distribution_delivery_outcomes where organization_id = 'd2c20000-0000-4000-8000-000000000001' and operation_key = 'd2c2a000-0000-4000-8000-000000000001'), 1::bigint, 'the second organization does not change the first organization result');

create schema outcome_idempotency_test;
create function outcome_idempotency_test.raise_unrelated_unique_violation()
returns trigger
language plpgsql
as $$
begin
  if new.operation_key = 'd2c2a000-0000-4000-8000-000000000003'::uuid then
    raise unique_violation using
      message = 'OUTCOME_TEST_UNRELATED_UNIQUE',
      constraint = 'outcome_idempotency_test_unrelated_unique';
  end if;
  return new;
end;
$$;
create trigger outcome_idempotency_test_unrelated_unique
before insert on public.distribution_delivery_outcomes
for each row execute function outcome_idempotency_test.raise_unrelated_unique_violation();
select set_config('request.jwt.claim.sub', 'e2c20000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok($$
  select public.record_distribution_delivery_outcome(jsonb_build_object(
    'organizationId', 'd2c20000-0000-4000-8000-000000000001', 'entregaId', 'f2c20000-0000-4000-8000-000000000001',
    'expectedLockVersion', 2, 'operationKey', 'd2c2a000-0000-4000-8000-000000000003',
    'resultado', 'entrega_parcial', 'fecha', current_date, 'evidencia', 'constancia de prueba',
    'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000102', 'cantidad', 1))
  ))
$$, '23505', 'OUTCOME_TEST_UNRELATED_UNIQUE', 'does not convert an unrelated unique violation into a replay');
reset role;
drop trigger outcome_idempotency_test_unrelated_unique on public.distribution_delivery_outcomes;
drop function outcome_idempotency_test.raise_unrelated_unique_violation();
drop schema outcome_idempotency_test;
select is((select count(*) from public.distribution_delivery_outcomes where organization_id = 'd2c20000-0000-4000-8000-000000000001'), 2::bigint, 'an unrelated uniqueness failure leaves outcome counts unchanged');
select is((select count(*) from public.audit_events where action = 'DISTRIBUTION_OUTCOME_RECORDED' and entity_id = 'f2c20000-0000-4000-8000-000000000001'), 1::bigint, 'an unrelated uniqueness failure leaves audit unchanged');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2c20000-0000-4000-8000-000000000001', true);
select is(public.record_distribution_delivery_outcome(jsonb_build_object(
  'organizationId', 'd2c20000-0000-4000-8000-000000000001', 'entregaId', 'f2c20000-0000-4000-8000-000000000001',
  'expectedLockVersion', 1, 'operationKey', 'd2c2a000-0000-4000-8000-000000000001',
  'resultado', 'entrega_parcial', 'fecha', current_date, 'evidencia', 'constancia exacta',
  'incidencias', '[]'::jsonb,
  'lineas', jsonb_build_array(jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000102', 'cantidad', 1), jsonb_build_object('orderLineId', 'a2c20000-0000-4000-8000-000000000101', 'cantidad', 1))
)), (select id from public.distribution_delivery_outcomes where organization_id = 'd2c20000-0000-4000-8000-000000000001' and operation_key = 'd2c2a000-0000-4000-8000-000000000001'), 'an identical retry succeeds after the delivery version advances');
reset role;
select is((select count(*) from public.distribution_delivery_outcomes where organization_id = 'd2c20000-0000-4000-8000-000000000001'), 2::bigint, 'stale-version replay creates no extra outcome');
select is((select count(*) from public.distribution_delivery_outcome_lines where organization_id = 'd2c20000-0000-4000-8000-000000000001'), 2::bigint, 'stale-version replay creates no extra lines');
select is((select count(*) from public.audit_events where action = 'DISTRIBUTION_OUTCOME_RECORDED' and entity_id = 'f2c20000-0000-4000-8000-000000000001'), 1::bigint, 'stale-version replay creates no extra audit event');
select is((select lock_version from public.distribution_deliveries where id = 'f2c20000-0000-4000-8000-000000000001'), 2::bigint, 'stale-version replay leaves the incremented version unchanged');

select * from finish();
rollback;
