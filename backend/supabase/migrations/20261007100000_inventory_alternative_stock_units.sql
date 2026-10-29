begin;

-- Keep stock and FEFO allocations in the product's base unit while retaining
-- the unit and quantity entered by the operator for auditability. Historical
-- ledger rows are immutable, so their new capture fields intentionally remain
-- null and continue to be interpreted in their existing base unit.
alter table public.inventory_movements
  add column entered_quantity numeric(35, 9),
  add column entered_unit_id uuid,
  add column entered_unit_of_measure text,
  add column unit_conversion_factor numeric(16, 6) not null default 1;

alter table public.inventory_movements
  add constraint inventory_movements_entered_quantity_positive
    check (entered_quantity is null or entered_quantity > 0),
  add constraint inventory_movements_conversion_factor_positive
    check (unit_conversion_factor > 0);

comment on column public.inventory_movements.entered_quantity is
  'Cantidad capturada en la unidad seleccionada; null en movimientos anteriores a esta captura. quantity conserva la cantidad en unidad base.';
comment on column public.inventory_movements.entered_unit_id is
  'Unidad seleccionada al registrar el movimiento; null en movimientos anteriores a esta captura.';
comment on column public.inventory_movements.entered_unit_of_measure is
  'Nombre histórico de la unidad seleccionada al registrar el movimiento; null en movimientos anteriores a esta captura.';
comment on column public.inventory_movements.unit_conversion_factor is
  'Factor histórico de conversión a la unidad base vigente al registrar el movimiento; 1 en registros previos a la captura de unidad.';

create or replace function inventory_internal.resolve_inventory_input_unit(
  requested_organization_id uuid,
  requested_product_id uuid,
  requested_unit_id uuid
)
returns table(unit_id uuid, unit_name text, conversion_factor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_unit_id uuid;
  base_unit_name text;
begin
  select product.base_unit_id, product.unit_of_measure
  into base_unit_id, base_unit_name
  from public.products product
  where product.id = requested_product_id
    and product.organization_id = requested_organization_id
    and product.product_type = 'good'
    and product.is_active;

  if not found then
    raise exception using errcode = 'P0001', message = 'INVENTORY_PRODUCT_UNAVAILABLE';
  end if;

  if requested_unit_id is null or requested_unit_id = base_unit_id then
    return query select base_unit_id, coalesce(base_unit_name, 'Unidad'), 1::numeric;
    return;
  end if;

  return query
  select conversion.unit_id, unit.name, conversion.conversion_factor::numeric
  from public.product_unit_conversions conversion
  join public.measurement_units unit
    on unit.id = conversion.unit_id
    and unit.organization_id = conversion.organization_id
    and unit.is_active
  where conversion.organization_id = requested_organization_id
    and conversion.product_id = requested_product_id
    and conversion.unit_id = requested_unit_id
    and conversion.is_active;

  if not found then
    raise exception using errcode = '22023', message = 'INVENTORY_INPUT_UNIT_INVALID';
  end if;
end;
$$;

alter function inventory_internal.resolve_inventory_input_unit(uuid, uuid, uuid) owner to postgres;
revoke all on function inventory_internal.resolve_inventory_input_unit(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function inventory_internal.resolve_inventory_input_unit(uuid, uuid, uuid)
  to postgres;

create or replace function inventory_internal.snapshot_inventory_input_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  context_text text := nullif(pg_catalog.current_setting('app.inventory_input_unit_context', true), '');
  context_value jsonb;
  factor_value numeric;
begin
  if context_text is null then
    new.entered_quantity := new.quantity;
    new.entered_unit_id := null;
    new.entered_unit_of_measure := coalesce(new.unit_of_measure, 'Unidad');
    new.unit_conversion_factor := 1;
    return new;
  end if;

  context_value := context_text::jsonb;
  factor_value := (context_value ->> 'conversion_factor')::numeric;
  if context_value ->> 'product_id' is distinct from new.product_id::text
    or factor_value is null
    or factor_value <= 0
    or nullif(btrim(context_value ->> 'unit_name'), '') is null
  then
    raise exception using errcode = '22023', message = 'INVENTORY_INPUT_UNIT_INVALID';
  end if;

  new.entered_unit_id := nullif(context_value ->> 'unit_id', '')::uuid;
  new.entered_unit_of_measure := context_value ->> 'unit_name';
  new.unit_conversion_factor := factor_value;
  if coalesce((context_value ->> 'split')::boolean, false) then
    new.entered_quantity := new.quantity / factor_value;
  else
    new.entered_quantity := (context_value ->> 'entered_quantity')::numeric;
  end if;

  return new;
end;
$$;

alter function inventory_internal.snapshot_inventory_input_unit() owner to postgres;
revoke all on function inventory_internal.snapshot_inventory_input_unit()
  from public, anon, authenticated, service_role;

create trigger inventory_movements_snapshot_input_unit
before insert on public.inventory_movements
for each row execute function inventory_internal.snapshot_inventory_input_unit();

comment on function inventory_internal.snapshot_inventory_input_unit() is
  'Conserva unidad y conversión de captura sin modificar el saldo canónico en unidad base.';

-- The existing serialized core still owns all stock validation and writes.
-- This wrapper validates the unit against current product configuration,
-- converts quantity and entry cost server-side, and lets the trigger snapshot
-- the selected unit on each resulting ledger row.
alter function public.record_inventory_movement_d1b1_core(jsonb)
  rename to record_inventory_movement_d1b1_core_base;
revoke all on function public.record_inventory_movement_d1b1_core_base(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inventory_movement_d1b1_core_base(jsonb)
  to postgres;

create function public.record_inventory_movement_d1b1_core(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  product_id uuid := nullif(payload ->> 'product_id', '')::uuid;
  requested_unit_id uuid := nullif(payload ->> 'input_unit_id', '')::uuid;
  entered_quantity numeric := nullif(payload ->> 'quantity', '')::numeric;
  entered_unit_cost numeric := nullif(payload ->> 'unit_cost', '')::numeric;
  normalized_quantity numeric;
  normalized_cost numeric;
  resolved_unit record;
  movement_id uuid;
  normalized_payload jsonb;
  input_context jsonb;
begin
  if actor_id is null
    or organization_id is null
    or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')
  then
    return public.record_inventory_movement_d1b1_core_base(payload);
  end if;

  if entered_quantity is null
    or entered_quantity <= 0
    or entered_quantity::text in ('NaN', 'Infinity', '-Infinity')
  then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_INVALID';
  end if;

  select * into resolved_unit
  from inventory_internal.resolve_inventory_input_unit(
    organization_id, product_id, requested_unit_id
  );
  normalized_quantity := entered_quantity * resolved_unit.conversion_factor;
  if normalized_quantity <= 0
    or normalized_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or normalized_quantity <> round(normalized_quantity, 3)
  then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_CONVERSION_INVALID';
  end if;

  normalized_cost := case
    when entered_unit_cost is null then null
    else entered_unit_cost / resolved_unit.conversion_factor
  end;
  normalized_payload := payload || jsonb_build_object(
    'quantity', normalized_quantity,
    'unit_cost', normalized_cost
  );
  input_context := jsonb_build_object(
    'product_id', product_id,
    'unit_id', resolved_unit.unit_id,
    'unit_name', resolved_unit.unit_name,
    'conversion_factor', resolved_unit.conversion_factor,
    'entered_quantity', entered_quantity,
    'split', false
  );

  perform pg_catalog.set_config('app.inventory_input_unit_context', input_context::text, true);
  movement_id := public.record_inventory_movement_d1b1_core_base(normalized_payload);
  perform pg_catalog.set_config('app.inventory_input_unit_context', '', true);
  return movement_id;
end;
$$;

alter function public.record_inventory_movement_d1b1_core(jsonb) owner to postgres;
revoke all on function public.record_inventory_movement_d1b1_core(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inventory_movement_d1b1_core(jsonb)
  to postgres;

alter function public.record_inventory_fefo_outbound(jsonb)
  rename to record_inventory_fefo_outbound_base;
revoke all on function public.record_inventory_fefo_outbound_base(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inventory_fefo_outbound_base(jsonb)
  to postgres;

create function public.record_inventory_fefo_outbound(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid := nullif(payload ->> 'organization_id', '')::uuid;
  product_id uuid := nullif(payload ->> 'product_id', '')::uuid;
  requested_unit_id uuid := nullif(payload ->> 'input_unit_id', '')::uuid;
  entered_quantity numeric := nullif(payload ->> 'quantity', '')::numeric;
  normalized_quantity numeric;
  resolved_unit record;
  operation_id uuid;
  normalized_payload jsonb;
  input_context jsonb;
begin
  if actor_id is null
    or organization_id is null
    or not public.has_organization_permission(organization_id, 'INVENTORY_MANAGE')
  then
    return public.record_inventory_fefo_outbound_base(payload);
  end if;

  if entered_quantity is null
    or entered_quantity <= 0
    or entered_quantity::text in ('NaN', 'Infinity', '-Infinity')
  then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_INVALID';
  end if;

  select * into resolved_unit
  from inventory_internal.resolve_inventory_input_unit(
    organization_id, product_id, requested_unit_id
  );
  normalized_quantity := entered_quantity * resolved_unit.conversion_factor;
  if normalized_quantity <= 0
    or normalized_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or normalized_quantity <> round(normalized_quantity, 3)
  then
    raise exception using errcode = '22023', message = 'INVENTORY_QUANTITY_CONVERSION_INVALID';
  end if;

  normalized_payload := payload || jsonb_build_object('quantity', normalized_quantity);
  input_context := jsonb_build_object(
    'product_id', product_id,
    'unit_id', resolved_unit.unit_id,
    'unit_name', resolved_unit.unit_name,
    'conversion_factor', resolved_unit.conversion_factor,
    'entered_quantity', entered_quantity,
    'split', true
  );

  perform pg_catalog.set_config('app.inventory_input_unit_context', input_context::text, true);
  operation_id := public.record_inventory_fefo_outbound_base(normalized_payload);
  perform pg_catalog.set_config('app.inventory_input_unit_context', '', true);
  return operation_id;
end;
$$;

alter function public.record_inventory_fefo_outbound(jsonb) owner to postgres;
revoke all on function public.record_inventory_fefo_outbound(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inventory_fefo_outbound(jsonb)
  to authenticated;

-- Keep the existing authorized product-option read models and enrich their
-- bounded pages with the active input units for each product.
create or replace function inventory_internal.attach_inventory_product_units(
  requested_organization_id uuid,
  read_result jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'items', coalesce(
      jsonb_agg(
        item.value || jsonb_build_object(
          'base_unit_id', product.base_unit_id,
          'alternative_units', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'unit_id', conversion.unit_id,
                'unit_name', unit.name,
                'conversion_factor', conversion.conversion_factor
              )
              order by unit.name, conversion.unit_id
            )
            from public.product_unit_conversions conversion
            join public.measurement_units unit
              on unit.id = conversion.unit_id
              and unit.organization_id = conversion.organization_id
              and unit.is_active
            where conversion.organization_id = requested_organization_id
              and conversion.product_id = product.id
              and conversion.is_active
          ), '[]'::jsonb)
        )
        order by item.ordinality
      ),
      '[]'::jsonb
    ),
    'total_count', coalesce(read_result -> 'total_count', '0'::jsonb)
  )
  from jsonb_array_elements(coalesce(read_result -> 'items', '[]'::jsonb))
    with ordinality as item(value, ordinality)
  join public.products product
    on product.id = (item.value ->> 'product_id')::uuid
    and product.organization_id = requested_organization_id;
$$;

alter function inventory_internal.attach_inventory_product_units(uuid, jsonb) owner to postgres;
revoke all on function inventory_internal.attach_inventory_product_units(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function inventory_internal.attach_inventory_product_units(uuid, jsonb)
  to postgres;

alter function public.inventory_product_options(uuid, text, integer, integer)
  rename to inventory_product_options_base;
revoke all on function public.inventory_product_options_base(uuid, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_product_options_base(uuid, text, integer, integer)
  to postgres;

create function public.inventory_product_options(
  requested_organization_id uuid,
  search_term text default '',
  requested_limit integer default 50,
  requested_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select inventory_internal.attach_inventory_product_units(
    requested_organization_id,
    public.inventory_product_options_base(
      requested_organization_id, search_term, requested_limit, requested_offset
    )
  );
$$;

alter function public.inventory_product_options(uuid, text, integer, integer) owner to postgres;
revoke all on function public.inventory_product_options(uuid, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_product_options(uuid, text, integer, integer)
  to authenticated;

alter function public.inventory_product_option_read_by_id(uuid, uuid)
  rename to inventory_product_option_read_by_id_base;
revoke all on function public.inventory_product_option_read_by_id_base(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_product_option_read_by_id_base(uuid, uuid)
  to postgres;

create function public.inventory_product_option_read_by_id(
  requested_organization_id uuid,
  requested_product_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select inventory_internal.attach_inventory_product_units(
    requested_organization_id,
    public.inventory_product_option_read_by_id_base(
      requested_organization_id, requested_product_id
    )
  );
$$;

alter function public.inventory_product_option_read_by_id(uuid, uuid) owner to postgres;
revoke all on function public.inventory_product_option_read_by_id(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.inventory_product_option_read_by_id(uuid, uuid)
  to authenticated;

commit;
