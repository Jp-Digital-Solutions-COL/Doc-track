-- suppliers: proveedores de cada empresa.

create table if not exists public.suppliers (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  legal_name            text not null,
  nit                   text not null,
  category              text,
  status                text not null default 'pendiente'
                          check (status in ('pendiente', 'en_revision', 'activo', 'rechazado', 'vencido')),
  primary_contact_email text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, nit)
);

comment on table public.suppliers is 'Proveedores registrados por cada organización.';

create index if not exists suppliers_organization_id_idx
  on public.suppliers (organization_id);

create index if not exists suppliers_organization_id_status_idx
  on public.suppliers (organization_id, status);

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

grant select, insert, update on public.suppliers to authenticated;
grant select, insert, update, delete on public.suppliers to service_role;

alter table public.suppliers enable row level security;

-- SELECT/INSERT/UPDATE: cualquier miembro activo de la org (operativo, no
-- restringido a owner/admin — reviewers gestionan proveedores día a día).
-- WITH CHECK impide crear o "mover" un proveedor hacia otra organización.
create policy "suppliers_select_members"
  on public.suppliers
  for select
  to authenticated
  using (public.is_member_of(organization_id));

create policy "suppliers_insert_members"
  on public.suppliers
  for insert
  to authenticated
  with check (public.is_member_of(organization_id));

create policy "suppliers_update_members"
  on public.suppliers
  for update
  to authenticated
  using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));

-- Sin DELETE: un proveedor se retira cambiando `status`, no borrando la fila
-- (se necesita conservar el historial para auditoría).
