-- Panel de superadmin: bloquear/desbloquear una organización, y un registro
-- de auditoría a nivel de PLATAFORMA (no de tenant) para las acciones del
-- superadmin sobre organizaciones (crear/editar/bloquear/invitar/borrar).
alter table public.organizations
  add column status text not null default 'active' check (status in ('active', 'blocked'));

-- platform_audit_logs: deliberadamente SIN foreign key a organizations en
-- entity_id — así el registro de "se borró la organización X" sobrevive al
-- propio borrado (audit_logs normal SÍ tiene on delete cascade a
-- organization_id, así que un borrado real de organización se llevaría por
-- delante su propio rastro de auditoría si se usara esa tabla para esto).
create table if not exists public.platform_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references auth.users (id),
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  created_at  timestamptz not null default now()
);

comment on table public.platform_audit_logs is
  'Auditoría de acciones de superadmin sobre organizaciones — independiente de audit_logs (por tenant) para que sobreviva el borrado de una organización.';

create index if not exists platform_audit_logs_entity_idx
  on public.platform_audit_logs (entity_type, entity_id);

grant select, insert on public.platform_audit_logs to authenticated;
grant select, insert on public.platform_audit_logs to service_role;

alter table public.platform_audit_logs enable row level security;

create policy "platform_audit_logs_select_superadmin"
  on public.platform_audit_logs
  for select
  to authenticated
  using (public.is_superadmin());

create policy "platform_audit_logs_insert_superadmin"
  on public.platform_audit_logs
  for insert
  to authenticated
  with check (public.is_superadmin() and actor_id = auth.uid());

-- Append-only, mismo criterio que audit_logs.
revoke update, delete on public.platform_audit_logs from authenticated, anon, service_role;

-- RLS: superadmin puede leer/editar/borrar CUALQUIER organización (no es
-- miembro de ninguna, is_member_of() no le serviría). INSERT sigue sin
-- policy para authenticated a propósito — la creación de organizaciones
-- sigue corriendo por el cliente admin (igual que signup()), sin cambios.
create policy "organizations_select_superadmin"
  on public.organizations
  for select
  to authenticated
  using (public.is_superadmin());

create policy "organizations_update_superadmin"
  on public.organizations
  for update
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy "organizations_delete_superadmin"
  on public.organizations
  for delete
  to authenticated
  using (public.is_superadmin());

grant delete on public.organizations to authenticated;
