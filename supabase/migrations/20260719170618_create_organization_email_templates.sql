-- Plantillas de correo personalizables por organización — una fila por
-- combinación org+tipo. Sin fila = se usa la plantilla predeterminada
-- (lib/email/default-templates.ts), cero cambio de comportamiento.
create table public.organization_email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email_type text not null check (email_type in (
    'invite_supplier', 'invite_org_admin',
    'alert_expiring', 'alert_expired', 'alert_missing'
  )),
  subject text not null,
  blocks jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (organization_id, email_type)
);

create index organization_email_templates_organization_id_idx
  on public.organization_email_templates (organization_id);

grant select, insert, update, delete on public.organization_email_templates to authenticated;
grant select, insert, update, delete on public.organization_email_templates to service_role;

alter table public.organization_email_templates enable row level security;

-- SELECT a nivel de MIEMBRO (no solo admin), a propósito: el contenido de
-- una plantilla de correo no es sensible, y esto simplifica cualquier
-- código futuro que necesite leerla sin revalidar rol. Ver sección 1 del
-- spec para la justificación completa.
create policy "organization_email_templates_select_members"
  on public.organization_email_templates
  for select
  to authenticated
  using (public.is_member_of(organization_id));

-- Escritura (INSERT/UPDATE/DELETE): solo owner/admin de la propia org.
create policy "organization_email_templates_insert_admins"
  on public.organization_email_templates
  for insert
  to authenticated
  with check (public.is_admin_of(organization_id));

create policy "organization_email_templates_update_admins"
  on public.organization_email_templates
  for update
  to authenticated
  using (public.is_admin_of(organization_id))
  with check (public.is_admin_of(organization_id));

create policy "organization_email_templates_delete_admins"
  on public.organization_email_templates
  for delete
  to authenticated
  using (public.is_admin_of(organization_id));

-- Bucket público "email-assets": mismo patrón y misma razón que "org-logos"
-- (ver 20260718013544_add_organization_branding.sql) — las imágenes se ven
-- en correos abiertos horas/días después, cuando una signed URL ya expiró.
-- Separado de "org-logos" (ese es el logo de marca, no imágenes de
-- contenido de correo) y de "documentos" (que sigue privado).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-assets', 'email-assets', true, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Sin policy de INSERT/UPDATE/DELETE para `authenticated`: solo el
-- service_role escribe, invocado desde uploadEmailImage() tras validar
-- owner/admin — mismo patrón que updateOrganizationBranding(). SELECT no
-- necesita policy: bucket público sirve lectura anónima directamente.
