-- organizations: un tenant por empresa cliente (AQUIA, etc.)
-- No lleva organization_id (ES la organización), pero sigue las mismas
-- reglas de uuid + RLS que el resto de tablas.

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  nit        text not null unique,
  plan       text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  created_at timestamptz not null default now()
);

comment on table public.organizations is 'Tenants: empresas cliente del SaaS.';

-- ---------------------------------------------------------------------------
-- Helpers compartidos por TODAS las políticas RLS del proyecto.
--
-- Viven aquí (antes de que exista organization_members) porque son
-- `language plpgsql`: Postgres NO valida los nombres de tabla/columna del
-- cuerpo de una función plpgsql al crearla (a diferencia de `language sql`),
-- solo la sintaxis. Solo se resuelven en tiempo de ejecución, momento en el
-- que organization_members ya existe (se crea en la siguiente migración).
-- SECURITY DEFINER: corren con los privilegios del owner de la función, no
-- los del usuario que hace la consulta. Esto evita que la propia policy de
-- organization_members se vuelva recursiva/bloquee al intentar leerse a sí
-- misma a través de RLS.
-- ---------------------------------------------------------------------------

create or replace function public.is_member_of(org uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  return exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
end;
$$;

comment on function public.is_member_of(uuid) is
  'True si auth.uid() es miembro ACTIVO de la organización dada.';

create or replace function public.is_admin_of(org uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  return exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
end;
$$;

comment on function public.is_admin_of(uuid) is
  'True si auth.uid() es owner/admin ACTIVO de la organización dada.';

-- Solo el rol de la app (authenticated) necesita poder ejecutar estas
-- funciones dentro de las policies; quitamos el EXECUTE que Postgres
-- concede a PUBLIC por defecto.
revoke execute on function public.is_member_of(uuid) from public;
revoke execute on function public.is_admin_of(uuid) from public;
grant execute on function public.is_member_of(uuid) to authenticated;
grant execute on function public.is_admin_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS de organizations
-- ---------------------------------------------------------------------------

-- GRANT es una capa aparte de RLS: sin esto, `authenticated`/`service_role`
-- reciben "permission denied" ANTES de que la policy siquiera se evalúe.
-- service_role tiene bypassrls=true pero igual necesita el GRANT base.
grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organizations to service_role;

alter table public.organizations enable row level security;

-- SELECT: cualquier miembro activo puede ver los datos de su propia org.
create policy "organizations_select_members"
  on public.organizations
  for select
  to authenticated
  using (public.is_member_of(id));

-- UPDATE: solo owner/admin pueden cambiar nombre/nit/plan de su org.
create policy "organizations_update_admins"
  on public.organizations
  for update
  to authenticated
  using (public.is_admin_of(id))
  with check (public.is_admin_of(id));

-- Sin políticas de INSERT/DELETE: crear/borrar una organización es una
-- operación privilegiada que solo corre en el server con el service_role
-- client (ver lib/supabase/admin.ts), nunca directamente desde el cliente.
-- Con RLS activada y sin policy para esas acciones, quedan bloqueadas por
-- defecto para los roles `authenticated`/`anon`.
