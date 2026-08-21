-- Permite al cliente autenticado comprobar su propia sesión sin exponer
-- auth.sessions ni aceptar identificadores manipulables desde el navegador.
create function public.current_auth_session_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions session
    where session.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and session.user_id = auth.uid()
  );
$$;

revoke all on function public.current_auth_session_is_active()
from public, anon, authenticated;

grant execute on function public.current_auth_session_is_active()
to authenticated;

comment on function public.current_auth_session_is_active() is
  'Comprueba exclusivamente la sesión del JWT autenticado actual para revalidación del frontend.';
