begin;

select plan(20);

select has_table('public', 'marcas', 'existe el maestro de marcas');
select has_table('public', 'lineas', 'existe el maestro de lineas');
select has_table('public', 'sublineas', 'existe el maestro de sublineas');
select has_table('public', 'unidades_medida', 'existe el maestro de unidades');

select has_column('public', 'marcas', 'organization_id', 'marcas es multiempresa');
select has_column('public', 'lineas', 'organization_id', 'lineas es multiempresa');
select has_column('public', 'sublineas', 'organization_id', 'sublineas es multiempresa');
select has_column('public', 'unidades_medida', 'organization_id', 'unidades es multiempresa');

select ok((select relrowsecurity from pg_class where oid = 'public.marcas'::regclass), 'marcas tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.lineas'::regclass), 'lineas tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.sublineas'::regclass), 'sublineas tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.unidades_medida'::regclass), 'unidades tiene RLS');

select is(has_table_privilege('anon', 'public.marcas', 'SELECT'), false, 'anon no consulta marcas');
select is(has_table_privilege('anon', 'public.lineas', 'SELECT'), false, 'anon no consulta lineas');
select is(has_table_privilege('anon', 'public.sublineas', 'SELECT'), false, 'anon no consulta sublineas');
select is(has_table_privilege('anon', 'public.unidades_medida', 'SELECT'), false, 'anon no consulta unidades');

select is(has_table_privilege('authenticated', 'public.marcas', 'SELECT'), true, 'authenticated consulta marcas bajo RLS');
select is(has_table_privilege('authenticated', 'public.lineas', 'SELECT'), true, 'authenticated consulta lineas bajo RLS');
select is(has_table_privilege('authenticated', 'public.sublineas', 'SELECT'), true, 'authenticated consulta sublineas bajo RLS');
select is(has_table_privilege('authenticated', 'public.unidades_medida', 'SELECT'), true, 'authenticated consulta unidades bajo RLS');

select * from finish();
rollback;
