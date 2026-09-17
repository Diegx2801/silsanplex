-- SILSANPLEX: política única de fechas de negocio para empresas peruanas.
-- Los timestamptz siguen representando instantes UTC. Solo los valores DATE
-- derivados de "hoy" deben tomar el calendario de America/Lima.

create or replace function public.fecha_negocio_peru()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Lima')::date;
$$;

revoke all on function public.fecha_negocio_peru() from public, anon, authenticated, service_role;
-- Las RPC de negocio son SECURITY DEFINER, pero service_role también puede
-- ejecutar operaciones administrativas que dependan de este valor por
-- defecto. El helper solo devuelve la fecha actual de Lima y no expone datos.
grant execute on function public.fecha_negocio_peru() to service_role;

alter table public.orders
  alter column order_date set default public.fecha_negocio_peru();

alter table public.sales_quotes
  alter column issue_date set default public.fecha_negocio_peru();

-- Estas funciones conservan sus contratos y payloads. El ajuste de timezone
-- se limita a sus fallbacks current_date y no cambia la zona de los timestamps
-- de auditoría ni la representación persistida de timestamptz.
alter function public.create_order(jsonb) set timezone = 'America/Lima';
alter function public.create_order_unchecked(jsonb) set timezone = 'America/Lima';
alter function public.save_sales_quote(jsonb) set timezone = 'America/Lima';
alter function public.issue_sales_quote(uuid, uuid) set timezone = 'America/Lima';
alter function public.create_sale_from_order(uuid, uuid, jsonb) set timezone = 'America/Lima';
alter function public.create_sale_from_order_unchecked(uuid, uuid, jsonb) set timezone = 'America/Lima';
alter function public.dispatch_order_from_reservations(jsonb) set timezone = 'America/Lima';
alter function public.dispatch_order_from_reservations_unchecked(jsonb) set timezone = 'America/Lima';
alter function public.update_order_quantities_unchecked(jsonb) set timezone = 'America/Lima';
alter function public.complete_order_services(jsonb) set timezone = 'America/Lima';
alter function public.a5_finalize_order_completion(uuid, uuid, uuid, uuid) set timezone = 'America/Lima';
alter function public.receive_purchase_order_partial(jsonb) set timezone = 'America/Lima';
alter function public.receive_purchase_order(uuid, uuid) set timezone = 'America/Lima';
alter function public.register_supplier_return(jsonb) set timezone = 'America/Lima';
alter function public.complete_supplier_return(uuid, uuid) set timezone = 'America/Lima';

comment on function public.fecha_negocio_peru() is
  'Fecha calendario de negocio de SILSANPLEX en America/Lima; no reemplaza timestamps UTC.';
