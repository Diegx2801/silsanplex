-- Keep customer phone values usable across local and international formats.
-- Existing values are preserved; the constraint applies to new and changed rows.

alter table public.customer_contacts
  add constraint customer_contacts_phone_format
  check (
    nullif(btrim(phone), '') is null
    or (
      phone ~ '^\+?[0-9()\-\s]+$'
      and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 15
    )
  ) not valid;

comment on constraint customer_contacts_phone_format on public.customer_contacts is
  'Acepta formatos telefonicos legibles y exige entre 7 y 15 digitos reales.';
