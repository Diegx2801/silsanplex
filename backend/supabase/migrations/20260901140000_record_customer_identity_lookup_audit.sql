-- ============================================================
-- SILSANPLEX: trazabilidad mínima de consultas de identidad
-- ============================================================

-- Reutiliza audit_events para registrar consultas de identidad sin acoplarlas
-- a la caché ni a la metadata fiscal específica de las consultas RUC.
-- audit_events.created_at conserva la fecha/hora de la operación; metadata
-- conserva únicamente fuente, tipo de documento, estado y código de error.
create or replace function public.record_customer_identity_lookup_audit(
  requested_organization_id uuid,
  requested_actor_user_id uuid,
  requested_document_type text,
  requested_document_number text,
  requested_source text,
  requested_success boolean,
  requested_error_code text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if requested_organization_id is null
    or requested_actor_user_id is null
    or nullif(btrim(requested_document_type), '') is null
    or nullif(btrim(requested_document_number), '') is null
    or nullif(btrim(requested_source), '') is null
    or requested_success is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_IDENTITY_LOOKUP_AUDIT_REQUEST';
  end if;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    requested_organization_id,
    requested_actor_user_id,
    case
      when requested_success then 'CUSTOMER_IDENTITY_LOOKUP_COMPLETED'
      else 'CUSTOMER_IDENTITY_LOOKUP_FAILED'
    end,
    'customer_identity_lookup',
    btrim(requested_document_number),
    jsonb_strip_nulls(
      jsonb_build_object(
        'documentType', upper(btrim(requested_document_type)),
        'source', btrim(requested_source),
        'status', case when requested_success then 'success' else 'error' end,
        'errorCode', nullif(btrim(requested_error_code), '')
      )
    )
  );
end;
$$;

revoke all on function public.record_customer_identity_lookup_audit(
  uuid, uuid, text, text, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.record_customer_identity_lookup_audit(
  uuid, uuid, text, text, text, boolean, text
) to service_role;

comment on function public.record_customer_identity_lookup_audit(
  uuid, uuid, text, text, text, boolean, text
) is
  'Registra de forma mínima y append-only el resultado de consultas de identidad.';
