-- organization_members: usuarios internos de la empresa (equipo que revisa
-- documentos), vinculados 1-a-1 con auth.users.

create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('owner', 'admin', 'reviewer')),
  status          text not null default 'active' check (status in ('active', 'suspended')),
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

comment on table public.organization_members is 'Datos internos: quién pertenece a qué organización y con qué rol.';

create index if not exists organization_members_organization_id_idx
  on public.organization_members (organization_id);

create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id);

grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.organization_members to service_role;

alter table public.organization_members enable row level security;

-- SELECT: solo miembros de la misma org (datos internos).
create policy "organization_members_select_members"
  on public.organization_members
  for select
  to authenticated
  using (public.is_member_of(organization_id));

-- Escritura (INSERT/UPDATE/DELETE): solo owner/admin, y siempre dentro de su
-- propia org (WITH CHECK impide moverlos o crearlos en otra organización).
create policy "organization_members_insert_admins"
  on public.organization_members
  for insert
  to authenticated
  with check (public.is_admin_of(organization_id));

create policy "organization_members_update_admins"
  on public.organization_members
  for update
  to authenticated
  using (public.is_admin_of(organization_id))
  with check (public.is_admin_of(organization_id));

create policy "organization_members_delete_admins"
  on public.organization_members
  for delete
  to authenticated
  using (public.is_admin_of(organization_id));
