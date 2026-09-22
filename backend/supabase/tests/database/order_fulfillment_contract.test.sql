begin;

select plan(9);

select has_column('public', 'orders', 'fulfillment_mode', 'orders expone la modalidad de cumplimiento');
select has_column('public', 'orders', 'fulfillment_status', 'orders expone el estado logístico separado');
select is(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'orders' and column_name = 'fulfillment_mode'),
  '''delivery''::text',
  'la modalidad por defecto conserva la entrega actual'
);
select is(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'orders' and column_name = 'fulfillment_status'),
  '''pending''::text',
  'el estado logístico inicia pendiente'
);
select is(
  (select count(*) from pg_constraint where conname = 'orders_fulfillment_mode_valid'),
  1::bigint,
  'la modalidad tiene una restricción de dominio'
);
select is(
  (select count(*) from pg_constraint where conname = 'orders_fulfillment_status_valid'),
  1::bigint,
  'el estado logístico tiene una restricción de dominio'
);
select is(
  (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'orders_organization_fulfillment_idx'),
  1::bigint,
  'existe el índice para consultar el cumplimiento por organización'
);
select has_table('public', 'orders', 'la tabla persistente de pedidos sigue disponible');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.orders'::regclass),
  'orders conserva RLS'
);

select * from finish();
rollback;
