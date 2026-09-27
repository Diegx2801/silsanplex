-- Append the supporting document without changing historical ledger ordering.
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
  movement.ledger_sequence,
  movement.document_reference
from public.inventory_movements movement;
