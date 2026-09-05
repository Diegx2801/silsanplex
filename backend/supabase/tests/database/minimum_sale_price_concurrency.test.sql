select exists (
  select 1 from pg_catalog.pg_extension where extname = 'dblink'
) as was_installed
into temporary table minimum_sale_price_extension_state;

create extension if not exists dblink with schema extensions;

begin;
select no_plan();

insert into public.organizations (id, name, slug)
values ('d7100000-0000-4000-8000-000000000001', 'Minimo concurrente', 'minimo-concurrente');
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('d7200000-0000-4000-8000-000000000001', 'minimo.concurrente@test.local', '{"full_name":"Minimo concurrente"}', now(), now());
insert into public.organization_memberships (organization_id, user_id)
values ('d7100000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('d7100000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'VENTAS');
insert into public.customers (
  id, organization_id, document_type, document_number, legal_name, created_by, updated_by
) values (
  'd7300000-0000-4000-8000-000000000001',
  'd7100000-0000-4000-8000-000000000001', 'RUC', '20999999711',
  'Cliente minimo concurrente',
  'd7200000-0000-4000-8000-000000000001',
  'd7200000-0000-4000-8000-000000000001'
);
insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values (
  'd7400000-0000-4000-8000-000000000001',
  'd7100000-0000-4000-8000-000000000001', 'MIN-CONC', 'Almacen minimo concurrente',
  'd7200000-0000-4000-8000-000000000001',
  'd7200000-0000-4000-8000-000000000001'
);
insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, sale_price, minimum_sale_price, batch_control, expiration_control
) values (
  'd7500000-0000-4000-8000-000000000001',
  'd7100000-0000-4000-8000-000000000001',
  'MIN-CONC', 'Servicio minimo concurrente', 'UND', 'service',
  'gravado', 30, 20, false, false
);

create schema minimum_sale_price_concurrency_test;

create function minimum_sale_price_concurrency_test.create_order_and_wait(
  requested_gate bigint,
  requested_operation_key uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_order_id uuid;
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', 'd7200000-0000-4000-8000-000000000001', true);
  perform pg_catalog.set_config('request.jwt.claims', '{"sub":"d7200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  created_order_id := public.create_order(jsonb_build_object(
    'organization_id', 'd7100000-0000-4000-8000-000000000001',
    'operation_key', requested_operation_key,
    'customer_id', 'd7300000-0000-4000-8000-000000000001',
    'warehouse_id', 'd7400000-0000-4000-8000-000000000001',
    'prices_include_tax', true,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', 'd7500000-0000-4000-8000-000000000001',
      'quantity', 1,
      'unit_price', 20
    ))
  ));
  perform pg_catalog.pg_advisory_xact_lock(requested_gate);
  return created_order_id::text;
exception
  when others then
    return sqlstate || ':' || sqlerrm;
end;
$$;

create function minimum_sale_price_concurrency_test.raise_minimum_and_wait(
  requested_gate bigint
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_minimum numeric;
begin
  update public.products
  set minimum_sale_price = 25
  where id = 'd7500000-0000-4000-8000-000000000001'
    and organization_id = 'd7100000-0000-4000-8000-000000000001'
  returning minimum_sale_price into saved_minimum;
  perform pg_catalog.pg_advisory_xact_lock(requested_gate);
  return saved_minimum;
end;
$$;

commit;

create temporary table minimum_sale_price_workers (
  worker_name text primary key,
  process_id integer not null
);

select extensions.dblink_connect(
  'minimum_sale_price_creator',
  'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'minimum_sale_price_updater',
  'host=supabase_db_backend port=5432 dbname=postgres user=postgres password=postgres'
);
insert into minimum_sale_price_workers
select 'creator', process_id
from extensions.dblink('minimum_sale_price_creator', 'select pg_backend_pid()')
  as worker(process_id integer);
insert into minimum_sale_price_workers
select 'updater', process_id
from extensions.dblink('minimum_sale_price_updater', 'select pg_backend_pid()')
  as worker(process_id integer);

-- Escenario 1: la creacion obtiene primero FOR SHARE; el cambio de minimo
-- espera y se lineariza despues de confirmar el precio acordado.
select pg_catalog.pg_advisory_lock(907290200000000001);
select is(
  extensions.dblink_send_query(
    'minimum_sale_price_creator',
    $$select minimum_sale_price_concurrency_test.create_order_and_wait(907290200000000001, 'd7600000-0000-4000-8000-000000000001')$$
  ),
  1,
  'se inicia la creacion que conserva el lock compartido del producto'
);

do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.locktype = 'advisory'
        and not lock.granted
        and lock.pid = (select process_id from minimum_sale_price_workers where worker_name = 'creator')
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;

select is(
  extensions.dblink_send_query(
    'minimum_sale_price_updater',
    $$update public.products set minimum_sale_price = 25 where id = 'd7500000-0000-4000-8000-000000000001' returning minimum_sale_price$$
  ),
  1,
  'se inicia el cambio concurrente del minimo'
);

do $$
begin
  for attempt in 1..100 loop
    exit when (
      select wait_event_type = 'Lock'
      from pg_catalog.pg_stat_activity
      where pid = (select process_id from minimum_sale_price_workers where worker_name = 'updater')
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;

select is(
  (
    select wait_event_type
    from pg_catalog.pg_stat_activity
    where pid = (select process_id from minimum_sale_price_workers where worker_name = 'updater')
  ),
  'Lock',
  'el cambio de minimo espera mientras se crea la linea'
);
select ok(pg_catalog.pg_advisory_unlock(907290200000000001), 'se libera la primera barrera');
select ok(
  position(':' in (select result from extensions.dblink_get_result('minimum_sale_price_creator') as worker(result text))) = 0,
  'la creacion termina con el minimo observado de forma consistente'
);
select is(
  (select minimum_sale_price from extensions.dblink_get_result('minimum_sale_price_updater') as worker(minimum_sale_price numeric)),
  25::numeric,
  'el cambio del minimo se aplica despues de confirmar el pedido'
);
select * from extensions.dblink_get_result('minimum_sale_price_creator') as cleared(result text);
select * from extensions.dblink_get_result('minimum_sale_price_updater') as cleared(result text);
select is(
  (
    select item.unit_price
    from public.order_items item
    join public.orders order_data on order_data.id = item.order_id
    where order_data.operation_key = 'd7600000-0000-4000-8000-000000000001'
  ),
  20.0000::numeric,
  'el pedido concurrente conserva el precio acordado'
);

-- Escenario 2: el cambio obtiene primero el lock exclusivo; create_order
-- espera, observa el nuevo minimo confirmado y rechaza el precio anterior.
update public.products
set minimum_sale_price = 20
where id = 'd7500000-0000-4000-8000-000000000001';

select pg_catalog.pg_advisory_lock(907290200000000002);
select is(
  extensions.dblink_send_query(
    'minimum_sale_price_updater',
    $$select minimum_sale_price_concurrency_test.raise_minimum_and_wait(907290200000000002)$$
  ),
  1,
  'se inicia primero el cambio de minimo'
);

do $$
begin
  for attempt in 1..100 loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock
      where lock.locktype = 'advisory'
        and not lock.granted
        and lock.pid = (select process_id from minimum_sale_price_workers where worker_name = 'updater')
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;

select is(
  extensions.dblink_send_query(
    'minimum_sale_price_creator',
    $$select minimum_sale_price_concurrency_test.create_order_and_wait(907290200000000003, 'd7600000-0000-4000-8000-000000000002')$$
  ),
  1,
  'se inicia la creacion contra el cambio no confirmado'
);

do $$
begin
  for attempt in 1..100 loop
    exit when (
      select wait_event_type = 'Lock'
      from pg_catalog.pg_stat_activity
      where pid = (select process_id from minimum_sale_price_workers where worker_name = 'creator')
    );
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;

select is(
  (
    select wait_event_type
    from pg_catalog.pg_stat_activity
    where pid = (select process_id from minimum_sale_price_workers where worker_name = 'creator')
  ),
  'Lock',
  'create_order espera el cambio exclusivo del producto'
);
select ok(pg_catalog.pg_advisory_unlock(907290200000000002), 'se libera la segunda barrera');
select is(
  (select minimum_sale_price from extensions.dblink_get_result('minimum_sale_price_updater') as worker(minimum_sale_price numeric)),
  25::numeric,
  'el nuevo minimo queda confirmado antes de continuar la creacion'
);
select is(
  (select result from extensions.dblink_get_result('minimum_sale_price_creator') as worker(result text)),
  'P0001:ORDER_MINIMUM_SALE_PRICE_VIOLATION',
  'la creacion bloqueada observa el nuevo minimo y rechaza el precio anterior'
);
select is(
  (select count(*) from public.orders where operation_key = 'd7600000-0000-4000-8000-000000000002'),
  0::bigint,
  'el rechazo concurrente no deja un pedido parcial'
);

select extensions.dblink_disconnect('minimum_sale_price_creator');
select extensions.dblink_disconnect('minimum_sale_price_updater');

begin;
drop schema minimum_sale_price_concurrency_test cascade;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where organization_id = 'd7100000-0000-4000-8000-000000000001';
alter table public.audit_events enable trigger audit_events_immutable;
alter table public.product_versions disable trigger product_versions_immutable;
delete from public.product_versions where organization_id = 'd7100000-0000-4000-8000-000000000001';
alter table public.product_versions enable trigger product_versions_immutable;
delete from public.orders where organization_id = 'd7100000-0000-4000-8000-000000000001';
delete from public.products where organization_id = 'd7100000-0000-4000-8000-000000000001';
delete from public.warehouses where organization_id = 'd7100000-0000-4000-8000-000000000001';
delete from public.customers where organization_id = 'd7100000-0000-4000-8000-000000000001';
delete from public.user_roles where organization_id = 'd7100000-0000-4000-8000-000000000001';
delete from public.organization_memberships where organization_id = 'd7100000-0000-4000-8000-000000000001';
delete from public.profiles where id = 'd7200000-0000-4000-8000-000000000001';
delete from auth.users where id = 'd7200000-0000-4000-8000-000000000001';
delete from public.organizations where id = 'd7100000-0000-4000-8000-000000000001';
commit;

do $$
begin
  if not (select was_installed from minimum_sale_price_extension_state) then
    drop extension if exists dblink;
  end if;
end;
$$;

select * from finish();
