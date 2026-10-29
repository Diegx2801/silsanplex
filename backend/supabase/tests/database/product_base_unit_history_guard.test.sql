begin;

select plan(39);

insert into public.organizations (id, name, slug) values
  ('ba110000-0000-4000-8000-000000000001', 'Base unit guard', 'base-unit-guard'),
  ('ba110000-0000-4000-8000-000000000002', 'Other base unit guard', 'other-base-unit-guard');

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('ba120000-0000-4000-8000-000000000001', 'base-unit-admin@test.local', '{"full_name":"Base unit admin"}', now(), now()),
  ('ba120000-0000-4000-8000-000000000002', 'base-unit-sales@test.local', '{"full_name":"Base unit sales"}', now(), now());
insert into public.organization_memberships (organization_id, user_id) values
  ('ba110000-0000-4000-8000-000000000001', 'ba120000-0000-4000-8000-000000000001'),
  ('ba110000-0000-4000-8000-000000000001', 'ba120000-0000-4000-8000-000000000002');
insert into public.user_roles (organization_id, user_id, role_code) values
  ('ba110000-0000-4000-8000-000000000001', 'ba120000-0000-4000-8000-000000000001', 'ADMIN'),
  ('ba110000-0000-4000-8000-000000000001', 'ba120000-0000-4000-8000-000000000002', 'VENTAS');

insert into public.products (
  id, organization_id, code, description, unit_of_measure, batch_control, expiration_control
) values
  ('ba130000-0000-4000-8000-000000000001', 'ba110000-0000-4000-8000-000000000001', 'FREE', 'No dependencies', 'UND', false, false),
  ('ba130000-0000-4000-8000-000000000002', 'ba110000-0000-4000-8000-000000000001', 'HISTORY', 'Historical balance zero', 'UND', false, false),
  ('ba130000-0000-4000-8000-000000000003', 'ba110000-0000-4000-8000-000000000001', 'RESERVED', 'Active reservation', 'UND', false, false),
  ('ba130000-0000-4000-8000-000000000004', 'ba110000-0000-4000-8000-000000000001', 'RELEASED', 'Released reservation', 'UND', false, false),
  ('ba130000-0000-4000-8000-000000000005', 'ba110000-0000-4000-8000-000000000001', 'UNIT-FIRST', 'Unit changed before receipt', 'UND', false, false),
  ('ba130000-0000-4000-8000-000000000006', 'ba110000-0000-4000-8000-000000000002', 'OTHER', 'Other organization', 'UND', false, false);

insert into public.warehouses (id, organization_id, code, name) values
  ('ba140000-0000-4000-8000-000000000001', 'ba110000-0000-4000-8000-000000000001', 'CENTRAL', 'Central warehouse');
insert into public.warehouse_locations (id, organization_id, warehouse_id, code, name) values
  ('ba150000-0000-4000-8000-000000000001', 'ba110000-0000-4000-8000-000000000001', 'ba140000-0000-4000-8000-000000000001', 'A-01', 'Shelf');

create function pg_temp.record_unit_fixture(product_id uuid, movement_type text, unit_name text)
returns void
language sql
as $$
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description,
    unit_of_measure, movement_type, quantity, warehouse, warehouse_id,
    location_id, stock_status, unit_cost, operation_date, reason, source_type
  ) values (
    'ba110000-0000-4000-8000-000000000001', product_id,
    'UNIT-FIXTURE', 'Unit fixture', unit_name, movement_type, 2,
    'Central warehouse', 'ba140000-0000-4000-8000-000000000001',
    'ba150000-0000-4000-8000-000000000001', 'available', 10,
    current_date, 'Unit fixture', 'manual'
  );
$$;

select lives_ok($$select pg_temp.record_unit_fixture('ba130000-0000-4000-8000-000000000002', 'entrada', 'UND')$$,
  'recognized legacy UND alias can enter stock');
select lives_ok($$select pg_temp.record_unit_fixture('ba130000-0000-4000-8000-000000000002', 'salida', 'Unidad')$$,
  'canonical unit name can consume the same stock');
select is((select sum(physical_quantity) from public.inventory_bucket_balances where product_id = 'ba130000-0000-4000-8000-000000000002'),
  0::numeric, 'history fixture has no remaining stock');

-- Simulate legacy commitments independently of ledger history. New ordinary
-- reservations require stock; the history guard must also cover legacy data.
alter table public.inventory_reservations disable trigger inventory_reservations_enforce_fefo;
insert into public.inventory_reservations (
  organization_id, product_id, warehouse_id, location_id, stock_status,
  quantity, source_type, source_id, status
) values
  ('ba110000-0000-4000-8000-000000000001', 'ba130000-0000-4000-8000-000000000003', 'ba140000-0000-4000-8000-000000000001', 'ba150000-0000-4000-8000-000000000001', 'available', 1, 'unit-guard-test', 'ba160000-0000-4000-8000-000000000001', 'active'),
  ('ba110000-0000-4000-8000-000000000001', 'ba130000-0000-4000-8000-000000000004', 'ba140000-0000-4000-8000-000000000001', 'ba150000-0000-4000-8000-000000000001', 'available', 1, 'unit-guard-test', 'ba160000-0000-4000-8000-000000000002', 'released');
alter table public.inventory_reservations enable trigger inventory_reservations_enforce_fefo;

select lives_ok($$
  update public.products set base_unit_id = (
    select id from public.measurement_units where organization_id = 'ba110000-0000-4000-8000-000000000001' and code = 'BOX'
  ) where id = 'ba130000-0000-4000-8000-000000000001'
$$, 'unused product can change its base unit by ID');
select is((select unit_of_measure from public.products where id = 'ba130000-0000-4000-8000-000000000001'),
  'Caja', 'base ID change keeps the displayed unit synchronized');
select lives_ok($$update public.products set unit_of_measure = 'UND' where id = 'ba130000-0000-4000-8000-000000000001'$$,
  'unused product can also change the base through its legacy text field');
select is((select unit_of_measure from public.products where id = 'ba130000-0000-4000-8000-000000000001'),
  'Unidad', 'textual change is normalized');

select throws_ok($$
  update public.products set base_unit_id = (
    select id from public.measurement_units where organization_id = 'ba110000-0000-4000-8000-000000000001' and code = 'BOX'
  ) where id = 'ba130000-0000-4000-8000-000000000002'
$$, 'P0001', 'PRODUCT_BASE_UNIT_CHANGE_INVENTORY_CONFLICT', 'zero-balance historical product cannot change base ID');
select throws_ok($$update public.products set unit_of_measure = 'Caja' where id = 'ba130000-0000-4000-8000-000000000002'$$,
  'P0001', 'PRODUCT_BASE_UNIT_CHANGE_INVENTORY_CONFLICT', 'legacy text field cannot bypass the history guard');
select lives_ok($$update public.products set base_unit_id = base_unit_id where id = 'ba130000-0000-4000-8000-000000000002'$$,
  'saving the same base ID remains allowed');
select lives_ok($$update public.products set unit_of_measure = 'UND' where id = 'ba130000-0000-4000-8000-000000000002'$$,
  'same-unit alias does not constitute a base-unit change');
select lives_ok($$update public.products set description = 'Normal description edit' where id = 'ba130000-0000-4000-8000-000000000002'$$,
  'normal description edits remain allowed after movements');
select is((select count(*) from public.inventory_movements where product_id = 'ba130000-0000-4000-8000-000000000002'),
  2::bigint, 'rejected base change leaves the ledger intact');
select throws_ok($$update public.products set unit_of_measure = 'Caja' where id = 'ba130000-0000-4000-8000-000000000003'$$,
  'P0001', 'PRODUCT_BASE_UNIT_CHANGE_INVENTORY_CONFLICT', 'active unconsumed reservation independently prevents base change');
select lives_ok($$update public.products set unit_of_measure = 'Caja' where id = 'ba130000-0000-4000-8000-000000000004'$$,
  'released reservation without inventory history does not prevent base change');

select lives_ok($$update public.products set unit_of_measure = 'Caja' where id = 'ba130000-0000-4000-8000-000000000005'$$,
  'base can change before the first receipt');
select throws_ok($$select pg_temp.record_unit_fixture('ba130000-0000-4000-8000-000000000005', 'entrada', 'UND')$$,
  'P0001', 'INVENTORY_BASE_UNIT_MISMATCH', 'receipt using the obsolete unit is rejected without converting quantities');
select lives_ok($$select pg_temp.record_unit_fixture('ba130000-0000-4000-8000-000000000005', 'entrada', 'CJA')$$,
  'current base alias is accepted after a base-unit change');
select is((select sum(physical_quantity) from public.inventory_bucket_balances where product_id = 'ba130000-0000-4000-8000-000000000005'),
  2::numeric, 'current-unit receipt is not converted automatically');
select lives_ok($$select pg_temp.record_unit_fixture('ba130000-0000-4000-8000-000000000005', 'entrada', null)$$,
  'legacy receipt with no unit snapshot captures the current base');
select is((select count(*) from public.inventory_movements where product_id = 'ba130000-0000-4000-8000-000000000005' and unit_of_measure = 'Caja'),
  1::bigint, 'missing snapshot is filled without converting the quantity');
select lives_ok($$select pg_temp.record_unit_fixture('ba130000-0000-4000-8000-000000000002', 'entrada', 'UNIT')$$,
  'literal canonical UNIT code is accepted');
select lives_ok($$select pg_temp.record_unit_fixture('ba130000-0000-4000-8000-000000000005', 'entrada', 'BOX')$$,
  'literal canonical BOX code is accepted');
insert into public.measurement_units (organization_id, code, name)
values ('ba110000-0000-4000-8000-000000000001', 'CUSTOM_TRAY', 'Custom tray');
select lives_ok($$update public.products set unit_of_measure = 'Custom tray' where id = 'ba130000-0000-4000-8000-000000000001'$$,
  'unused product can choose a custom base unit');
select lives_ok($$select pg_temp.record_unit_fixture('ba130000-0000-4000-8000-000000000001', 'entrada', 'CUSTOM_TRAY')$$,
  'custom unit code is matched against its tenant unit identity');
select throws_ok($$select pg_temp.record_unit_fixture('ba130000-0000-4000-8000-000000000001', 'entrada', 'BOX')$$,
  'P0001', 'INVENTORY_BASE_UNIT_MISMATCH', 'another valid canonical code is still rejected for a custom base');

select is(has_function_privilege('authenticated', 'inventory_internal.product_has_base_unit_dependencies(uuid,uuid)', 'EXECUTE'),
  false, 'dependency helper is private');
select is(has_function_privilege('anon', 'public.product_base_unit_editable(uuid,uuid)', 'EXECUTE'),
  false, 'anonymous clients cannot query editability');
select is(has_function_privilege('authenticated', 'public.product_base_unit_editable(uuid,uuid)', 'EXECUTE'),
  true, 'authenticated clients can call the protected RPC');
select ok(pg_get_functiondef('inventory_internal.product_has_base_unit_dependencies(uuid,uuid)'::regprocedure) ~* $$SET search_path (TO|=) ''$$,
  'dependency helper has empty search_path');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ba120000-0000-4000-8000-000000000001', true);
select is(public.product_base_unit_editable('ba110000-0000-4000-8000-000000000001', 'ba130000-0000-4000-8000-000000000004'),
  true, 'manager sees unused base unit as editable');
select is(public.product_base_unit_editable('ba110000-0000-4000-8000-000000000001', 'ba130000-0000-4000-8000-000000000002'),
  false, 'manager sees zero-balance historical base unit as locked');
select is(public.product_base_unit_editable('ba110000-0000-4000-8000-000000000001', 'ba130000-0000-4000-8000-000000000003'),
  false, 'manager sees active-reservation base unit as locked');
select throws_ok($$
  select public.save_product_catalog(
    'ba110000-0000-4000-8000-000000000001', 'ba130000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'code', 'HISTORY', 'description', 'Historical product RPC edit',
      'base_unit_id', (select id from public.measurement_units where organization_id = 'ba110000-0000-4000-8000-000000000001' and code = 'BOX'),
      'alternate_units', jsonb_build_array()
    )
  )
$$, 'P0001', 'PRODUCT_BASE_UNIT_CHANGE_INVENTORY_CONFLICT', 'authenticated catalog RPC cannot bypass the authoritative guard');
select throws_ok($$select public.product_base_unit_editable('ba110000-0000-4000-8000-000000000001', 'ba130000-0000-4000-8000-000000000006')$$,
  'P0002', 'PRODUCT_NOT_FOUND', 'product from another organization is not exposed');
select throws_ok($$select public.product_base_unit_editable('ba110000-0000-4000-8000-000000000002', 'ba130000-0000-4000-8000-000000000006')$$,
  '42501', 'PRODUCT_PERMISSION_REQUIRED', 'manager cannot query an organization without permission');
select throws_ok($$select public.product_base_unit_editable('ba110000-0000-4000-8000-000000000001', 'ba130000-0000-4000-8000-999999999999')$$,
  'P0002', 'PRODUCT_NOT_FOUND', 'missing product has an explicit error');
select set_config('request.jwt.claim.sub', 'ba120000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.product_base_unit_editable('ba110000-0000-4000-8000-000000000001', 'ba130000-0000-4000-8000-000000000001')$$,
  '42501', 'PRODUCT_PERMISSION_REQUIRED', 'PRODUCTS_VIEW without PRODUCTS_MANAGE cannot query editability');
reset role;

select has_trigger('public', 'products', 'zzz_products_guard_base_unit_history', 'backend guard protects every base-unit UPDATE after synchronization');
select * from finish();
rollback;
