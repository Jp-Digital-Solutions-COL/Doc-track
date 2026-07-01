-- invitations: acceso seguro del proveedor (link con token para que el
-- proveedor suba sus documentos sin necesitar cuenta previa).
-- Tratada como "dato interno": solo owner/admin puede verla o gestionarla,
-- porque expone a quién se invitó y controla quién obtiene acceso externo
-- al tenant — no es información operativa de consulta libre para reviewers.

create table if not exists public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id     uuid not null references public.suppliers (id) on delete cascade,
  email           text not null,
  token_hash      text not null unique, -- sha256 del token; el token en claro nunca se persiste
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.invitations is 'Invitaciones de acceso para proveedores externos (token hasheado).';

create index if not exists invitations_organization_id_idx
  on public.invitations (organization_id);

create index if not exists invitations_supplier_id_idx
  on public.invitations (supplier_id);

create index if not exists invitations_expires_at_idx
  on public.invitations (expires_at);

grant select, insert, update, delete on public.invitations to authenticated;
grant select, insert, update, delete on public.invitations to service_role;

alter table public.invitations enable row level security;

create policy "invitations_select_admins"
  on public.invitations
  for select
  to authenticated
  using (public.is_admin_of(organization_id));

create policy "invitations_insert_admins"
  on public.invitations
  for insert
  to authenticated
  with check (public.is_admin_of(organization_id));

create policy "invitations_update_admins"
  on public.invitations
  for update
  to authenticated
  using (public.is_admin_of(organization_id))
  with check (public.is_admin_of(organization_id));

create policy "invitations_delete_admins"
  on public.invitations
  for delete
  to authenticated
  using (public.is_admin_of(organization_id));

-- Nota: cuando el proveedor usa el link, la validación del token pasa por el
-- server con el admin client (busca por token_hash, no por sesión de
-- Supabase) — el proveedor externo no es un `authenticated` de este
-- proyecto, así que estas policies no lo cubren ni lo necesitan cubrir.
