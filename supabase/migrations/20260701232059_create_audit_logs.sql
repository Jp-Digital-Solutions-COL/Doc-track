-- audit_logs: registro append-only de accesos/acciones (subida, descarga,
-- aprobación, rechazo...). Nunca se actualiza ni se borra una fila.
-- Solo se guardan IDs y nombres de evento — nunca PII, contenido de archivos
-- ni nombres de archivo (ver CLAUDE.md, regla 6).

create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id        uuid, -- sin FK: puede ser un auth.users.id, un proveedor externo o NULL si actor_type = 'system'
  actor_type      text not null check (actor_type in ('user', 'supplier', 'system')),
  action          text not null,
  entity_type     text not null,
  entity_id       uuid,
  ip              inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);

comment on table public.audit_logs is 'Log append-only de acciones. Solo IDs y nombres de evento, nunca PII.';

create index if not exists audit_logs_organization_id_idx
  on public.audit_logs (organization_id);

create index if not exists audit_logs_organization_id_created_at_idx
  on public.audit_logs (organization_id, created_at desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id);

create index if not exists audit_logs_actor_id_idx
  on public.audit_logs (actor_id);

-- Solo select+insert, para todos los roles — ni siquiera service_role recibe
-- update/delete: append-only de verdad, no solo "por convención".
grant select, insert on public.audit_logs to authenticated;
grant select, insert on public.audit_logs to service_role;

alter table public.audit_logs enable row level security;

-- INSERT: cualquier miembro activo puede registrar una acción de su org.
create policy "audit_logs_insert_members"
  on public.audit_logs
  for insert
  to authenticated
  with check (public.is_member_of(organization_id));

-- SELECT: solo owner/admin pueden leer el log de auditoría.
create policy "audit_logs_select_admins"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_admin_of(organization_id));

-- Append-only: sin policies de UPDATE/DELETE (bloqueadas por defecto al no
-- existir), y además se revoca el privilegio a nivel de GRANT como defensa
-- en profundidad extra — ni siquiera con una policy mal escrita en el futuro
-- se podría modificar/borrar una fila ya escrita.
revoke update, delete on public.audit_logs from authenticated, anon, service_role;
