-- Foto diaria del % de cumplimiento (proveedores activos / total) por
-- organización — la escribe el cron de alertas (una vez al día, idempotente
-- vía unique(organization_id, snapshot_date)). Sin esto no hay de dónde
-- sacar un histórico real para el gráfico "Cumplimiento en el tiempo": no
-- se inventa data pasada, el gráfico simplemente empieza a llenarse desde
-- el día que se activa esta tabla.
create table if not exists public.compliance_snapshots (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  snapshot_date    date not null,
  compliance_pct   numeric(5,2) not null,
  total_suppliers  integer not null,
  active_suppliers integer not null,
  created_at       timestamptz not null default now(),
  unique (organization_id, snapshot_date)
);

create index if not exists compliance_snapshots_org_date_idx
  on public.compliance_snapshots (organization_id, snapshot_date);

-- Solo lo escribe el cron (cliente admin, igual que notifications) — de
-- lectura sí sirve el cliente normal con RLS para que el dashboard lo pueda
-- consultar directo.
grant select on public.compliance_snapshots to authenticated;
grant select, insert, update on public.compliance_snapshots to service_role;

alter table public.compliance_snapshots enable row level security;

create policy "compliance_snapshots_select_members"
  on public.compliance_snapshots
  for select
  to authenticated
  using (public.is_member_of(organization_id));

revoke delete on public.compliance_snapshots from authenticated, anon, service_role;
