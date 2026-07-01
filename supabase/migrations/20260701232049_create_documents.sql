-- documents: metadatos del archivo subido por/para un proveedor (el binario
-- vive en Storage; storage_path solo apunta a él, siempre en bucket privado
-- con signed URLs de corta duración generadas en el server).

create table if not exists public.documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  supplier_id      uuid not null references public.suppliers (id) on delete cascade,
  document_type_id uuid not null references public.document_types (id) on delete restrict,
  storage_path     text not null,
  file_hash        text not null check (file_hash ~ '^[0-9a-f]{64}$'), -- sha256 hex
  mime_type        text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes       bigint not null check (size_bytes > 0),
  status           text not null default 'cargado'
                     check (status in ('cargado', 'aprobado', 'rechazado', 'vencido')),
  issue_date       date,
  expiry_date      date,
  uploaded_by      uuid references auth.users (id),
  reviewed_by      uuid references auth.users (id),
  review_notes     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.documents is 'Metadatos de documentos (el archivo en sí vive en Storage).';

create index if not exists documents_organization_id_idx
  on public.documents (organization_id);

create index if not exists documents_supplier_id_idx
  on public.documents (supplier_id);

create index if not exists documents_document_type_id_idx
  on public.documents (document_type_id);

create index if not exists documents_status_idx
  on public.documents (status);

-- Para el cron de alertas de vencimiento: solo documentos aprobados con
-- fecha de expiración importan para esa consulta.
create index if not exists documents_expiry_date_idx
  on public.documents (expiry_date)
  where status = 'aprobado';

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

grant select, insert, update on public.documents to authenticated;
grant select, insert, update, delete on public.documents to service_role;

alter table public.documents enable row level security;

create policy "documents_select_members"
  on public.documents
  for select
  to authenticated
  using (public.is_member_of(organization_id));

create policy "documents_insert_members"
  on public.documents
  for insert
  to authenticated
  with check (public.is_member_of(organization_id));

create policy "documents_update_members"
  on public.documents
  for update
  to authenticated
  using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));

-- Sin DELETE: un documento rechazado/vencido se conserva (status lo refleja)
-- para no perder rastro de auditoría; nueva versión = document_versions.
