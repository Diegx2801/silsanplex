-- Keep fiscal table reads behind the authorized, projected RPC contract.
-- RLS and the existing policies remain as defense in depth; no function grants change.
revoke select on table
  public.electronic_issuer_profiles,
  public.electronic_document_series,
  public.electronic_documents,
  public.electronic_document_items,
  public.electronic_document_commands,
  public.electronic_document_outbox
from authenticated;
