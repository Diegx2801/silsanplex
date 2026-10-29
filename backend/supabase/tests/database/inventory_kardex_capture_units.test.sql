begin;
select plan(8);
select has_column('public', 'inventory_kardex', 'entered_quantity', 'Kardex exposes captured quantity');
select has_column('public', 'inventory_kardex', 'entered_unit_id', 'Kardex exposes captured unit identity');
select has_column('public', 'inventory_kardex', 'entered_unit_of_measure', 'Kardex exposes historical unit name');
select has_column('public', 'inventory_kardex', 'unit_conversion_factor', 'Kardex exposes historical conversion');
select ok((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.inventory_kardex'::regclass), 'Kardex continues using caller RLS');
select is((select count(*) from public.inventory_kardex), (select count(*) from public.inventory_movements), 'No ledger rows are duplicated or removed');
select is((
  select count(*) from public.inventory_kardex k join public.inventory_movements m on k.id = m.id
  where k.entered_quantity is distinct from m.entered_quantity
    or k.entered_unit_of_measure is distinct from m.entered_unit_of_measure
    or k.unit_conversion_factor is distinct from m.unit_conversion_factor
), 0::bigint, 'Capture is read from the movement, never inferred from the current catalog');
select is((
  select count(*) from public.inventory_kardex k join public.inventory_movements m on k.id = m.id
  where (k.inbound_quantity + k.outbound_quantity) is distinct from m.quantity
    or (k.inbound_value + k.outbound_value) is distinct from (m.quantity * m.unit_cost)
), 0::bigint, 'Quantity and valuation stay in base units');
select * from finish();
rollback;
