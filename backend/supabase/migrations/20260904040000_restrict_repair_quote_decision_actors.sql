begin;

-- Quote decisions require a real authenticated actor: approved_by/rejected_by
-- and the audit trail cannot be populated by a service JWT without a subject.
-- No delegated-actor API is defined. Remove this unsupported integration path
-- instead of weakening the actor constraints or accepting an unvalidated UUID.
revoke all on function public.approve_repair_quote(uuid, uuid, uuid, text, bigint)
  from public, anon, service_role;
revoke all on function public.reject_repair_quote(uuid, uuid, uuid, text, bigint)
  from public, anon, service_role;

grant execute on function public.approve_repair_quote(uuid, uuid, uuid, text, bigint)
  to authenticated;
grant execute on function public.reject_repair_quote(uuid, uuid, uuid, text, bigint)
  to authenticated;

-- Keep implementation functions private as well.
revoke all on function public.approve_repair_quote_unchecked(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reject_repair_quote_unchecked(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

comment on function public.approve_repair_quote(uuid, uuid, uuid, text, bigint) is
  'Solo authenticated con sesión activa y REPAIRS_APPROVE_QUOTE. El actor se obtiene de auth.uid(); service_role no está admitido.';
comment on function public.reject_repair_quote(uuid, uuid, uuid, text, bigint) is
  'Solo authenticated con sesión activa y REPAIRS_APPROVE_QUOTE. El actor se obtiene de auth.uid(); service_role no está admitido.';

commit;
