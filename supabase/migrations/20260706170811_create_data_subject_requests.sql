-- data_subject_requests: solicitudes de derechos del titular (Ley 1581 —
-- consulta, rectificación, supresión). due_date se calcula en el server al
-- insertar (lib/legal/data-subject-deadline.ts: 10 días calendario para
-- consulta, 15 para reclamo/rectificación/supresión) — se guarda como valor
-- fijo, no se recalcula, porque el plazo corre desde la fecha de radicación.
create table if not exists public.data_subject_requests (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  supplier_id         uuid references public.suppliers (id) on delete set null,
  submitted_by_user_id uuid references auth.users (id) on delete set null,
  requester_name      text not null,
  requester_email     text not null,
  request_type        text not null check (request_type in ('consulta', 'rectificacion', 'supresion')),
  details             text,
  status              text not null default 'pendiente'
                       check (status in ('pendiente', 'en_proceso', 'resuelta', 'rechazada')),
  resolution_notes    text,
  due_date            date not null,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now()
);

comment on table public.data_subject_requests is
  'Solicitudes de derechos del titular (consulta/rectificación/supresión) — Ley 1581.';

create index if not exists data_subject_requests_organization_id_idx
  on public.data_subject_requests (organization_id);

create index if not exists data_subject_requests_org_due_date_idx
  on public.data_subject_requests (organization_id, due_date);

-- INSERT: siempre vía cliente admin desde el server (scripts/actions ya
-- validan a mano quién puede radicar — puede venir de alguien SIN cuenta,
-- p.ej. el beneficiario final, así que RLS de authenticated no aplicaría de
-- todos modos). Mismo criterio que consent_records/invitations.
grant select, update on public.data_subject_requests to authenticated;
grant select, insert, update on public.data_subject_requests to service_role;

alter table public.data_subject_requests enable row level security;

-- SELECT/UPDATE: solo owner/admin de la org (bandeja de solicitudes).
create policy "data_subject_requests_select_admins"
  on public.data_subject_requests
  for select
  to authenticated
  using (public.is_admin_of(organization_id));

create policy "data_subject_requests_update_admins"
  on public.data_subject_requests
  for update
  to authenticated
  using (public.is_admin_of(organization_id))
  with check (public.is_admin_of(organization_id));

-- Sin DELETE: se conserva el historial de solicitudes resueltas/rechazadas.
revoke delete on public.data_subject_requests from authenticated, anon, service_role;
