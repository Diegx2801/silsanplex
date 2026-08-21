-- ============================================================
-- SILSANPLEX: seguridad y auditoría de la base logística
-- Commit 1: actores, auditoría, privilegios y RLS
-- ============================================================

-- Los usuarios autenticados no pueden decidir qué identidad queda registrada
-- como creador o modificador. Los scripts con service_role pueden proporcionar
-- un actor explícito cuando auth.uid() no exista.
create or replace function public.set_logistics_actor_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid;
begin
  actor_user_id := auth.uid();

  if tg_op = 'INSERT' then
    if actor_user_id is not null then
      new.created_by := actor_user_id;
      new.updated_by := actor_user_id;
    end if;
  else
    new.created_by := old.created_by;
    if actor_user_id is not null then
      new.updated_by := actor_user_id;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.set_logistics_actor_fields() from public;

create trigger marcas_set_actor_fields
before insert or update on public.marcas
for each row
execute function public.set_logistics_actor_fields();

create trigger productos_set_actor_fields
before insert or update on public.productos
for each row
execute function public.set_logistics_actor_fields();

-- Registra cambios de mantenedores y entidades de inventario en la estructura
-- audit_events existente. La función es security definer porque authenticated
-- no tiene INSERT directo sobre audit_events.
create or replace function public.log_logistics_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id_value uuid;
  entity_id_value text;
  old_values_value jsonb;
  new_values_value jsonb;
  action_value text;
begin
  if tg_op = 'DELETE' then
    organization_id_value := old.organization_id;
    entity_id_value := old.id::text;
    old_values_value := to_jsonb(old);
    new_values_value := null;
    action_value := 'LOGISTICS_DELETED';
  elsif tg_op = 'UPDATE' then
    organization_id_value := new.organization_id;
    entity_id_value := new.id::text;
    old_values_value := to_jsonb(old);
    new_values_value := to_jsonb(new);
    action_value := 'LOGISTICS_UPDATED';
  else
    organization_id_value := new.organization_id;
    entity_id_value := new.id::text;
    old_values_value := null;
    new_values_value := to_jsonb(new);
    action_value := 'LOGISTICS_CREATED';
  end if;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    metadata
  )
  values (
    organization_id_value,
    auth.uid(),
    action_value,
    tg_table_name,
    entity_id_value,
    old_values_value,
    new_values_value,
    jsonb_build_object('source', 'log_logistics_audit_event')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.log_logistics_audit_event() from public;

create trigger marcas_audit_event
after insert or update or delete on public.marcas
for each row
execute function public.log_logistics_audit_event();

create trigger lineas_audit_event
after insert or update or delete on public.lineas
for each row
execute function public.log_logistics_audit_event();

create trigger sublineas_audit_event
after insert or update or delete on public.sublineas
for each row
execute function public.log_logistics_audit_event();

create trigger unidades_medida_audit_event
after insert or update or delete on public.unidades_medida
for each row
execute function public.log_logistics_audit_event();

create trigger productos_audit_event
after insert or update or delete on public.productos
for each row
execute function public.log_logistics_audit_event();

create trigger almacenes_audit_event
after insert or update or delete on public.almacenes
for each row
execute function public.log_logistics_audit_event();

create trigger ubicaciones_audit_event
after insert or update or delete on public.ubicaciones
for each row
execute function public.log_logistics_audit_event();

create trigger lotes_audit_event
after insert or update or delete on public.lotes
for each row
execute function public.log_logistics_audit_event();

-- Los movimientos no tienen UPDATE ni DELETE. Solo se audita su creación.
create trigger movimientos_inventario_audit_event
after insert on public.movimientos_inventario
for each row
execute function public.log_logistics_audit_event();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.marcas enable row level security;
alter table public.lineas enable row level security;
alter table public.sublineas enable row level security;
alter table public.unidades_medida enable row level security;
alter table public.productos enable row level security;
alter table public.almacenes enable row level security;
alter table public.ubicaciones enable row level security;
alter table public.lotes enable row level security;
alter table public.movimientos_inventario enable row level security;

create policy marcas_select_member
on public.marcas
for select to authenticated
using (public.is_organization_member(organization_id));

create policy marcas_insert_member
on public.marcas
for insert to authenticated
with check (public.is_organization_member(organization_id));

create policy marcas_update_member
on public.marcas
for update to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy lineas_select_member
on public.lineas
for select to authenticated
using (public.is_organization_member(organization_id));

create policy lineas_insert_member
on public.lineas
for insert to authenticated
with check (public.is_organization_member(organization_id));

create policy lineas_update_member
on public.lineas
for update to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy sublineas_select_member
on public.sublineas
for select to authenticated
using (public.is_organization_member(organization_id));

create policy sublineas_insert_member
on public.sublineas
for insert to authenticated
with check (public.is_organization_member(organization_id));

create policy sublineas_update_member
on public.sublineas
for update to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy unidades_medida_select_member
on public.unidades_medida
for select to authenticated
using (public.is_organization_member(organization_id));

create policy unidades_medida_insert_member
on public.unidades_medida
for insert to authenticated
with check (public.is_organization_member(organization_id));

create policy unidades_medida_update_member
on public.unidades_medida
for update to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy productos_select_member
on public.productos
for select to authenticated
using (public.is_organization_member(organization_id));

create policy productos_insert_member
on public.productos
for insert to authenticated
with check (public.is_organization_member(organization_id));

create policy productos_update_member
on public.productos
for update to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy almacenes_select_member
on public.almacenes
for select to authenticated
using (public.is_organization_member(organization_id));

create policy almacenes_insert_member
on public.almacenes
for insert to authenticated
with check (public.is_organization_member(organization_id));

create policy almacenes_update_member
on public.almacenes
for update to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy ubicaciones_select_member
on public.ubicaciones
for select to authenticated
using (public.is_organization_member(organization_id));

create policy ubicaciones_insert_member
on public.ubicaciones
for insert to authenticated
with check (public.is_organization_member(organization_id));

create policy ubicaciones_update_member
on public.ubicaciones
for update to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy lotes_select_member
on public.lotes
for select to authenticated
using (public.is_organization_member(organization_id));

create policy lotes_insert_member
on public.lotes
for insert to authenticated
with check (public.is_organization_member(organization_id));

create policy lotes_update_member
on public.lotes
for update to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy movimientos_inventario_select_member
on public.movimientos_inventario
for select to authenticated
using (public.is_organization_member(organization_id));

create policy movimientos_inventario_insert_member
on public.movimientos_inventario
for insert to authenticated
with check (
  public.is_organization_member(organization_id)
  and usuario_id = auth.uid()
);

-- ------------------------------------------------------------
-- Privilegios
-- ------------------------------------------------------------

revoke all on table
  public.marcas,
  public.lineas,
  public.sublineas,
  public.unidades_medida,
  public.productos,
  public.almacenes,
  public.ubicaciones,
  public.lotes,
  public.movimientos_inventario
from anon, authenticated, service_role;

grant select, insert, update on table
  public.marcas,
  public.lineas,
  public.sublineas,
  public.unidades_medida,
  public.productos,
  public.almacenes,
  public.ubicaciones,
  public.lotes
to authenticated, service_role;

grant select, insert on table public.movimientos_inventario
to authenticated, service_role;

comment on table public.movimientos_inventario is
  'Append-only para authenticated y service_role; las correcciones futuras deben generar movimientos compensatorios.';

comment on policy movimientos_inventario_insert_member
on public.movimientos_inventario is
  'Solo un miembro activo puede registrar movimientos de su organización y debe quedar como usuario responsable.';
