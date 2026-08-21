-- Compatibilidad aislada para marcadores vacios de exportaciones heredadas de Codeplex.

alter function public.import_customers(jsonb) rename to import_customers_core;

revoke all on function public.import_customers_core(jsonb) from public, anon, authenticated;
grant execute on function public.import_customers_core(jsonb) to service_role;

create function public.normalize_customer_import_optional(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null or btrim(value) in ('', '-', '.', '10') then null
    else btrim(value)
  end;
$$;

create function public.import_customers(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_rows jsonb;
  normalized_payload jsonb;
begin
  if jsonb_typeof(payload->'rows') is distinct from 'array' then
    return public.import_customers_core(payload);
  end if;

  select coalesce(
    jsonb_agg(
      entry.value || jsonb_build_object(
        'tradeName', public.normalize_customer_import_optional(entry.value->>'tradeName'),
        'contactName', public.normalize_customer_import_optional(entry.value->>'contactName'),
        'email', public.normalize_customer_import_optional(entry.value->>'email'),
        'phone', public.normalize_customer_import_optional(entry.value->>'phone'),
        'fiscalAddress', public.normalize_customer_import_optional(entry.value->>'fiscalAddress'),
        'ubigeoCode', public.normalize_customer_import_optional(entry.value->>'ubigeoCode'),
        'taxpayerStatus', public.normalize_customer_import_optional(entry.value->>'taxpayerStatus'),
        'domicileCondition', public.normalize_customer_import_optional(entry.value->>'domicileCondition')
      ) order by entry.ordinality
    ),
    '[]'::jsonb
  )
  into normalized_rows
  from jsonb_array_elements(payload->'rows') with ordinality as entry(value, ordinality);

  normalized_payload := jsonb_set(payload, '{rows}', normalized_rows, false);
  return public.import_customers_core(normalized_payload);
end;
$$;

revoke all on function public.normalize_customer_import_optional(text)
  from public, anon, authenticated;
revoke all on function public.import_customers(jsonb) from public, anon;
grant execute on function public.normalize_customer_import_optional(text) to service_role;
grant execute on function public.import_customers(jsonb) to authenticated, service_role;

comment on function public.normalize_customer_import_optional(text) is
  'Convierte marcadores vacios de Codeplex en NULL solo para campos opcionales de importacion.';
comment on function public.import_customers(jsonb) is
  'Normaliza filas heredadas y delega la validacion e importacion transaccional al nucleo protegido.';

