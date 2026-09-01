-- La tabla conserva únicamente trazas históricas de migración y no es parte
-- de la API de la aplicación. Se protege con RLS como defensa adicional, sin
-- crear políticas: solo el rol postgres (propietario/bypassrls) la administra.
alter table public.legacy_model_migration_trace
  enable row level security;

revoke all on table public.legacy_model_migration_trace
  from anon, authenticated, service_role;
