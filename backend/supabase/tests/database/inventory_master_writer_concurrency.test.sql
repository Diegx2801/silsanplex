create temporary table d1b1_extension_state (was_installed boolean not null);
insert into d1b1_extension_state
select exists (select 1 from pg_catalog.pg_extension where extname = 'dblink');
create extension if not exists dblink with schema extensions;

select plan(54);

begin;
drop schema if exists d1b1_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'd1100000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.warehouse_master_operations disable trigger warehouse_master_operations_immutable;
delete from public.warehouse_master_operations where organization_id = 'd1100000-0000-4000-8000-000000000001';
alter table public.warehouse_master_operations enable trigger warehouse_master_operations_immutable;
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements where organization_id = 'd1100000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.inventory_reservations where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.product_warehouse_settings where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.warehouse_transfer_items where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.warehouse_transfers where organization_id = 'd1100000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'd1100000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.warehouse_locations where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.products where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.profiles where id = 'd1200000-0000-4000-8000-000000000001';
delete from auth.users where id = 'd1200000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'd1100000-0000-4000-8000-000000000001';
commit;

begin;
insert into public.organizations (id, name, slug)
values ('d1100000-0000-4000-8000-000000000001', 'D1B1 concurrencia', 'd1b1-concurrencia');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('d1200000-0000-4000-8000-000000000001', 'd1b1@test.local', '{"full_name":"D1B1"}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('d1100000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('d1100000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001', 'ALMACEN');
insert into public.products (
  id, organization_id, code, description, unit_of_measure, batch_control, expiration_control
) values (
  'd1300000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001',
  'D1B1-01', 'Producto D1B1', 'UND', false, false
);
insert into public.warehouses (id, organization_id, code, name, created_by, updated_by) values
  ('d1400000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001', 'D1-A', 'D1 writer primero', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1400000-0000-4000-8000-000000000002', 'd1100000-0000-4000-8000-000000000001', 'D1-B', 'D1 master primero', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1400000-0000-4000-8000-000000000003', 'd1100000-0000-4000-8000-000000000001', 'D1-C', 'D1 transferencia A', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1400000-0000-4000-8000-000000000004', 'd1100000-0000-4000-8000-000000000001', 'D1-D', 'D1 transferencia B', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1400000-0000-4000-8000-000000000005', 'd1100000-0000-4000-8000-000000000001', 'D1-E', 'D1 ubicacion', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1400000-0000-4000-8000-000000000006', 'd1100000-0000-4000-8000-000000000001', 'D1-F', 'D1 reserva', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1400000-0000-4000-8000-000000000007', 'd1100000-0000-4000-8000-000000000001', 'D1-G', 'D1 settings', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001');
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values
  ('d1500000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-000000000001', 'GENERAL', 'General', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1500000-0000-4000-8000-000000000002', 'd1100000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-000000000002', 'GENERAL', 'General', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1500000-0000-4000-8000-000000000003', 'd1100000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-000000000003', 'GENERAL', 'General', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1500000-0000-4000-8000-000000000004', 'd1100000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-000000000004', 'GENERAL', 'General', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1500000-0000-4000-8000-000000000005', 'd1100000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-000000000005', 'L-01', 'Objetivo', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1500000-0000-4000-8000-000000000006', 'd1100000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-000000000005', 'L-02', 'Alterna', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1500000-0000-4000-8000-000000000007', 'd1100000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-000000000006', 'GENERAL', 'General', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1500000-0000-4000-8000-000000000008', 'd1100000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-000000000007', 'S-01', 'Default', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001'),
  ('d1500000-0000-4000-8000-000000000009', 'd1100000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-000000000007', 'S-02', 'Alterna', 'd1200000-0000-4000-8000-000000000001', 'd1200000-0000-4000-8000-000000000001');

create schema d1b1_concurrency_test;

create function d1b1_concurrency_test.set_actor()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', 'd1200000-0000-4000-8000-000000000001', true);
  perform pg_catalog.set_config('request.jwt.claims', '{"sub":"d1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
end;
$$;

create function d1b1_concurrency_test.insert_stock(requested_warehouse uuid, requested_location uuid, gate bigint default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory_movements (
    organization_id, product_id, product_code, product_description, unit_of_measure,
    movement_type, quantity, warehouse, warehouse_id, location_id, stock_status,
    unit_cost, operation_date, reason, source_type, created_by
  ) values (
    'd1100000-0000-4000-8000-000000000001', 'd1300000-0000-4000-8000-000000000001',
    'D1B1-01', 'Producto D1B1', 'UND', 'entrada', 1, 'D1B1', requested_warehouse,
    requested_location, 'available', 10, current_date, 'Carrera D1B1', 'manual',
    'd1200000-0000-4000-8000-000000000001'
  );
  if gate is not null then perform pg_catalog.pg_advisory_xact_lock(gate); end if;
  return 'ok';
exception when others then return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function d1b1_concurrency_test.deactivate_warehouse(requested_warehouse uuid, requested_operation uuid, gate bigint default null)
returns text language plpgsql security definer set search_path = '' as $$
declare expected_version bigint;
begin
  perform d1b1_concurrency_test.set_actor();
  select lock_version into expected_version from public.warehouses where id = requested_warehouse;
  perform public.set_warehouse_status(jsonb_build_object(
    'id', requested_warehouse, 'organization_id', 'd1100000-0000-4000-8000-000000000001',
    'operation_key', requested_operation, 'expected_lock_version', expected_version, 'is_active', false
  ));
  if gate is not null then perform pg_catalog.pg_advisory_xact_lock(gate); end if;
  return 'ok';
exception when others then return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function d1b1_concurrency_test.deactivate_location(requested_location uuid, requested_operation uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare expected_version bigint;
begin
  perform d1b1_concurrency_test.set_actor();
  select lock_version into expected_version from public.warehouse_locations where id = requested_location;
  perform public.set_warehouse_location_status(jsonb_build_object(
    'id', requested_location, 'organization_id', 'd1100000-0000-4000-8000-000000000001',
    'operation_key', requested_operation, 'expected_lock_version', expected_version, 'is_active', false
  ));
  return 'ok';
exception when others then return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function d1b1_concurrency_test.insert_transfer(requested_source uuid, requested_destination uuid, gate bigint default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  insert into public.warehouse_transfers (
    organization_id, reference, source_warehouse_id, destination_warehouse_id, created_by
  ) values (
    'd1100000-0000-4000-8000-000000000001', gen_random_uuid()::text,
    requested_source, requested_destination, 'd1200000-0000-4000-8000-000000000001'
  );
  if gate is not null then perform pg_catalog.pg_advisory_xact_lock(gate); end if;
  return 'ok';
exception when others then return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function d1b1_concurrency_test.insert_reservation(gate bigint)
returns text language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory_reservations (
    organization_id, product_id, warehouse_id, location_id, stock_status,
    quantity, source_type, source_id
  ) values (
    'd1100000-0000-4000-8000-000000000001', 'd1300000-0000-4000-8000-000000000001',
    'd1400000-0000-4000-8000-000000000006', 'd1500000-0000-4000-8000-000000000007',
    'available', 1, 'd1b1-test', gen_random_uuid()
  );
  perform pg_catalog.pg_advisory_xact_lock(gate);
  return 'ok';
exception when others then return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function d1b1_concurrency_test.legacy_stock_on_inactive_warehouse()
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform d1b1_concurrency_test.set_actor();
  perform public.record_inventory_movement(jsonb_build_object(
    'organization_id', 'd1100000-0000-4000-8000-000000000001',
    'product_id', 'd1300000-0000-4000-8000-000000000001',
    'warehouse', 'D1 master primero',
    'movement_type', 'entrada', 'quantity', 1, 'unit_cost', 10,
    'stock_status', 'available', 'operation_date', current_date,
    'document_reference', 'D1B1-FALLBACK-TEST',
    'reason', 'Fallback legacy D1B1'
  ));
  return 'ok';
exception when others then return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;

create function d1b1_concurrency_test.insert_default_setting(gate bigint)
returns text language plpgsql security definer set search_path = '' as $$
begin
  insert into public.product_warehouse_settings (
    organization_id, product_id, warehouse_id, default_location_id,
    minimum_stock, expiration_alert_days, updated_by
  ) values (
    'd1100000-0000-4000-8000-000000000001', 'd1300000-0000-4000-8000-000000000001',
    'd1400000-0000-4000-8000-000000000007', 'd1500000-0000-4000-8000-000000000008',
    0, 30, 'd1200000-0000-4000-8000-000000000001'
  );
  perform pg_catalog.pg_advisory_xact_lock(gate);
  return 'ok';
exception when others then return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;
commit;

select has_function('inventory_internal', 'lock_inventory_master_scope', array['uuid','uuid','uuid'], 'existe helper interno de master lock');
select is(has_function_privilege('authenticated', 'inventory_internal.lock_inventory_master_scope(uuid,uuid,uuid)', 'EXECUTE'), false, 'authenticated no ejecuta el helper interno');
select ok(pg_get_functiondef('public.lock_inventory_fefo_scope(uuid,uuid,uuid)'::regprocedure) like '%lock_inventory_master_scope%', 'FEFO adquiere master antes de su scope');
select ok(
  pg_get_functiondef('public.record_inventory_movement(jsonb)'::regprocedure) like '%record_inventory_movement_d1b1_core%'
  and pg_get_functiondef('public.record_inventory_movement(jsonb)'::regprocedure) like '%lock_inventory_master_scope%',
  'la RPC publica de movimientos conserva el wrapper D1B1'
);

select extensions.dblink_connect('d1b1_writer', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('d1b1_lifecycle', 'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres');
create temporary table d1b1_workers (name text primary key, pid integer not null);
insert into d1b1_workers select 'writer', pid from extensions.dblink('d1b1_writer', 'select pg_backend_pid()') as t(pid integer);
insert into d1b1_workers select 'lifecycle', pid from extensions.dblink('d1b1_lifecycle', 'select pg_backend_pid()') as t(pid integer);
select isnt((select pid from d1b1_workers where name='writer'), (select pid from d1b1_workers where name='lifecycle'), 'las carreras usan sesiones independientes');

-- El writer obtiene el master primero; la desactivacion espera y luego rechaza el stock confirmado.
select pg_catalog.pg_advisory_lock(917000000000000001);
select is(extensions.dblink_send_query('d1b1_writer', $$select d1b1_concurrency_test.insert_stock('d1400000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001',917000000000000001)$$), 1, 'inicia writer antes de desactivar');
do $$begin for attempt in 1..100 loop exit when exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='writer') and locktype='advisory' and not granted); perform pg_sleep(0.02); end loop; end$$;
select ok(exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='writer') and locktype='advisory' and not granted), 'writer conserva master mientras espera');
select is(extensions.dblink_send_query('d1b1_lifecycle', $$select d1b1_concurrency_test.deactivate_warehouse('d1400000-0000-4000-8000-000000000001','d1600000-0000-4000-8000-000000000001')$$), 1, 'inicia desactivacion concurrente');
do $$begin for attempt in 1..100 loop exit when exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='lifecycle') and not granted); perform pg_sleep(0.02); end loop; end$$;
select ok(exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='lifecycle') and not granted), 'desactivacion espera el master del writer');
select ok(pg_advisory_unlock(917000000000000001), 'libera writer');
select is((select result from extensions.dblink_get_result('d1b1_writer') as t(result text)), 'ok', 'writer confirma primero');
select ok((select result from extensions.dblink_get_result('d1b1_lifecycle') as t(result text)) like 'error:P0001:WAREHOUSE_HAS_STOCK%', 'desactivacion revalida y rechaza stock');
select is((select is_active from public.warehouses where id='d1400000-0000-4000-8000-000000000001'), true, 'warehouse permanece activo');
select * from extensions.dblink_get_result('d1b1_writer') as t(result text);
select * from extensions.dblink_get_result('d1b1_lifecycle') as t(result text);

-- La desactivacion obtiene el master primero; el writer espera y revalida inactivo.
select pg_catalog.pg_advisory_lock(917000000000000002);
select is(extensions.dblink_send_query('d1b1_lifecycle', $$select d1b1_concurrency_test.deactivate_warehouse('d1400000-0000-4000-8000-000000000002','d1600000-0000-4000-8000-000000000002',917000000000000002)$$), 1, 'inicia desactivacion antes del writer');
do $$begin for attempt in 1..100 loop exit when exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='lifecycle') and locktype='advisory' and not granted); perform pg_sleep(0.02); end loop; end$$;
select ok(exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='lifecycle') and locktype='advisory' and not granted), 'desactivacion conserva master mientras espera');
select is(extensions.dblink_send_query('d1b1_writer', $$select d1b1_concurrency_test.insert_stock('d1400000-0000-4000-8000-000000000002','d1500000-0000-4000-8000-000000000002')$$), 1, 'inicia writer contra desactivacion');
do $$begin for attempt in 1..100 loop exit when exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='writer') and not granted); perform pg_sleep(0.02); end loop; end$$;
select ok(exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='writer') and not granted), 'writer espera master de desactivacion');
select ok(pg_advisory_unlock(917000000000000002), 'libera desactivacion');
select is((select result from extensions.dblink_get_result('d1b1_lifecycle') as t(result text)), 'ok', 'desactivacion confirma primero');
select ok((select result from extensions.dblink_get_result('d1b1_writer') as t(result text)) like 'error:P0001:INVENTORY_WAREHOUSE_UNAVAILABLE%', 'writer rechaza warehouse ya inactivo');
select is((select count(*) from public.inventory_movements where warehouse_id='d1400000-0000-4000-8000-000000000002'), 0::bigint, 'no queda stock en warehouse inactivo');
select ok(d1b1_concurrency_test.legacy_stock_on_inactive_warehouse() like 'error:P0001:INVENTORY_WAREHOUSE_UNAVAILABLE%', 'fallback legacy no reactiva warehouse inactivo');
select * from extensions.dblink_get_result('d1b1_lifecycle') as t(result text);
select * from extensions.dblink_get_result('d1b1_writer') as t(result text);

-- A->B y B->A toman ambos masters en orden canonico, sin ciclo.
select pg_catalog.pg_advisory_lock(917000000000000003);
select is(extensions.dblink_send_query('d1b1_writer', $$select d1b1_concurrency_test.insert_transfer('d1400000-0000-4000-8000-000000000003','d1400000-0000-4000-8000-000000000004',917000000000000003)$$), 1, 'inicia transferencia A a B');
do $$begin for attempt in 1..100 loop exit when exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='writer') and locktype='advisory' and not granted); perform pg_sleep(0.02); end loop; end$$;
select ok(exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='writer') and locktype='advisory' and not granted), 'A a B conserva ambos masters');
select is(extensions.dblink_send_query('d1b1_lifecycle', $$select d1b1_concurrency_test.insert_transfer('d1400000-0000-4000-8000-000000000004','d1400000-0000-4000-8000-000000000003')$$), 1, 'inicia transferencia B a A');
do $$begin for attempt in 1..100 loop exit when exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='lifecycle') and not granted); perform pg_sleep(0.02); end loop; end$$;
select ok(exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='lifecycle') and not granted), 'B a A espera sin invertir masters');
select ok(pg_advisory_unlock(917000000000000003), 'libera transferencia A a B');
select is((select result from extensions.dblink_get_result('d1b1_writer') as t(result text)), 'ok', 'A a B confirma');
select is((select result from extensions.dblink_get_result('d1b1_lifecycle') as t(result text)), 'ok', 'B a A confirma sin deadlock');
select is((select count(*) from public.warehouse_transfers where organization_id='d1100000-0000-4000-8000-000000000001'), 2::bigint, 'persisten ambas transferencias');
select * from extensions.dblink_get_result('d1b1_writer') as t(result text);
select * from extensions.dblink_get_result('d1b1_lifecycle') as t(result text);

-- Location usa el warehouse como mutex del subarbol.
select pg_catalog.pg_advisory_lock(917000000000000004);
select is(extensions.dblink_send_query('d1b1_writer', $$select d1b1_concurrency_test.insert_stock('d1400000-0000-4000-8000-000000000005','d1500000-0000-4000-8000-000000000005',917000000000000004)$$), 1, 'inicia writer de location');
do $$begin for attempt in 1..100 loop exit when exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='writer') and locktype='advisory' and not granted); perform pg_sleep(0.02); end loop; end$$;
select ok(exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='writer') and locktype='advisory' and not granted), 'writer de location conserva master');
select is(extensions.dblink_send_query('d1b1_lifecycle', $$select d1b1_concurrency_test.deactivate_location('d1500000-0000-4000-8000-000000000005','d1600000-0000-4000-8000-000000000003')$$), 1, 'inicia desactivacion de location');
do $$begin for attempt in 1..100 loop exit when exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='lifecycle') and not granted); perform pg_sleep(0.02); end loop; end$$;
select ok(exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='lifecycle') and not granted), 'desactivacion de location espera master');
select ok(pg_advisory_unlock(917000000000000004), 'libera writer de location');
select is((select result from extensions.dblink_get_result('d1b1_writer') as t(result text)), 'ok', 'writer de location confirma');
select ok((select result from extensions.dblink_get_result('d1b1_lifecycle') as t(result text)) like 'error:P0001:WAREHOUSE_LOCATION_HAS_STOCK%', 'location revalida y rechaza stock');
select is((select is_active from public.warehouse_locations where id='d1500000-0000-4000-8000-000000000005'), true, 'location permanece activa');
select * from extensions.dblink_get_result('d1b1_writer') as t(result text);
select * from extensions.dblink_get_result('d1b1_lifecycle') as t(result text);

-- Una reserva nueva participa en el mismo master lock.
select lives_ok($$insert into public.inventory_movements (organization_id,product_id,product_code,product_description,unit_of_measure,movement_type,quantity,warehouse,warehouse_id,location_id,stock_status,unit_cost,operation_date,reason,source_type) values ('d1100000-0000-4000-8000-000000000001','d1300000-0000-4000-8000-000000000001','D1B1-01','Producto D1B1','UND','entrada',2,'D1B1','d1400000-0000-4000-8000-000000000006','d1500000-0000-4000-8000-000000000007','available',10,current_date,'Stock reserva','manual')$$, 'prepara stock para reserva');
select pg_catalog.pg_advisory_lock(917000000000000005);
select is(extensions.dblink_send_query('d1b1_writer', $$select d1b1_concurrency_test.insert_reservation(917000000000000005)$$), 1, 'inicia reserva nueva');
do $$begin for attempt in 1..100 loop exit when exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='writer') and locktype='advisory' and not granted); perform pg_sleep(0.02); end loop; end$$;
select ok(exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='writer') and locktype='advisory' and not granted), 'reserva conserva master');
select is(extensions.dblink_send_query('d1b1_lifecycle', $$select d1b1_concurrency_test.deactivate_warehouse('d1400000-0000-4000-8000-000000000006','d1600000-0000-4000-8000-000000000004')$$), 1, 'inicia desactivacion contra reserva');
do $$begin for attempt in 1..100 loop exit when exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='lifecycle') and not granted); perform pg_sleep(0.02); end loop; end$$;
select ok(exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='lifecycle') and not granted), 'desactivacion espera reserva');
select ok(pg_advisory_unlock(917000000000000005), 'libera reserva');
select is((select result from extensions.dblink_get_result('d1b1_writer') as t(result text)), 'ok', 'reserva confirma');
select ok((select result from extensions.dblink_get_result('d1b1_lifecycle') as t(result text)) like 'error:P0001:WAREHOUSE_HAS_STOCK%', 'desactivacion observa dependencia confirmada');
select * from extensions.dblink_get_result('d1b1_writer') as t(result text);
select * from extensions.dblink_get_result('d1b1_lifecycle') as t(result text);

-- Un default nuevo tambien serializa contra la desactivacion de su location.
select pg_catalog.pg_advisory_lock(917000000000000006);
select is(extensions.dblink_send_query('d1b1_writer', $$select d1b1_concurrency_test.insert_default_setting(917000000000000006)$$), 1, 'inicia alta de default location');
do $$begin for attempt in 1..100 loop exit when exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='writer') and locktype='advisory' and not granted); perform pg_sleep(0.02); end loop; end$$;
select ok(exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='writer') and locktype='advisory' and not granted), 'setting conserva master');
select is(extensions.dblink_send_query('d1b1_lifecycle', $$select d1b1_concurrency_test.deactivate_location('d1500000-0000-4000-8000-000000000008','d1600000-0000-4000-8000-000000000005')$$), 1, 'inicia desactivacion contra default');
do $$begin for attempt in 1..100 loop exit when exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='lifecycle') and not granted); perform pg_sleep(0.02); end loop; end$$;
select ok(exists(select 1 from pg_locks where pid=(select pid from d1b1_workers where name='lifecycle') and not granted), 'desactivacion espera el setting');
select ok(pg_advisory_unlock(917000000000000006), 'libera setting');
select is((select result from extensions.dblink_get_result('d1b1_writer') as t(result text)), 'ok', 'setting confirma');
select ok((select result from extensions.dblink_get_result('d1b1_lifecycle') as t(result text)) like 'error:P0001:WAREHOUSE_LOCATION_IS_DEFAULT%', 'desactivacion observa default confirmado');
select is((select is_active from public.warehouse_locations where id='d1500000-0000-4000-8000-000000000008'), true, 'default location permanece activa');
select * from extensions.dblink_get_result('d1b1_writer') as t(result text);
select * from extensions.dblink_get_result('d1b1_lifecycle') as t(result text);

select extensions.dblink_disconnect('d1b1_writer');
select extensions.dblink_disconnect('d1b1_lifecycle');

begin;
drop schema d1b1_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'd1100000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.warehouse_master_operations disable trigger warehouse_master_operations_immutable;
delete from public.warehouse_master_operations where organization_id = 'd1100000-0000-4000-8000-000000000001';
alter table public.warehouse_master_operations enable trigger warehouse_master_operations_immutable;
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements where organization_id = 'd1100000-0000-4000-8000-000000000001';
alter table public.inventory_movements enable trigger inventory_movements_immutable;
delete from public.inventory_reservations where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.product_warehouse_settings where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.warehouse_transfer_items where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.warehouse_transfers where organization_id = 'd1100000-0000-4000-8000-000000000001';
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'd1100000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.warehouse_locations where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.products where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'd1100000-0000-4000-8000-000000000001';
delete from public.profiles where id = 'd1200000-0000-4000-8000-000000000001';
delete from auth.users where id = 'd1200000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'd1100000-0000-4000-8000-000000000001';
commit;

do $$begin
  if not (select was_installed from d1b1_extension_state) then drop extension if exists dblink; end if;
end$$;

select * from finish();
