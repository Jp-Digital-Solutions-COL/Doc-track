-- document_types: catálogo de tipos de documento, configurable por empresa
-- (cada organización define los suyos: "Cédula representante legal",
-- "EEFF certificados", "Certificación bancaria", etc).

create table if not exists public.document_types (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  name                  text not null,
  description           text,
  requires_expiry       boolean not null default false,
  default_validity_days integer check (default_validity_days is null or default_validity_days > 0),
  created_at            timestamptz not null default now(),
  unique (organization_id, name)
);

comment on table public.document_types is 'Catálogo configurable por organización de tipos de documento.';

create index if not exists document_types_organization_id_idx
  on public.document_types (organization_id);

grant select, insert, update, delete on public.document_types to authenticated;
grant select, insert, update, delete on public.document_types to service_role;

alter table public.document_types enable row level security;

-- SELECT: cualquier miembro activo de la org (necesitan ver el catálogo
-- para subir/clasificar documentos).
create policy "document_types_select_members"
  on public.document_types
  for select
  to authenticated
  using (public.is_member_of(organization_id));

-- Escritura: solo owner/admin (es configuración de la organización).
create policy "document_types_insert_admins"
  on public.document_types
  for insert
  to authenticated
  with check (public.is_admin_of(organization_id));

create policy "document_types_update_admins"
  on public.document_types
  for update
  to authenticated
  using (public.is_admin_of(organization_id))
  with check (public.is_admin_of(organization_id));

create policy "document_types_delete_admins"
  on public.document_types
  for delete
  to authenticated
  using (public.is_admin_of(organization_id));
