-- Las cuentas bancarias se escriben desde la ficha autorizada, pero no se
-- exponen a través del directorio ni de consultas directas del Data API.
-- PostgreSQL permite mantener INSERT/UPDATE bajo RLS y limitar SELECT por
-- columna para todos los usuarios autenticados.

revoke select on table public.suppliers from authenticated;

grant select (
  id,
  organization_id,
  code,
  document_type,
  document_number,
  business_name,
  trade_name,
  contact_name,
  contact_position,
  email,
  phone,
  fiscal_address,
  geographic_zone,
  product_types,
  category,
  delivery_frequency,
  performance_rating,
  credit_condition,
  credit_days,
  currency,
  bank_name,
  sunat_status,
  notes,
  is_active,
  created_by,
  updated_by,
  created_at,
  updated_at
) on table public.suppliers to authenticated;
