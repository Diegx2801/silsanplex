begin;

select plan(8);

select has_column('public', 'orders', 'delivery_address_id', 'el pedido referencia la direccion elegida del cliente');
select has_column('public', 'orders', 'delivery_address_snapshot', 'el pedido conserva un snapshot del destino');
select ok((select count(*) = 1 from pg_catalog.pg_constraint where conname = 'orders_delivery_address_same_customer'), 'la direccion pertenece al mismo cliente y organizacion');
select ok((select count(*) = 1 from pg_catalog.pg_constraint where conname = 'orders_delivery_address_snapshot_valid'), 'el snapshot valida limites y formato de direccion');
select ok((select count(*) = 1 from pg_catalog.pg_constraint where conname = 'orders_pickup_has_no_delivery_address'), 'el recojo no conserva un destino de entrega');
select has_function('public', 'create_order_with_fulfillment', array['jsonb'], 'el RPC transaccional guarda modalidad y destino juntos');
select ok(has_function_privilege('authenticated', 'public.create_order_with_fulfillment(jsonb)', 'EXECUTE'), 'el rol autenticado puede usar el RPC');
select ok(not has_function_privilege('anon', 'public.create_order_with_fulfillment(jsonb)', 'EXECUTE'), 'el rol anonimo no puede usar el RPC');

select * from finish();
rollback;
