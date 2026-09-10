-- El Kardex representa hechos físicos históricos persistidos. El tipo actual
-- del catálogo no debe ocultar movimientos válidos de un producto que llegó a
-- saldo cero antes de convertirse legítimamente en servicio.

begin;

create or replace view public.inventory_kardex
with (security_invoker = true)
as
select
  movement.id,
  movement.organization_id,
  movement.product_id,
  movement.product_code,
  movement.product_description,
  movement.unit_of_measure,
  movement.movement_type,
  movement.quantity,
  movement.warehouse,
  movement.lot,
  movement.expiration_date,
  movement.operation_date,
  movement.reason,
  movement.source_type,
  movement.source_id,
  movement.created_by,
  movement.created_at,
  movement.warehouse_id,
  movement.location_id,
  movement.stock_status,
  movement.unit_cost,
  movement.transfer_id,
  case
    when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity
    else 0::numeric
  end as inbound_quantity,
  case
    when movement.movement_type in ('salida', 'ajuste-negativo') then movement.quantity
    else 0::numeric
  end as outbound_quantity,
  case
    when movement.movement_type in ('entrada', 'ajuste-positivo')
      then movement.quantity * movement.unit_cost
    else 0::numeric
  end as inbound_value,
  case
    when movement.movement_type in ('salida', 'ajuste-negativo')
      then movement.quantity * movement.unit_cost
    else 0::numeric
  end as outbound_value,
  sum(
    case
      when movement.movement_type in ('entrada', 'ajuste-positivo') then movement.quantity
      else -movement.quantity
    end
  ) over (
    partition by movement.organization_id, movement.product_id, movement.warehouse_id
    order by movement.operation_date, movement.ledger_sequence
    rows between unbounded preceding and current row
  ) as running_quantity,
  sum(
    case
      when movement.movement_type in ('entrada', 'ajuste-positivo')
        then movement.quantity * movement.unit_cost
      else -(movement.quantity * movement.unit_cost)
    end
  ) over (
    partition by movement.organization_id, movement.product_id, movement.warehouse_id
    order by movement.operation_date, movement.ledger_sequence
    rows between unbounded preceding and current row
  ) as running_value,
  movement.ledger_sequence
from public.inventory_movements movement;

revoke all on table public.inventory_kardex from public, anon, authenticated;
grant select on table public.inventory_kardex to authenticated;

comment on view public.inventory_kardex is
  'Kardex valorizado histórico con orden determinista y saldo independiente por producto y almacén.';

commit;
