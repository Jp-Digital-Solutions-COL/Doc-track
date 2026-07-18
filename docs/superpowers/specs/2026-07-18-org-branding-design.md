# Branding por organización (logo + color) — diseño

## Contexto y objetivo

Cada organización (tenant) del SaaS es una empresa cliente distinta. Hoy toda
la app (`/app`, `/portal`) y todos los correos transaccionales muestran el
mismo logo de Doc-Track y el mismo azul de marca (`app/globals.css`),
independientemente de qué organización esté usando el sistema.

El superadmin necesita poder asignarle a cada organización, desde el panel de
`/superadmin`, un logo propio y un color de marca propio, de forma que:

- El personal de esa organización vea su marca en `/app`.
- Los proveedores de esa organización vean su marca en `/portal` (una vez
  logueados).
- Los correos que reciban ambos (invitaciones, alertas de vencimiento) también
  muestren esa marca.

Cuando una organización no tiene branding configurado, todo cae a los valores
actuales de Doc-Track — cero cambio de comportamiento para las orgs
existentes.

## Alcance

**Incluye:**
- Un solo color de marca por organización (no una paleta completa) — los
  demás tonos (hover, fondos suaves, contraste de texto) se derivan
  automáticamente.
- Logo en PNG/JPG únicamente (no SVG).
- Aplicación en `/app`, `/portal` (post-login) y en los correos
  transaccionales existentes (invitaciones y alertas).
- Gestión exclusiva desde `/superadmin` — los owners/admins de la organización
  NO pueden autoconfigurar su marca (puede añadirse después si se pide).

**No incluye (fuera de alcance, se puede pedir después):**
- Branding en la pantalla de login antes de autenticarse (no hay forma de
  saber la organización sin sesión ni token de invitación en ese punto).
- SVG u otros formatos de logo.
- Paleta de colores múltiple (secundario, fondo, texto por separado).
- Autoservicio de branding por parte de la propia organización.

## 1. Modelo de datos

Migración nueva en `supabase/migrations/`:

```sql
alter table public.organizations
  add column if not exists logo_url    text,
  add column if not exists brand_color text;
```

- Ambas columnas nullable. `null` = usar los valores por defecto de Doc-Track.
- `brand_color` se valida en el server (formato hex `#rrggbb`) antes de
  guardar — nunca se confía en el input del cliente aunque sea un
  `<input type="color">`.
- `logo_url` guarda la URL pública completa (no solo el path dentro del
  bucket), calculada en el momento de subir el archivo con el helper de
  Supabase Storage para URLs públicas. Como cada ambiente (local/prod) tiene
  su propia base de datos con organizaciones independientes (ver "Fase A/B"
  en `CLAUDE.md`), la URL siempre corresponde al `SUPABASE_URL` del ambiente
  donde se subió — no hay mezcla entre local y prod.
- Sin cambios de RLS: `organizations` ya tiene policy de `UPDATE` para
  owner/admin de la propia org y el superadmin escribe vía el cliente admin
  (mismo patrón que el resto de `lib/actions/superadmin.ts`).

## 2. Storage: bucket público `org-logos`

Bucket nuevo, **distinto** del bucket `documentos` (que sigue privado).

**Excepción deliberada a la regla "buckets siempre privados" de
`CLAUDE.md`:** un logo de empresa no es información sensible/personal — es un
activo de marca pensado para mostrarse públicamente. Además es técnicamente
necesario: los correos se abren horas o días después de enviarse, y una
signed URL de ≤60s (la que usa el bucket `documentos`) ya habría expirado. Por
eso este bucket, y únicamente este, es público. El bucket `documentos` no
cambia.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', true, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
```

- Ruta: `{organization_id}/{uuid}.{ext}` — nunca el nombre original del
  archivo (regla 7 de `CLAUDE.md`).
- RLS de `storage.objects` para este bucket:
  - `SELECT`: sin policy — bucket público, cualquiera puede leer (correos,
    portal sin fricción).
  - `INSERT` / `UPDATE` / `DELETE`: sin policy para `authenticated` — solo el
    `service_role` (cliente admin) puede escribir, y solo se invoca desde la
    Server Action de superadmin tras validar la sesión y el rol.
- Validación en el server antes de subir (mismo patrón que
  `lib/actions/documents.ts` para documentos): magic bytes (PNG/JPEG reales,
  no solo la extensión), tamaño máximo 2MB.
- Al reemplazar el logo de una organización, se borra el objeto anterior del
  bucket (evita acumular archivos huérfanos).

## 3. Panel de superadmin

Nueva sección "Marca" en `app/superadmin/organizations/[id]/page.tsx`:

- Input de archivo para el logo, con preview antes de guardar.
- `<input type="color">` nativo para el color de marca, con swatch de
  vista previa junto al selector.
- Botón "Guardar marca" → Server Action `updateOrganizationBranding` en
  `lib/actions/superadmin.ts`:
  1. `requireSuperadmin()` (mismo guard que el resto del archivo).
  2. Valida el hex del color (regex `^#[0-9a-f]{6}$`).
  3. Si viene un archivo nuevo: valida magic bytes + tamaño, sube a
     `org-logos/{organizationId}/{uuid}.{ext}`, borra el logo anterior si
     existía.
  4. `UPDATE organizations SET logo_url = ..., brand_color = ...`.
  5. `logPlatformAudit(..., action: "organization.update_branding")`.
  6. `redirect` de vuelta a la página de detalle con confirmación (mismo
     patrón `?saved=1` que el resto del formulario de edición).

## 4. Aplicar la marca en `/app` y `/portal`

### Derivación del color

`lib/branding/derive-palette.ts` — función pura, sin dependencias nuevas:

- Recibe el hex de marca.
- Calcula si el texto sobre ese color debe ser blanco o negro, usando
  luminancia relativa (fórmula WCAG estándar, ~10 líneas).
- Devuelve un objeto de variables CSS (`--primary`, `--primary-foreground`,
  `--ring`, `--sidebar-primary`, `--sidebar-primary-foreground`) donde los
  tonos derivados (fondos suaves tipo `--accent`, hover) se calculan con
  `color-mix(in srgb, ...)` — función CSS nativa, sin librería de color.

### `/app`

- `app/app/layout.tsx`: el `select` de `organizations` ya existente se
  amplía de `"name"` a `"name, logo_url, brand_color"`.
- Si `brand_color` no es null, se renderiza un `<style>` inline (scoped al
  layout) con el resultado de `derivePalette(brand_color)`, sobrescribiendo
  las variables CSS para esa request. Sin branding → no se renderiza el
  `<style>`, se usan los valores por defecto de `globals.css` sin tocarlos.
- `components/app-sidebar.tsx`: nueva prop `logoUrl?: string | null`; el
  `<Image src="/doc-track-logo.png">` hardcodeado pasa a
  `src={logoUrl ?? "/doc-track-logo.png"}`.

### `/portal`

- `app/portal/layout.tsx` — **archivo nuevo** (hoy `/portal` no tiene layout
  propio). Resuelve la organización del proveedor logueado con su propia
  consulta a `supplier_users → suppliers.organization_id → organizations
  (logo_url, brand_color)` — independiente de la que ya hace
  `app/portal/page.tsx` para `supplier_id`. Son dos consultas livianas e
  indexadas (no hay N+1: una por request, no por documento), se mantienen
  separadas porque layout y page son server components independientes en
  App Router y no comparten datos entre sí sin un mecanismo adicional que no
  se justifica para dos SELECT simples.
- Aplica el mismo mecanismo de `<style>` inline + logo en un header simple
  del portal (hoy el portal no tiene header — se agrega uno mínimo con el
  logo y nombre de la organización).

## 5. Correos con marca

`lib/email/template.ts` — **archivo nuevo**:

```ts
renderEmailHtml(params: {
  organizationName: string;
  logoUrl: string | null;
  brandColor: string | null;
  bodyHtml: string;
}): string
```

Envuelve `bodyHtml` en una plantilla simple: logo arriba (o nada si
`logoUrl` es null — no forzar el logo de Doc-Track en el correo de una
organización sin logo propio configurado, para no dar la falsa impresión de
que el correo es de Doc-Track), y estilos en **hex inline** (los clientes de
correo no soportan `color-mix()` ni variables CSS, así que aquí sí se resuelve
el color final en JS con la misma lógica de contraste de
`derive-palette.ts`, reutilizada — no duplicada).

Cambios de firma (todas en `lib/email/`):
- `sendInvitationEmail`, `sendOrgAdminInvitationEmail` (`resend.ts`) y
  `sendAlertEmail` (`alerts.ts`) reciben un parámetro nuevo
  `branding: { logoUrl: string | null; brandColor: string | null }`.
- Cada llamador ya tiene o puede resolver el `organization_id` en ese punto
  (`lib/actions/superadmin.ts`, `lib/actions/suppliers.ts` o donde viva el
  envío de invitación a proveedor, y `app/api/cron/alerts/route.ts`).

### Cron de alertas

`app/api/cron/alerts/route.ts` puede enviar muchos correos por organización
en una sola ejecución (uno por documento/proveedor). Para no repetir la
consulta de branding por cada correo, se agrega un `Map<string, Branding>`
en memoria, poblado la primera vez que se ve cada `organization_id` durante
esa ejecución del job.

## 6. Verificación

- Aislamiento: crear dos organizaciones con logo/color distintos, confirmar
  que cada una ve solo su propia marca en `/app`, `/portal` y en los correos
  recibidos (0 fugas de marca entre tenants).
- Contraste: probar con un color muy claro (ej. amarillo `#ffe600`) y uno muy
  oscuro (ej. `#0a0a0a`) y confirmar que el texto sobre el color de marca
  sigue siendo legible en ambos casos.
- Comportamiento por defecto: una organización sin `logo_url`/`brand_color`
  configurados se ve exactamente igual que hoy (logo y azul de Doc-Track) en
  `/app`, `/portal` y correos.
- Subida de logo: confirmar que un archivo que no es realmente PNG/JPG (magic
  bytes no coinciden con la extensión) es rechazado, igual que ya pasa con la
  subida de documentos.
- `supabase db reset` corre limpio con la migración nueva.
