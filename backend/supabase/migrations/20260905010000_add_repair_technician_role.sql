begin;

insert into public.roles (code, name, description)
values ('TECNICO_REPARACIONES', 'Técnico de reparaciones',
  'Consulta reparaciones y registra diagnósticos, soluciones y pruebas; permite avanzar su estado.');

insert into public.role_permissions (role_code, permission_code)
values
  ('TECNICO_REPARACIONES', 'REPAIRS_VIEW'),
  ('TECNICO_REPARACIONES', 'REPAIRS_CHANGE_STATUS'),
  ('TECNICO_REPARACIONES', 'REPAIRS_PERFORM_TECHNICAL');

commit;
