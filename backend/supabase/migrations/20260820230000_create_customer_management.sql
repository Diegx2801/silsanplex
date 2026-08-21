-- ============================================================
-- SILSANPLEX: maestro multiempresa de clientes
-- ============================================================

insert into public.permissions (code, name, description)
values
  ('CUSTOMERS_VIEW', 'Consultar clientes', 'Consultar el directorio comercial de la organización.'),
  ('CUSTOMERS_MANAGE', 'Gestionar clientes', 'Registrar, editar, activar y desactivar clientes.'),
  ('CUSTOMERS_EXPORT', 'Exportar clientes', 'Exportar el directorio comercial autorizado.')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
values
  ('ADMIN', 'CUSTOMERS_VIEW'),
  ('ADMIN', 'CUSTOMERS_MANAGE'),
  ('ADMIN', 'CUSTOMERS_EXPORT'),
  ('VENTAS', 'CUSTOMERS_VIEW'),
  ('VENTAS', 'CUSTOMERS_MANAGE'),
  ('VENTAS', 'CUSTOMERS_EXPORT'),
  ('GERENCIA', 'CUSTOMERS_VIEW'),
  ('GERENCIA', 'CUSTOMERS_EXPORT')
on conflict do nothing;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_type text not null,
  document_number text not null,
  legal_name text not null,
  trade_name text,
  taxpayer_status text,
  domicile_condition text,
  tax_data_source text,
  tax_checked_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customers_document_type_valid
    check (document_type in ('RUC', 'DNI', 'CE', 'OTHER')),
  constraint customers_document_number_not_blank
    check (char_length(btrim(document_number)) between 1 and 20),
  constraint customers_legal_name_not_blank
    check (char_length(btrim(legal_name)) between 2 and 160),
  constraint customers_trade_name_length
    check (trade_name is null or char_length(trade_name) <= 120),
  constraint customers_ruc_format
    check (document_type <> 'RUC' or document_number ~ '^[0-9]{11}$'),
  constraint customers_dni_format
    check (document_type <> 'DNI' or document_number ~ '^[0-9]{8}$'),
  constraint customers_tax_status_length
    check (taxpayer_status is null or char_length(taxpayer_status) <= 40),
  constraint customers_domicile_condition_length
    check (domicile_condition is null or char_length(domicile_condition) <= 40),
  constraint customers_organization_id_id_key unique (organization_id, id)
);

create unique index customers_organization_document_uidx
  on public.customers (organization_id, document_type, document_number);
create index customers_organization_active_name_idx
  on public.customers (organization_id, is_active, legal_name, id);
create index customers_organization_tax_condition_idx
  on public.customers (organization_id, domicile_condition)
  where domicile_condition is not null;

create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null,
  address_type text not null,
  label text,
  address_line text not null,
  ubigeo_code text,
  reference text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customer_addresses_type_valid
    check (address_type in ('FISCAL', 'DELIVERY')),
  constraint customer_addresses_line_not_blank
    check (char_length(btrim(address_line)) between 3 and 240),
  constraint customer_addresses_label_length
    check (label is null or char_length(label) <= 80),
  constraint customer_addresses_ubigeo_format
    check (ubigeo_code is null or ubigeo_code ~ '^[0-9]{6}$'),
  constraint customer_addresses_reference_length
    check (reference is null or char_length(reference) <= 200),
  constraint customer_addresses_same_organization
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict
);

create unique index customer_addresses_one_active_fiscal_idx
  on public.customer_addresses (customer_id)
  where address_type = 'FISCAL' and is_active;
create unique index customer_addresses_one_default_delivery_idx
  on public.customer_addresses (customer_id)
  where address_type = 'DELIVERY' and is_default and is_active;
create index customer_addresses_customer_active_idx
  on public.customer_addresses (customer_id, is_active, address_type);

create trigger customer_addresses_set_updated_at
before update on public.customer_addresses
for each row execute function public.set_updated_at();

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null,
  full_name text,
  email text,
  phone text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customer_contacts_has_data
    check (
      nullif(btrim(coalesce(full_name, '')), '') is not null
      or nullif(btrim(coalesce(email, '')), '') is not null
      or nullif(btrim(coalesce(phone, '')), '') is not null
    ),
  constraint customer_contacts_name_length
    check (full_name is null or char_length(full_name) <= 120),
  constraint customer_contacts_email_length
    check (email is null or char_length(email) <= 254),
  constraint customer_contacts_phone_length
    check (phone is null or char_length(phone) <= 30),
  constraint customer_contacts_same_organization
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict
);

create unique index customer_contacts_one_active_primary_idx
  on public.customer_contacts (customer_id)
  where is_primary and is_active;
create index customer_contacts_customer_active_idx
  on public.customer_contacts (customer_id, is_active);

create trigger customer_contacts_set_updated_at
before update on public.customer_contacts
for each row execute function public.set_updated_at();

create or replace function public.has_organization_permission(
  requested_organization_id uuid,
  requested_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    join public.organizations organization on organization.id = membership.organization_id
    join public.user_roles user_role
      on user_role.organization_id = membership.organization_id
      and user_role.user_id = membership.user_id
    join public.roles role on role.code = user_role.role_code and role.is_active
    join public.role_permissions role_permission on role_permission.role_code = role.code
    join public.permissions permission
      on permission.code = role_permission.permission_code
      and permission.is_active
    where membership.user_id = auth.uid()
      and membership.organization_id = requested_organization_id
      and membership.is_active
      and profile.is_active
      and organization.is_active
      and permission.code = requested_permission_code
  );
$$;

create or replace function public.current_organization_for_permission(
  requested_permission text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_id uuid;
begin
  select membership.organization_id into resolved_id
  from public.organization_memberships membership
  where membership.user_id = auth.uid()
    and membership.is_active
    and public.has_organization_permission(membership.organization_id, requested_permission)
  limit 1;

  if resolved_id is null then
    raise exception using errcode = '42501', message = 'CUSTOMER_PERMISSION_REQUIRED';
  end if;
  return resolved_id;
end;
$$;

create or replace function public.save_customer(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_customer_id uuid;
  previous_customer jsonb;
  address_item jsonb;
  contact_item jsonb;
  item_id uuid;
  seen_address_ids uuid[] := array[]::uuid[];
  seen_contact_ids uuid[] := array[]::uuid[];
  violated_constraint text;
  normalized_document_type text := upper(btrim(payload->>'documentType'));
  normalized_document_number text := upper(regexp_replace(btrim(payload->>'documentNumber'), '\s+', '', 'g'));
  normalized_legal_name text := btrim(payload->>'legalName');
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  v_organization_id := public.current_organization_for_permission('CUSTOMERS_MANAGE');

  if normalized_document_type not in ('RUC', 'DNI', 'CE', 'OTHER') then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_DOCUMENT_TYPE';
  end if;
  if normalized_legal_name is null or char_length(normalized_legal_name) < 2 then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_LEGAL_NAME';
  end if;

  v_customer_id := nullif(payload->>'id', '')::uuid;
  if v_customer_id is not null then
    select to_jsonb(customer) into previous_customer
    from public.customers customer
    where customer.id = v_customer_id and customer.organization_id = v_organization_id
    for update;
    if previous_customer is null then
      raise exception using errcode = 'P0002', message = 'CUSTOMER_NOT_FOUND';
    end if;
  else
    v_customer_id := gen_random_uuid();
  end if;

  insert into public.customers (
    id, organization_id, document_type, document_number, legal_name, trade_name,
    taxpayer_status, domicile_condition, tax_data_source, tax_checked_at,
    is_active, created_by, updated_by
  ) values (
    v_customer_id, v_organization_id, normalized_document_type, normalized_document_number,
    normalized_legal_name, nullif(btrim(payload->>'tradeName'), ''),
    nullif(upper(btrim(payload->>'taxpayerStatus')), ''),
    nullif(upper(btrim(payload->>'domicileCondition')), ''),
    nullif(btrim(payload->>'taxDataSource'), ''),
    nullif(payload->>'taxCheckedAt', '')::timestamptz,
    coalesce((payload->>'isActive')::boolean, true), actor_id, actor_id
  )
  on conflict (id) do update set
    document_type = excluded.document_type,
    document_number = excluded.document_number,
    legal_name = excluded.legal_name,
    trade_name = excluded.trade_name,
    taxpayer_status = excluded.taxpayer_status,
    domicile_condition = excluded.domicile_condition,
    tax_data_source = excluded.tax_data_source,
    tax_checked_at = excluded.tax_checked_at,
    is_active = excluded.is_active,
    updated_by = actor_id;

  for address_item in select value from jsonb_array_elements(coalesce(payload->'addresses', '[]'::jsonb))
  loop
    item_id := nullif(address_item->>'id', '')::uuid;
    if item_id is null and upper(address_item->>'addressType') = 'FISCAL' then
      select existing.id into item_id
      from public.customer_addresses existing
      where existing.customer_id = v_customer_id
        and existing.organization_id = v_organization_id
        and existing.address_type = 'FISCAL'
        and existing.is_active
      for update;
    end if;
    item_id := coalesce(item_id, gen_random_uuid());
    if nullif(btrim(address_item->>'addressLine'), '') is null then continue; end if;

    if nullif(address_item->>'id', '') is not null and exists (
      select 1 from public.customer_addresses existing
      where existing.id = item_id
        and (existing.customer_id <> v_customer_id or existing.organization_id <> v_organization_id)
    ) then
      raise exception using errcode = '42501', message = 'CUSTOMER_ADDRESS_NOT_OWNED';
    end if;

    update public.customer_addresses set
      address_type = upper(address_item->>'addressType'),
      label = nullif(btrim(address_item->>'label'), ''),
      address_line = btrim(address_item->>'addressLine'),
      ubigeo_code = nullif(btrim(address_item->>'ubigeoCode'), ''),
      reference = nullif(btrim(address_item->>'reference'), ''),
      is_default = coalesce((address_item->>'isDefault')::boolean, false),
      is_active = true
    where customer_addresses.id = item_id
      and customer_addresses.customer_id = v_customer_id
      and customer_addresses.organization_id = v_organization_id;

    if not found then
      insert into public.customer_addresses (
        id, organization_id, customer_id, address_type, label, address_line,
        ubigeo_code, reference, is_default
      ) values (
        item_id, v_organization_id, v_customer_id, upper(address_item->>'addressType'),
        nullif(btrim(address_item->>'label'), ''), btrim(address_item->>'addressLine'),
        nullif(btrim(address_item->>'ubigeoCode'), ''),
        nullif(btrim(address_item->>'reference'), ''),
        coalesce((address_item->>'isDefault')::boolean, false)
      );
    end if;
    seen_address_ids := array_append(seen_address_ids, item_id);
  end loop;

  update public.customer_addresses address
  set is_active = false, is_default = false
  where address.customer_id = v_customer_id
    and address.organization_id = v_organization_id
    and not (address.id = any(seen_address_ids));

  for contact_item in select value from jsonb_array_elements(coalesce(payload->'contacts', '[]'::jsonb))
  loop
    if nullif(btrim(coalesce(contact_item->>'fullName', '')), '') is null
      and nullif(btrim(coalesce(contact_item->>'email', '')), '') is null
      and nullif(btrim(coalesce(contact_item->>'phone', '')), '') is null then continue; end if;
    item_id := nullif(contact_item->>'id', '')::uuid;
    if item_id is null and coalesce((contact_item->>'isPrimary')::boolean, false) then
      select existing.id into item_id
      from public.customer_contacts existing
      where existing.customer_id = v_customer_id
        and existing.organization_id = v_organization_id
        and existing.is_primary
        and existing.is_active
      for update;
    end if;
    item_id := coalesce(item_id, gen_random_uuid());

    if nullif(contact_item->>'id', '') is not null and exists (
      select 1 from public.customer_contacts existing
      where existing.id = item_id
        and (existing.customer_id <> v_customer_id or existing.organization_id <> v_organization_id)
    ) then
      raise exception using errcode = '42501', message = 'CUSTOMER_CONTACT_NOT_OWNED';
    end if;

    update public.customer_contacts set
      full_name = nullif(btrim(contact_item->>'fullName'), ''),
      email = nullif(lower(btrim(contact_item->>'email')), ''),
      phone = nullif(btrim(contact_item->>'phone'), ''),
      is_primary = coalesce((contact_item->>'isPrimary')::boolean, false),
      is_active = true
    where customer_contacts.id = item_id
      and customer_contacts.customer_id = v_customer_id
      and customer_contacts.organization_id = v_organization_id;

    if not found then
      insert into public.customer_contacts (
        id, organization_id, customer_id, full_name, email, phone, is_primary
      ) values (
        item_id, v_organization_id, v_customer_id,
        nullif(btrim(contact_item->>'fullName'), ''),
        nullif(lower(btrim(contact_item->>'email')), ''),
        nullif(btrim(contact_item->>'phone'), ''),
        coalesce((contact_item->>'isPrimary')::boolean, false)
      );
    end if;
    seen_contact_ids := array_append(seen_contact_ids, item_id);
  end loop;

  update public.customer_contacts contact
  set is_active = false, is_primary = false
  where contact.customer_id = v_customer_id
    and contact.organization_id = v_organization_id
    and not (contact.id = any(seen_contact_ids));

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, old_values, new_values
  ) values (
    v_organization_id, actor_id,
    case when previous_customer is null then 'CUSTOMER_CREATED' else 'CUSTOMER_UPDATED' end,
    'customer', v_customer_id::text, previous_customer,
    (select to_jsonb(customer) from public.customers customer where customer.id = v_customer_id)
  );

  return v_customer_id;
exception
  when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'customers_organization_document_uidx' then
      raise exception using errcode = '23505', message = 'CUSTOMER_DOCUMENT_ALREADY_EXISTS';
    end if;
    raise;
end;
$$;

create or replace function public.set_customer_status(requested_customer_id uuid, requested_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  previous_customer jsonb;
begin
  v_organization_id := public.current_organization_for_permission('CUSTOMERS_MANAGE');
  select to_jsonb(customer) into previous_customer
  from public.customers customer
  where customer.id = requested_customer_id and customer.organization_id = v_organization_id
  for update;
  if previous_customer is null then
    raise exception using errcode = 'P0002', message = 'CUSTOMER_NOT_FOUND';
  end if;

  update public.customers
  set is_active = requested_active, updated_by = auth.uid()
  where id = requested_customer_id and customers.organization_id = v_organization_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, old_values, new_values
  ) values (
    v_organization_id, auth.uid(),
    case when requested_active then 'CUSTOMER_ACTIVATED' else 'CUSTOMER_DEACTIVATED' end,
    'customer', requested_customer_id::text, previous_customer,
    (select to_jsonb(customer) from public.customers customer where customer.id = requested_customer_id)
  );
end;
$$;

alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.customer_contacts enable row level security;

create policy customers_select_authorized on public.customers
for select to authenticated
using (public.has_organization_permission(organization_id, 'CUSTOMERS_VIEW'));

create policy customer_addresses_select_authorized on public.customer_addresses
for select to authenticated
using (public.has_organization_permission(organization_id, 'CUSTOMERS_VIEW'));

create policy customer_contacts_select_authorized on public.customer_contacts
for select to authenticated
using (public.has_organization_permission(organization_id, 'CUSTOMERS_VIEW'));

revoke all on table public.customers, public.customer_addresses, public.customer_contacts
  from anon, authenticated;
grant select on table public.customers, public.customer_addresses, public.customer_contacts
  to authenticated;
grant select, insert, update on table public.customers, public.customer_addresses, public.customer_contacts
  to service_role;

revoke all on function public.has_organization_permission(uuid, text) from public, anon;
revoke all on function public.current_organization_for_permission(text) from public, anon;
revoke all on function public.save_customer(jsonb) from public, anon;
revoke all on function public.set_customer_status(uuid, boolean) from public, anon;
grant execute on function public.has_organization_permission(uuid, text) to authenticated;
grant execute on function public.current_organization_for_permission(text) to authenticated;
grant execute on function public.save_customer(jsonb) to authenticated;
grant execute on function public.set_customer_status(uuid, boolean) to authenticated;

comment on table public.customers is 'Maestro fiscal y comercial de clientes aislado por organización.';
comment on table public.customer_addresses is 'Direcciones fiscales y de entrega históricas de un cliente.';
comment on table public.customer_contacts is 'Contactos operativos reutilizables de un cliente.';
