-- supplier_users: identidad de acceso para contactos de proveedores externos.
-- NO son organization_members — solo pueden ver/gestionar SU propio
-- supplier_id, nunca datos de la empresa ni de otros proveedores.

create table if not exists public.supplier_users (
  id              uuid primary key default gen_random_uuid(),
  -- organization_id se duplica (igual que en document_versions) para que
  -- las policies e índices no dependan de un join a suppliers.
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id     uuid not null references public.suppliers (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  status          text not null default 'active' check (status in ('active', 'suspended')),
  created_at      timestamptz not null default now(),
  unique (supplier_id, user_id)
);

comment on table public.supplier_users is
  'Contactos de proveedores externos con acceso acotado a su propio supplier_id (vía invitación).';

create index if not exists supplier_users_organization_id_idx
  on public.supplier_users (organization_id);

create index if not exists supplier_users_supplier_id_idx
  on public.supplier_users (supplier_id);

create index if not exists supplier_users_user_id_idx
  on public.supplier_users (user_id);

-- ---------------------------------------------------------------------------
-- Helper: is_supplier_user_of(supplier uuid) — análogo a is_member_of(), pero
-- para el lado "proveedor". plpgsql + SECURITY DEFINER por la misma razón que
-- is_member_of(): evita recursión de RLS sobre esta misma tabla.
-- ---------------------------------------------------------------------------

create or replace function public.is_supplier_user_of(sup uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  return exists (
    select 1
    from public.supplier_users su
    where su.supplier_id = sup
      and su.user_id = auth.uid()
      and su.status = 'active'
  );
end;
$$;

comment on function public.is_supplier_user_of(uuid) is
  'True si auth.uid() es un contacto ACTIVO del proveedor dado.';

revoke execute on function public.is_supplier_user_of(uuid) from public;
grant execute on function public.is_supplier_user_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS de supplier_users
-- ---------------------------------------------------------------------------

-- SELECT: miembros de la org (para ver qué contactos tiene cada proveedor) o
-- el propio contacto viendo su propia fila.
grant select on public.supplier_users to authenticated;
grant select, insert, update, delete on public.supplier_users to service_role;

alter table public.supplier_users enable row level security;

create policy "supplier_users_select_members_or_self"
  on public.supplier_users
  for select
  to authenticated
  using (public.is_member_of(organization_id) or user_id = auth.uid());

-- Sin políticas de INSERT/UPDATE/DELETE para `authenticated`: el alta de un
-- contacto de proveedor SOLO ocurre al aceptar una invitación, un flujo que
-- corre en el server con el admin client (ver lib/actions/invitations.ts) —
-- ahí es donde se revalida el token antes de crear el acceso.
