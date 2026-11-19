-- Administradores totales pueden registrar y confirmar costos reales
-- de reparación, igual que el resto de las capacidades operativas del rol.
begin;

insert into public.role_permissions (role_code, permission_code)
values
  ('ADMIN', 'REPAIRS_MANAGE_ACTUAL_COST'),
  ('ADMIN', 'REPAIRS_CONFIRM_ACTUAL_COST')
on conflict (role_code, permission_code) do nothing;

commit;
