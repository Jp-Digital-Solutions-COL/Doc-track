-- notifications: cola de alertas enviadas (documentos por vencer, proveedor
-- rechazado, etc). Las genera el server (Cron Trigger de Cloudflare / Server
-- Actions) con el service_role client, que ignora RLS — por eso no hay
-- policies de INSERT/UPDATE/DELETE para `authenticated`: quedan bloqueadas
-- por defecto.

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type            text not null,
  channel         text not null check (channel in ('email', 'in_app')),
  recipient       text not null,
  payload         jsonb not null default '{}'::jsonb,
  sent_at         timestamptz,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at      timestamptz not null default now()
);

comment on table public.notifications is 'Cola/historial de alertas enviadas por organización.';

create index if not exists notifications_organization_id_idx
  on public.notifications (organization_id);

create index if not exists notifications_organization_id_status_idx
  on public.notifications (organization_id, status);

create index if not exists notifications_sent_at_idx
  on public.notifications (sent_at);

grant select on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

alter table public.notifications enable row level security;

-- SELECT: cualquier miembro activo puede ver el historial de alertas de su
-- organización (p.ej. una bandeja de notificaciones en el dashboard).
create policy "notifications_select_members"
  on public.notifications
  for select
  to authenticated
  using (public.is_member_of(organization_id));
