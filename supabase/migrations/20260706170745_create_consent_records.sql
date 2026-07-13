-- consent_records: evidencia de la autorización de tratamiento de datos
-- (Ley 1581 de 2012) — fecha, versión de política aceptada y finalidad,
-- capturada al registrar la empresa (owner) y al aceptar una invitación
-- (contacto de proveedor). Append-only: una aceptación es un hecho histórico,
-- nunca se edita ni se borra (mismo criterio que audit_logs).
create table if not exists public.consent_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subject_type    text not null check (subject_type in ('org_owner', 'supplier_contact')),
  user_id         uuid not null references auth.users (id) on delete cascade,
  supplier_id     uuid references public.suppliers (id) on delete set null,
  purpose         text not null,
  policy_version  text not null,
  accepted_at     timestamptz not null default now()
);

comment on table public.consent_records is
  'Evidencia de autorización de tratamiento de datos (Ley 1581). Append-only.';

create index if not exists consent_records_organization_id_idx
  on public.consent_records (organization_id);

create index if not exists consent_records_user_id_idx
  on public.consent_records (user_id);

-- Se inserta SIEMPRE desde el server con el cliente admin, en el mismo punto
-- donde ya se crea la organización (signup) o se vincula el proveedor
-- (acceptInvitation) — ambos flujos son pre-auth/privilegiados y ya usan
-- service_role para lo demás. Por eso no hay policy de INSERT para
-- authenticated: mismo criterio que `organizations`.
grant select on public.consent_records to authenticated;
grant select, insert on public.consent_records to service_role;

alter table public.consent_records enable row level security;

-- SELECT: owner/admin de la org (trazabilidad/auditoría de consentimientos).
create policy "consent_records_select_admins"
  on public.consent_records
  for select
  to authenticated
  using (public.is_admin_of(organization_id));

-- SELECT: el propio titular puede ver su propio registro de consentimiento.
create policy "consent_records_select_self"
  on public.consent_records
  for select
  to authenticated
  using (user_id = auth.uid());

-- Append-only: nada de update/delete, ni siquiera vía policy futura mal
-- escrita (revocado también a nivel de GRANT).
revoke update, delete on public.consent_records from authenticated, anon, service_role;
