begin;
-- The work queue must show physical custody even with optional sections closed.
create or replace view public.repair_list with (security_invoker = true) as
select repair.id, repair.organization_id, repair.repair_code, repair.customer_id, repair.product_id,
  repair.serial_number, repair.received_at, repair.estimated_delivery_date, repair.delivered_at,
  repair.status, repair.priority, repair.problem_description, repair.diagnosis, repair.applied_solution,
  repair.notes, repair.customer_reference, repair.sale_document_id, repair.warranty_reference,
  repair.assigned_technician_id, repair.customer_name_snapshot, repair.customer_document_snapshot,
  repair.product_code_snapshot, repair.product_description_snapshot, repair.created_by, repair.updated_by,
  repair.created_at, repair.updated_at, repair.serial_control_snapshot, repair.lock_version,
  repair.requester_type, repair.requesting_area, repair.equipment_type, repair.external_equipment_description,
  exists(select 1 from public.repair_external_services service where service.organization_id = repair.organization_id
    and service.repair_id = repair.id and service.returned_at is null) as external_service_pending
from public.repairs repair;

create or replace function public.guard_repair_external_custody()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status in ('testing', 'ready_for_delivery', 'delivered', 'cancelled', 'rejected')
    and exists(select 1 from public.repair_external_services service where service.organization_id = old.organization_id
      and service.repair_id = old.id and service.returned_at is null)
  then raise exception using errcode = 'P0001', message = 'REPAIR_EXTERNAL_SERVICE_OUTSTANDING'; end if;
  return new;
end;
$$;
commit;
