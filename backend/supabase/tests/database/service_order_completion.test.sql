begin;

select no_plan();

insert into public.organizations (id, name, slug)
values (
  'c1000000-0000-4000-8000-000000000001',
  'Servicios sin stock',
  'servicios-sin-stock'
);

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'c2000000-0000-4000-8000-000000000001',
  'service-inventory@test.local',
  '{"full_name":"Operador de inventario"}',
  now(), now()
);
insert into public.organization_memberships (organization_id, user_id)
values ('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001');
insert into public.user_roles (organization_id, user_id, role_code)
values ('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'ADMIN');
insert into public.user_roles (organization_id, user_id, role_code)
values ('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'VENTAS');
insert into public.customers (
  id, organization_id, document_type, document_number, legal_name,
  created_by, updated_by
) values (
  'cc000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001', 'RUC', '20999999991',
  'Cliente de servicios',
  'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'
);

insert into public.products (
  id, organization_id, code, description, unit_of_measure, product_type,
  tax_affectation, batch_control, expiration_control
) values
  (
    'c3000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'GOOD-001', 'Producto fisico de prueba', 'UND', 'good', 'gravado', false, false
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000001',
    'SERV-001', 'Servicio sin stock', 'UND', 'service', 'gravado', false, false
  );

insert into public.warehouses (id, organization_id, code, name, created_by, updated_by)
values
  (
    'c4000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001', 'CENTRAL', 'Central',
    'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'
  ),
  (
    'c4000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000001', 'NORTE', 'Norte',
    'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'
  );
insert into public.warehouse_locations (
  id, organization_id, warehouse_id, code, name, created_by, updated_by
) values
  (
    'c5000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'A-01', 'Anaquel central',
    'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'
  ),
  (
    'c5000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000002', 'B-01', 'Anaquel norte',
    'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'
  );


create function pg_temp.order_payload(key uuid, mixed boolean)
returns jsonb language sql as $$
  select jsonb_build_object(
    'organization_id','c1000000-0000-4000-8000-000000000001',
    'operation_key',key,'customer_id','cc000000-0000-4000-8000-000000000001',
    'warehouse_id','c4000000-0000-4000-8000-000000000001',
    'items', jsonb_build_array(jsonb_build_object(
      'product_id','c3000000-0000-4000-8000-000000000002','quantity',1,'unit_price',100
    )) || case when mixed then jsonb_build_array(jsonb_build_object(
      'product_id','c3000000-0000-4000-8000-000000000001','quantity',10,'unit_price',10
    )) else '[]'::jsonb end
  );
$$;

create function pg_temp.change_quantity(key uuid, op uuid, service_quantity numeric, good_quantity numeric default 10)
returns uuid language sql as $$
  select public.update_order_quantities(jsonb_build_object(
    'organization_id','c1000000-0000-4000-8000-000000000001',
    'order_id',o.id,'operation_key',op,
    'items',(select jsonb_agg(jsonb_build_object('order_item_id',i.id,'quantity',
      case when p.product_type='service' then service_quantity else good_quantity end))
      from public.order_items i join public.products p on p.id=i.product_id and p.organization_id=i.organization_id
      where i.order_id=o.id)
  )) from public.orders o where o.operation_key=key;
$$;

create function pg_temp.sell(key uuid)
returns uuid language sql as $$
  select public.create_sale_from_order(o.organization_id,o.id,jsonb_build_object(
    'operation_key',o.id,'document_type','boleta','series','B001',
    'document_number',o.order_number,'warehouse','Central'
  )) from public.orders o where o.operation_key=key;
$$;

create function pg_temp.dispatch_payload(key uuid, op uuid, good_quantity numeric, include_service boolean default false)
returns jsonb language sql as $$
  select jsonb_build_object('organization_id',o.organization_id,'order_id',o.id,
    'sale_id',s.id,'operation_key',op,
    'items',(select jsonb_agg(jsonb_build_object('order_item_id',i.id,'quantity',
       case when p.product_type='service' then i.quantity else good_quantity end) order by i.id)
      from public.order_items i join public.products p on p.id=i.product_id and p.organization_id=i.organization_id
      where i.order_id=o.id and (p.product_type='good' or include_service))
  ) from public.orders o join public.sales s on s.order_id=o.id where o.operation_key=key;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c2000000-0000-4000-8000-000000000001',true);

select public.record_inventory_movement(jsonb_build_object(
  'organization_id','c1000000-0000-4000-8000-000000000001',
  'product_id','c3000000-0000-4000-8000-000000000001',
  'warehouse_id','c4000000-0000-4000-8000-000000000001',
  'location_id','c5000000-0000-4000-8000-000000000001',
  'movement_type','entrada','quantity',10,'unit_cost',5,'stock_status','available',
  'operation_date',current_date,'reason','Stock para pedido mixto'
));
select lives_ok($t$select public.create_order(pg_temp.order_payload('ce000000-0000-4000-8000-000000000001',false))$t$, 'crea pedido solo de servicios');
select lives_ok($t$select pg_temp.change_quantity('ce000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001',3)$t$, 'aumenta cantidad de servicio sin reserva');
select lives_ok($t$select pg_temp.change_quantity('ce000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001',3)$t$, 'retry de modificacion es idempotente');
select is((select quantity from public.order_items where order_id=(select id from public.orders where operation_key='ce000000-0000-4000-8000-000000000001')), 3::numeric, 'cantidad de servicio actualizada');
select lives_ok($t$select pg_temp.change_quantity('ce000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000002',2)$t$, 'reduce cantidad de servicio sin liberar reservas ficticias');
select is((select count(*) from public.inventory_reservations), 0::bigint, 'modificar servicios no genera reservas');
select lives_ok($t$select pg_temp.sell('ce000000-0000-4000-8000-000000000001')$t$, 'convierte servicio a venta');
select is((select quantity from public.sale_items where sale_id=(select s.id from public.sales s join public.orders o on o.id=s.order_id where o.operation_key='ce000000-0000-4000-8000-000000000001')), 2::numeric, 'venta conserva cantidad comercial modificada');
select lives_ok($t$select public.dispatch_order_from_reservations(pg_temp.dispatch_payload('ce000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000003',0,true))$t$, 'completa comercialmente servicio sin inventario');
select lives_ok($t$select public.dispatch_order_from_reservations(pg_temp.dispatch_payload('ce000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000003',0,true))$t$, 'retry de cierre no duplica atencion');
select is((select status from public.orders where operation_key='ce000000-0000-4000-8000-000000000001'), 'atendido'::text, 'pedido de servicios atendido');
select is((select s.status from public.sales s join public.orders o on o.id=s.order_id where o.operation_key='ce000000-0000-4000-8000-000000000001'), 'despachada'::text, 'venta de servicios completada');
select is((select count(*) from public.inventory_movements where source_type='order-dispatch'), 0::bigint, 'servicio no crea movimientos');
select is((select count(*) from public.inventory_kardex where product_id='c3000000-0000-4000-8000-000000000002'), 0::bigint, 'servicio no crea Kardex');
reset role;
select is((select count(*) from public.audit_events where action='ORDER_DISPATCHED'), 1::bigint, 'cierre tiene una sola auditoria');
select is((select (metadata->'completed_services'->0->>'quantity')::numeric from public.audit_events where action='ORDER_DISPATCHED'), 2::numeric, 'auditoria identifica la cantidad de servicio atendida');
set local role authenticated;
select throws_ok($t$select public.dispatch_order_from_reservations(pg_temp.dispatch_payload('ce000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000004',0,true))$t$, 'P0001', 'ORDER_NOT_DISPATCHABLE', 'otra clave no vuelve a atender un pedido cerrado');
select throws_ok($t$select public.dispatch_order_from_reservations(jsonb_set(pg_temp.dispatch_payload('ce000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000003',0,true),'{items,0,quantity}','99'::jsonb))$t$, 'P0001', 'ORDER_OPERATION_KEY_REUSED', 'retry con otra cantidad entra en conflicto');
select lives_ok($t$select public.create_order(pg_temp.order_payload('ce000000-0000-4000-8000-000000000002',true))$t$, 'crea pedido mixto');
select lives_ok($t$select pg_temp.change_quantity('ce000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000005',2,8)$t$, 'modifica servicio y bien atomicamente');
select lives_ok($t$select pg_temp.change_quantity('ce000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000006',1,10)$t$, 'restablece cantidades del mixto');
select is((select sum(quantity) from public.inventory_reservations where status='active'), 10::numeric, 'solo el bien tiene reserva');
select is((select count(*) from public.inventory_reservations where product_id='c3000000-0000-4000-8000-000000000002'), 0::bigint, 'servicio mixto no tiene reserva');
select lives_ok($t$select pg_temp.sell('ce000000-0000-4000-8000-000000000002')$t$, 'convierte pedido mixto a venta');
select throws_ok($t$select public.dispatch_order_from_reservations(jsonb_set(pg_temp.dispatch_payload('ce000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000007',1,true),'{items,0,quantity}','"NaN"'::jsonb))$t$, '22023', 'ORDER_DISPATCH_QUANTITY_INVALID', 'rechaza cantidades no finitas');
select lives_ok($t$select public.dispatch_order_from_reservations(pg_temp.dispatch_payload('ce000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000008',4,true))$t$, 'despacho mixto ignora servicio para FEFO');
select is((select status from public.orders where operation_key='ce000000-0000-4000-8000-000000000002'), 'confirmado'::text, 'parcial del bien no atiende todo el pedido');
select is((select s.status from public.sales s join public.orders o on o.id=s.order_id where o.operation_key='ce000000-0000-4000-8000-000000000002'), 'registrada'::text, 'venta parcial sigue registrada');
select is((select sum(quantity_consumed) from public.inventory_reservations), 4::numeric, 'solo el bien consume reserva');
select lives_ok($t$select public.dispatch_order_from_reservations(pg_temp.dispatch_payload('ce000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000008',4,true))$t$, 'retry de parcial no repite consumo');
select is((select sum(quantity_consumed) from public.inventory_reservations), 4::numeric, 'consumo se mantiene tras retry');
select throws_ok($t$select public.dispatch_order_from_reservations(pg_temp.dispatch_payload('ce000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000009',7,true))$t$, 'P0001', 'ORDER_DISPATCH_EXCEEDS_RESERVED', 'bien no permite exceder reserva');
select lives_ok($t$select public.dispatch_order_from_reservations(pg_temp.dispatch_payload('ce000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000010',6,false))$t$, 'completa bienes sin exigir servicio en payload');
select is((select status from public.orders where operation_key='ce000000-0000-4000-8000-000000000002'), 'atendido'::text, 'pedido mixto queda atendido');
select is((select s.status from public.sales s join public.orders o on o.id=s.order_id where o.operation_key='ce000000-0000-4000-8000-000000000002'), 'despachada'::text, 'venta mixta queda despachada');
select is((select count(*) from public.inventory_movements where source_type='order-dispatch'), 2::bigint, 'solo dos movimientos fisicos por parciales');
select is((select count(*) from public.inventory_movements where product_id='c3000000-0000-4000-8000-000000000002'), 0::bigint, 'servicio no genera movimientos en todo el flujo');
select is((select count(*) from public.inventory_kardex where product_id='c3000000-0000-4000-8000-000000000002'), 0::bigint, 'servicio mixto no genera Kardex');
reset role;
select is((select jsonb_array_length(metadata->'completed_services') from public.audit_events where action='ORDER_DISPATCHED' and entity_id=(select id::text from public.orders where operation_key='ce000000-0000-4000-8000-000000000002') and (new_values->>'complete')::boolean), 1, 'cierre mixto deja trazabilidad del servicio');
select is((select sum(jsonb_array_length(metadata->'completed_services')) from public.audit_events where action='ORDER_DISPATCHED' and entity_id=(select id::text from public.orders where operation_key='ce000000-0000-4000-8000-000000000002')), 1::bigint, 'parcial no declara servicio atendido prematuramente');
select * from finish();
rollback;
