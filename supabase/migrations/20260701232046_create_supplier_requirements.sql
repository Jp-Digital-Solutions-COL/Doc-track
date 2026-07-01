-- supplier_requirements: qué tipos de documento debe entregar cada
-- proveedor (asignación de checklist por proveedor).

create table if not exists public.supplier_requirements (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  supplier_id       uuid not null references public.suppliers (id) on delete cascade,
  document_type_id  uuid not null references public.document_types (id) on delete cascade,
  is_mandatory      boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (supplier_id, document_type_id)
);

comment on table public.supplier_requirements is 'Checklist de documentos requeridos por proveedor.';

create index if not exists supplier_requirements_organization_id_idx
  on public.supplier_requirements (organization_id);

create index if not exists supplier_requirements_supplier_id_idx
  on public.supplier_requirements (supplier_id);

create index if not exists supplier_requirements_document_type_id_idx
  on public.supplier_requirements (document_type_id);

grant select, insert, update, delete on public.supplier_requirements to authenticated;
grant select, insert, update, delete on public.supplier_requirements to service_role;

alter table public.supplier_requirements enable row level security;

create policy "supplier_requirements_select_members"
  on public.supplier_requirements
  for select
  to authenticated
  using (public.is_member_of(organization_id));

create policy "supplier_requirements_insert_members"
  on public.supplier_requirements
  for insert
  to authenticated
  with check (public.is_member_of(organization_id));

create policy "supplier_requirements_update_members"
  on public.supplier_requirements
  for update
  to authenticated
  using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));

create policy "supplier_requirements_delete_members"
  on public.supplier_requirements
  for delete
  to authenticated
  using (public.is_member_of(organization_id));
