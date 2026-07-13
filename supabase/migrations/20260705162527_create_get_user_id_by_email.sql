-- get_user_id_by_email: lookup exacto de auth.users por email.
--
-- Por qué existe: admin.auth.admin.listUsers({ filter }) NO filtra de
-- verdad en esta versión de GoTrue (verificado empíricamente: con varios
-- usuarios existentes, siempre devuelve el mismo resultado sin importar el
-- filtro). Esta función SQL hace el lookup exacto directamente contra
-- auth.users, que sí está indexado por email.

create or replace function public.get_user_id_by_email(lookup_email text)
returns uuid
language sql
security definer
set search_path = public, pg_temp, auth
stable
as $$
  select id from auth.users where email = lower(lookup_email) limit 1;
$$;

comment on function public.get_user_id_by_email(text) is
  'Lookup exacto de auth.users.id por email. Solo para uso server-side vía admin client.';

-- Sin grant a `authenticated`/`anon`: sería un oráculo para enumerar qué
-- correos tienen cuenta. Solo se llama con el service_role client (que
-- igual necesita el grant explícito — bypassrls no incluye EXECUTE).
revoke execute on function public.get_user_id_by_email(text) from public;
grant execute on function public.get_user_id_by_email(text) to service_role;
