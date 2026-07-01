-- document_versions: historial de cada documento (cada re-subida crea una
-- versión nueva en vez de sobrescribir la anterior).

create table if not exists public.document_versions (
  id              uuid primary key default gen_random_uuid(),
  -- organization_id se duplica aquí (en vez de resolverlo con un join a
  -- documents) a propósito: así las policies de RLS y sus índices son
  -- directos, sin depender de una subconsulta a otra tabla.
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id     uuid not null references public.documents (id) on delete cascade,
  storage_path    text not null,
  version_no      integer not null check (version_no > 0),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  unique (document_id, version_no)
);

comment on table public.document_versions is 'Historial de versiones de un documento.';

create index if not exists document_versions_organization_id_idx
  on public.document_versions (organization_id);

create index if not exists document_versions_document_id_idx
  on public.document_versions (document_id);

grant select, insert, update on public.document_versions to authenticated;
grant select, insert, update, delete on public.document_versions to service_role;

alter table public.document_versions enable row level security;

create policy "document_versions_select_members"
  on public.document_versions
  for select
  to authenticated
  using (public.is_member_of(organization_id));

create policy "document_versions_insert_members"
  on public.document_versions
  for insert
  to authenticated
  with check (public.is_member_of(organization_id));

create policy "document_versions_update_members"
  on public.document_versions
  for update
  to authenticated
  using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));

-- Sin DELETE: es historial, se conserva completo.
