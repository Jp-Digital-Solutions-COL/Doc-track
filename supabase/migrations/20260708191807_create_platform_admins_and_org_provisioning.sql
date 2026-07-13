-- platform_admins: superadmins de la plataforma (JP Digital Solutions), NO
-- de una organización particular — pueden crear organizaciones e invitar a
-- su primer owner/admin. Bootstrap deliberadamente manual: no hay policy de
-- INSERT para authenticated, solo service_role puede agregar un superadmin
-- (evita que esto sea auto-otorgable desde la app).
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.platform_admins is
  'Superadmins de la plataforma — pueden crear organizaciones e invitar a su primer owner/admin.';

grant select on public.platform_admins to authenticated;
grant select, insert, update, delete on public.platform_admins to service_role;

alter table public.platform_admins enable row level security;

create policy "platform_admins_select_self"
  on public.platform_admins
  for select
  to authenticated
  using (user_id = auth.uid());

-- Helper compartido — mismo patrón que is_member_of/is_admin_of (SECURITY
-- DEFINER para poder usarse dentro de policies sin recursión). `language sql`
-- es válido acá porque platform_admins ya existe en este mismo archivo antes
-- de esta definición.
create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

comment on function public.is_superadmin() is
  'True si auth.uid() es superadmin de la plataforma.';

revoke execute on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;

-- org_provision_invitations: invitación para crear el primer owner/admin de
-- una organización recién creada por un superadmin. Mismo patrón que
-- `invitations` (token aleatorio hasheado, 72h, un solo uso) pero para
-- provisionar la organización en sí, no un proveedor.
create table if not exists public.org_provision_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email           text not null,
  role            text not null check (role in ('owner', 'admin')),
  token_hash      text not null,
  invited_by      uuid not null references auth.users (id),
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists org_provision_invitations_organization_id_idx
  on public.org_provision_invitations (organization_id);

-- INSERT/UPDATE (marcar used_at) corren con el cliente admin desde el server
-- (mismo criterio que `invitations`/`consent_records`: son flujos pre-auth o
-- privilegiados) — por eso no hay policy de esos comandos para authenticated.
grant select on public.org_provision_invitations to authenticated;
grant select, insert, update on public.org_provision_invitations to service_role;

alter table public.org_provision_invitations enable row level security;

create policy "org_provision_invitations_select_superadmin"
  on public.org_provision_invitations
  for select
  to authenticated
  using (public.is_superadmin());
