-- Branding por organización: logo + un solo color de marca. null en ambas
-- columnas = usar los valores por defecto de Doc-Track (comportamiento
-- actual, sin cambios para orgs existentes).
alter table public.organizations
  add column if not exists logo_url    text,
  add column if not exists brand_color text
    check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');

-- Bucket público "org-logos": a diferencia de "documentos" (privado, signed
-- URLs ≤60s), este bucket es público a propósito — el logo se muestra en
-- correos que se abren horas/días después de enviarse (una signed URL ya
-- habría expirado) y en el header del portal de proveedores. Un logo de
-- empresa no es información sensible, es un activo de marca pensado para
-- verse públicamente (excepción deliberada a la regla de "buckets siempre
-- privados" de CLAUDE.md, documentada también en el spec de esta feature).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', true, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Sin policy de INSERT/UPDATE/DELETE para `authenticated`: sin ella, RLS
-- bloquea por defecto para ese rol. Solo el service_role (bypassrls=true)
-- puede escribir, invocado exclusivamente desde la Server Action de
-- superadmin tras requireSuperadmin() — mismo patrón que organizations
-- (ver 20260701232029_create_organizations.sql). SELECT no necesita policy:
-- bucket `public=true` sirve lectura anónima vía
-- /storage/v1/object/public/org-logos/... sin pasar por RLS.
