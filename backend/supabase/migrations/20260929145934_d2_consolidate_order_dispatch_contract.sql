-- D2: consolidar la identidad y la referencia documental del despacho físico.
--
-- No se crea una cabecera paralela. La identidad existente de una operación
-- sigue siendo operation_key, persistida en ORDER_DISPATCHED junto con sus
-- movement_ids y allocations. Esta migración solo hace explícita la misma
-- identidad en inventory_movements.document_reference para los movimientos
-- nuevos, sin reescribir históricos.

create or replace function public.order_dispatch_document_reference(
  order_number_value text,
  operation_key_value uuid
)
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.format(
    'PED:%s|OP:%s',
    pg_catalog.btrim(order_number_value),
    operation_key_value::text
  );
$$;

alter function public.order_dispatch_document_reference(text, uuid)
  owner to postgres;
revoke all on function public.order_dispatch_document_reference(text, uuid)
  from public, anon, authenticated, service_role;

-- Las filas históricas pueden conservar document_reference NULL. Para filas
-- nuevas de order-dispatch, la referencia se calcula desde el pedido
-- persistente y la operation_key de la RPC, nunca desde texto del frontend.
create or replace function public.set_order_dispatch_document_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_key_text text := nullif(
    pg_catalog.current_setting('silsanplex.order_dispatch_operation_key', true),
    ''
  );
  operation_key_value uuid;
  order_number_value text;
  expected_reference text;
begin
  if new.source_type is distinct from 'order-dispatch' then
    return new;
  end if;

  if operation_key_text is null then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_DISPATCH_DOCUMENT_REFERENCE_REQUIRED';
  end if;

  operation_key_value := operation_key_text::uuid;

  select order_row.order_number
    into order_number_value
  from public.order_items order_item
  join public.orders order_row
    on order_row.organization_id = order_item.organization_id
   and order_row.id = order_item.order_id
  where order_item.organization_id = new.organization_id
    and order_item.id = new.source_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_DISPATCH_SOURCE_INVALID';
  end if;

  expected_reference := public.order_dispatch_document_reference(
    order_number_value,
    operation_key_value
  );

  if pg_catalog.char_length(expected_reference) > 120 then
    raise exception using
      errcode = '22023',
      message = 'ORDER_DISPATCH_DOCUMENT_REFERENCE_TOO_LONG';
  end if;

  if new.document_reference is not null
     and pg_catalog.btrim(new.document_reference) <> expected_reference then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_DISPATCH_DOCUMENT_REFERENCE_MISMATCH';
  end if;

  new.document_reference := expected_reference;
  return new;
end;
$$;

alter function public.set_order_dispatch_document_reference()
  owner to postgres;
revoke all on function public.set_order_dispatch_document_reference()
  from public, anon, authenticated, service_role;

drop trigger if exists inventory_movements_order_dispatch_document_reference
  on public.inventory_movements;
create trigger inventory_movements_order_dispatch_document_reference
before insert on public.inventory_movements
for each row
execute function public.set_order_dispatch_document_reference();

comment on column public.inventory_movements.document_reference is
  'Referencia documental persistente. Para order-dispatch se deriva como PED:<order_number>|OP:<operation_key>; históricos pueden ser NULL.';

-- La función pública conserva exactamente los permisos y la primitiva de
-- despacho existentes. Solo publica la operation_key dentro de la
-- transacción para que el trigger pueda materializar la referencia estable.
create or replace function public.dispatch_order_from_reservations(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_order_id uuid;
  target_sale_id uuid;
  operation_key_text text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'ORDER_DISPATCH_PAYLOAD_INVALID';
  end if;

  target_organization_id := nullif(payload ->> 'organization_id', '')::uuid;
  target_order_id := nullif(payload ->> 'order_id', '')::uuid;
  target_sale_id := nullif(payload ->> 'sale_id', '')::uuid;
  if target_organization_id is null
     or not public.has_organization_permission(target_organization_id, 'DISTRIBUTION_MANAGE')
     or not public.has_organization_permission(target_organization_id, 'INVENTORY_MANAGE') then
    raise exception using errcode = '42501', message = 'ORDER_DISPATCH_FORBIDDEN';
  end if;

  -- Preserva el contrato fiscal introducido por P1B3: una transicion abierta
  -- no puede despacharse mientras pedido o venta no tengan calculo tributario.
  if exists (
    select 1
    from public.orders order_row
    join public.sales sale_row
      on sale_row.organization_id = order_row.organization_id
     and sale_row.order_id = order_row.id
     and (target_sale_id is null or sale_row.id = target_sale_id)
    where order_row.organization_id = target_organization_id
      and order_row.id = target_order_id
      and order_row.status = 'confirmado'
      and sale_row.status = 'registrada'
      and (
        order_row.tax_calculation_status is distinct from 'calculated'
        or sale_row.tax_calculation_status is distinct from 'calculated'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'ORDER_TAX_CALCULATION_REQUIRED';
  end if;

  operation_key_text := nullif(payload ->> 'operation_key', '');
  if operation_key_text is not null then
    perform pg_catalog.set_config(
      'silsanplex.order_dispatch_operation_key',
      operation_key_text,
      true
    );
  end if;

  return public.dispatch_order_from_reservations_unchecked(payload);
end;
$$;

comment on function public.dispatch_order_from_reservations(jsonb) is
  'Despacha una venta solo con DISTRIBUTION_MANAGE e INVENTORY_MANAGE; cada movimiento order-dispatch recibe una referencia PED:<order_number>|OP:<operation_key> estable.';
