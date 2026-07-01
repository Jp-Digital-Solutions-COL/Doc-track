-- profiles: extiende auth.users. No lleva organization_id — un mismo usuario
-- puede pertenecer a varias organizaciones (vía organization_members).

create table if not exists public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  mfa_enabled boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Datos de perfil del usuario, 1-a-1 con auth.users.';

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

alter table public.profiles enable row level security;

-- SELECT: el propio usuario, o cualquier compañero con el que comparta al
-- menos una organización activa (para poder mostrar nombres en la UI: quién
-- subió/revisó un documento, listas de equipo, etc).
create policy "profiles_select_own_or_teammates"
  on public.profiles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = auth.uid()
        and mine.status = 'active'
        and theirs.user_id = profiles.user_id
        and theirs.status = 'active'
    )
  );

-- INSERT/UPDATE: solo el propio usuario sobre su propia fila.
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trigger: crea automáticamente la fila de perfil cuando se registra un
-- usuario nuevo en auth.users (sin esto, profiles nunca se puebla solo).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper reutilizable (suppliers, documents también lo usan): mantiene
-- updated_at al día en cualquier UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
