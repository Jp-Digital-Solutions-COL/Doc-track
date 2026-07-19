# Editor visual de correos por organización — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a los owners/admins de cada organización un editor visual (bloques de texto/imagen/botón/separador, con variables y vista previa) para personalizar el contenido de sus 5 correos transaccionales (2 invitaciones + 3 alertas), sin tocar el logo/color existente ni depender del superadmin.

**Architecture:** Una tabla nueva `organization_email_templates` (una fila por org+tipo de correo) guarda `subject` + `blocks` (jsonb). Un renderer puro (`renderBlocks`) convierte bloques + variables en HTML, compartido entre el envío real (server) y la vista previa (client, mismo código, sin acceso a red). `lib/email/resend.ts`/`lib/email/alerts.ts` dejan de tener HTML hardcodeado: cargan la fila de la org (o la plantilla predeterminada) y renderizan. Un editor client-side (`/app/settings/emails/[type]`) edita bloques con controles ↑/↓, sube imágenes a un bucket público nuevo (`email-assets`), y valida todo server-side con `zod` antes de guardar.

**Tech Stack:** Next.js 15 App Router Server Components/Actions, Supabase (Postgres + Storage), TypeScript, `zod` (nueva dependencia — instalarla en Task 5), `node:test` para unidad, patrón `<iframe srcdoc>` para el preview.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-email-template-builder-design.md` (con sus 2 rondas de correcciones) — cualquier duda de comportamiento se resuelve ahí primero.
- RLS activada en la tabla nueva; toda Server Action revalida `owner`/`admin` de la organización del usuario, aunque RLS ya lo haga (CLAUDE.md regla 5).
- Nunca loguear PII/contenido — `console.warn`/`console.error` solo con nombres de variable, `.code`, `.name` (CLAUDE.md regla 6).
- IDs siempre uuid; imágenes subidas con nombre UUID, nunca el original (CLAUDE.md regla 7, ya aplicado en `updateOrganizationBranding`).
- **Criterio de regresión por tipo de correo (corregido en el spec — no es "mismo texto que hoy" para alertas):** el modelo de una sola plantilla por tipo de alerta para ambas audiencias (aprobado en el spec) hace que la copia por defecto de las 3 alertas ya NO pueda ser byte-idéntica a la actual: hoy la audiencia `supplier` recibe una frase extra de acción ("Renuévalo cargando...", "Súbelo desde tu portal", "Carga una versión vigente...") que la audiencia `org` no recibe, porque esa acción solo tiene sentido para quien sube el documento; una sola plantilla compartida no puede mantener esa asimetría. El criterio correcto, tal como quedó en el spec: **invitaciones** (`invite_supplier`, `invite_org_admin`) idénticas byte a byte al texto actual; **alertas** (`alert_expiring`, `alert_expired`, `alert_missing`) equivalentes en contenido (mismo documento, fecha, días — nada faltante ni sin resolver) con redacción neutral válida para ambas audiencias, sin las frases de acción exclusivas del proveedor (ver Task 4). Task 14 verifica exactamente esto, no "regresión cero" literal para alertas.
- No hay dependencia de drag-and-drop instalada — reordenar bloques usa controles ↑/↓ (decisión ya tomada en el spec).

---

### Task 1: Migración — tabla `organization_email_templates` + bucket `email-assets`

**Files:**
- Create: `supabase/migrations/<timestamp>_create_organization_email_templates.sql` (timestamp generado por la CLI en el Paso 1)

**Interfaces:**
- Produces: tabla `public.organization_email_templates` (`id`, `organization_id`, `email_type`, `subject`, `blocks`, `updated_at`, `updated_by`), bucket Storage `email-assets` (público, 2MB, `image/jpeg`/`image/png`).

- [ ] **Step 1: Crear el archivo de migración**

Run: `npx supabase migration new create_organization_email_templates`
Expected: imprime la ruta creada, ej. `supabase/migrations/20260719XXXXXX_create_organization_email_templates.sql`. Usa ese nombre exacto para el resto de la tarea.

- [ ] **Step 2: Escribir la migración**

```sql
-- Plantillas de correo personalizables por organización — una fila por
-- combinación org+tipo. Sin fila = se usa la plantilla predeterminada
-- (lib/email/default-templates.ts), cero cambio de comportamiento.
create table public.organization_email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email_type text not null check (email_type in (
    'invite_supplier', 'invite_org_admin',
    'alert_expiring', 'alert_expired', 'alert_missing'
  )),
  subject text not null,
  blocks jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (organization_id, email_type)
);

create index organization_email_templates_organization_id_idx
  on public.organization_email_templates (organization_id);

grant select, insert, update, delete on public.organization_email_templates to authenticated;
grant select, insert, update, delete on public.organization_email_templates to service_role;

alter table public.organization_email_templates enable row level security;

-- SELECT a nivel de MIEMBRO (no solo admin), a propósito: el contenido de
-- una plantilla de correo no es sensible, y esto simplifica cualquier
-- código futuro que necesite leerla sin revalidar rol. Ver sección 1 del
-- spec para la justificación completa.
create policy "organization_email_templates_select_members"
  on public.organization_email_templates
  for select
  to authenticated
  using (public.is_member_of(organization_id));

-- Escritura (INSERT/UPDATE/DELETE): solo owner/admin de la propia org.
create policy "organization_email_templates_insert_admins"
  on public.organization_email_templates
  for insert
  to authenticated
  with check (public.is_admin_of(organization_id));

create policy "organization_email_templates_update_admins"
  on public.organization_email_templates
  for update
  to authenticated
  using (public.is_admin_of(organization_id))
  with check (public.is_admin_of(organization_id));

create policy "organization_email_templates_delete_admins"
  on public.organization_email_templates
  for delete
  to authenticated
  using (public.is_admin_of(organization_id));

-- Bucket público "email-assets": mismo patrón y misma razón que "org-logos"
-- (ver 20260718013544_add_organization_branding.sql) — las imágenes se ven
-- en correos abiertos horas/días después, cuando una signed URL ya expiró.
-- Separado de "org-logos" (ese es el logo de marca, no imágenes de
-- contenido de correo) y de "documentos" (que sigue privado).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-assets', 'email-assets', true, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Sin policy de INSERT/UPDATE/DELETE para `authenticated`: solo el
-- service_role escribe, invocado desde uploadEmailImage() tras validar
-- owner/admin — mismo patrón que updateOrganizationBranding(). SELECT no
-- necesita policy: bucket público sirve lectura anónima directamente.
```

- [ ] **Step 3: Resetear la base local y confirmar que aplica limpio**

Run: `npx supabase db reset`
Expected: termina sin error; la lista final de migraciones aplicadas incluye el nuevo archivo.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add organization_email_templates table and email-assets bucket"
```

---

### Task 2: `lib/email/blocks.ts` — tipos y constantes compartidas

**Files:**
- Create: `lib/email/blocks.ts`

**Interfaces:**
- Produces: `EMAIL_TYPES`, `EmailType`, `EmailBlock`, `BUTTON_HREF_VAR_BY_TYPE`, `ALLOWED_VARIABLES_BY_TYPE`, `BLOCK_LIMITS`.

No test en esta tarea — es solo datos/tipos, sin lógica de rama (la lógica que los consume sí lleva test, en las tareas 3-5).

- [ ] **Step 1: Implementar**

```ts
// lib/email/blocks.ts
// Tipos y constantes del editor visual de correos, compartidos entre el
// renderer (server y client — ver render-blocks.ts), el validador
// (template-schema.ts) y la UI (email-template-editor.tsx). Sin
// "server-only": debe poder importarse desde un client component para
// el preview en vivo, igual que lib/email/template.ts.

export const EMAIL_TYPES = [
  "invite_supplier",
  "invite_org_admin",
  "alert_expiring",
  "alert_expired",
  "alert_missing",
] as const;

export type EmailType = (typeof EMAIL_TYPES)[number];

export type EmailBlock =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image"; url: string; alt: string }
  | { id: string; type: "button"; label: string; hrefVar: string }
  | { id: string; type: "divider" };

// Cada tipo de correo tiene exactamente una variable de botón — el CTA
// nunca apunta a una URL libre (ver sección 2 del spec).
export const BUTTON_HREF_VAR_BY_TYPE: Record<EmailType, string> = {
  invite_supplier: "inviteUrl",
  invite_org_admin: "inviteUrl",
  alert_expiring: "portalUrl",
  alert_expired: "portalUrl",
  alert_missing: "portalUrl",
};

// Variables insertables en texto/subject por tipo de correo — cualquier
// token {{...}} fuera de esta lista se rechaza al guardar (sección 3).
// inviteUrl/portalUrl NO están acá: solo son alcanzables vía botón, nunca
// como texto libre.
export const ALLOWED_VARIABLES_BY_TYPE: Record<EmailType, string[]> = {
  invite_supplier: ["organizationName"],
  invite_org_admin: ["organizationName", "role"],
  alert_expiring: ["documentoDestinatario", "documentTypeName", "expiryDate", "daysUntil"],
  alert_expired: ["documentoDestinatario", "documentTypeName", "expiryDate"],
  alert_missing: ["documentoDestinatario", "documentTypeName"],
};

export const BLOCK_LIMITS = {
  maxBlocks: 20,
  maxTextLength: 2000,
  maxSubjectLength: 200,
  maxButtonLabelLength: 200,
  maxAltLength: 200,
} as const;

export const EMAIL_TYPE_LABEL: Record<EmailType, string> = {
  invite_supplier: "Invitación a proveedor",
  invite_org_admin: "Invitación a administrador",
  alert_expiring: "Alerta: documento por vencer",
  alert_expired: "Alerta: documento vencido",
  alert_missing: "Alerta: documento faltante",
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add lib/email/blocks.ts
git commit -m "feat: add email block types and per-type variable/limit constants"
```

---

### Task 3: `lib/email/render-blocks.ts` — renderer puro (TDD)

**Files:**
- Create: `lib/email/render-blocks.ts`
- Test: `lib/email/render-blocks.test.ts`

**Interfaces:**
- Consumes: `EmailBlock` (Task 2), `brandButtonHtml` de `lib/email/template.ts` (existente).
- Produces: `substituteVariables(text, variables): string`, `renderBlocks(blocks, variables, brandColor): string`.

- [ ] **Step 1: Escribir los tests que deben fallar**

```ts
// lib/email/render-blocks.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { substituteVariables, renderBlocks } from "./render-blocks.ts";
import type { EmailBlock } from "./blocks.ts";

test("substituteVariables reemplaza un token conocido", () => {
  assert.equal(substituteVariables("Hola {{nombre}}", { nombre: "Ana" }), "Hola Ana");
});

test("substituteVariables reemplaza por vacío un token sin valor, sin lanzar", () => {
  assert.equal(substituteVariables("Hola {{nombre}}", {}), "Hola ");
});

test("renderBlocks escapa HTML en el texto del bloque y en el valor sustituido", () => {
  const blocks: EmailBlock[] = [{ id: "1", type: "text", text: "<b>{{nombre}}</b>" }];
  const html = renderBlocks(blocks, { nombre: "<script>1</script>" }, null);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /&lt;script&gt;/);
});

test("renderBlocks renderiza un bloque de imagen con url y alt", () => {
  const blocks: EmailBlock[] = [{ id: "1", type: "image", url: "https://example.com/a.png", alt: "Logo" }];
  const html = renderBlocks(blocks, {}, null);
  assert.match(html, /<img src="https:\/\/example\.com\/a\.png" alt="Logo"/);
});

test("renderBlocks renderiza un bloque de botón con el href resuelto", () => {
  const blocks: EmailBlock[] = [{ id: "1", type: "button", label: "Aceptar", hrefVar: "inviteUrl" }];
  const html = renderBlocks(blocks, { inviteUrl: "https://example.com/x" }, "#ff0000");
  assert.match(html, /href="https:\/\/example\.com\/x"/);
  assert.match(html, /background:#ff0000/);
  assert.match(html, />Aceptar<\/a>/);
});

test("renderBlocks omite un bloque de botón cuyo hrefVar no resuelve — nunca href vacío", () => {
  const blocks: EmailBlock[] = [{ id: "1", type: "button", label: "Aceptar", hrefVar: "inviteUrl" }];
  const html = renderBlocks(blocks, {}, null);
  assert.doesNotMatch(html, /<a /);
  assert.doesNotMatch(html, /href=""/);
});

test("renderBlocks renderiza un separador", () => {
  const blocks: EmailBlock[] = [{ id: "1", type: "divider" }];
  const html = renderBlocks(blocks, {}, null);
  assert.match(html, /<hr/);
});

test("renderBlocks preserva el orden de los bloques", () => {
  const blocks: EmailBlock[] = [
    { id: "1", type: "text", text: "Primero" },
    { id: "2", type: "divider" },
    { id: "3", type: "text", text: "Segundo" },
  ];
  const html = renderBlocks(blocks, {}, null);
  assert.ok(html.indexOf("Primero") < html.indexOf("<hr") && html.indexOf("<hr") < html.indexOf("Segundo"));
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `node --experimental-strip-types --test lib/email/render-blocks.test.ts`
Expected: FAIL — `Cannot find module './render-blocks.ts'`

- [ ] **Step 3: Implementar**

```ts
// lib/email/render-blocks.ts
// Renderer puro de bloques a HTML de correo — sin acceso a red/DB, sin
// "server-only" (a diferencia del resto de lib/email/*, este módulo debe
// poder importarse también desde el client component del editor para
// generar el preview en vivo sin ida y vuelta al servidor).
import { brandButtonHtml } from "./template";
import type { EmailBlock } from "./blocks";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Sustitución de texto plano — nunca interpreta HTML. Un token sin valor
// (undefined/"") se reemplaza por cadena vacía y se loguea, nunca lanza:
// un dato faltante en un solo correo no debe tumbar el envío completo.
export function substituteVariables(text: string, variables: Record<string, string | undefined>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined || value === "") {
      console.warn("email variable sin valor", { name });
      return "";
    }
    return value;
  });
}

export function renderBlocks(
  blocks: EmailBlock[],
  variables: Record<string, string | undefined>,
  brandColor: string | null
): string {
  return blocks
    .map((block) => {
      if (block.type === "text") {
        const substituted = substituteVariables(block.text, variables);
        return `<p>${escapeHtml(substituted).replace(/\n/g, "<br />")}</p>`;
      }
      if (block.type === "image") {
        return `<img src="${block.url}" alt="${escapeHtml(block.alt)}" style="display:block;max-width:100%;margin:12px 0;" />`;
      }
      if (block.type === "button") {
        const href = variables[block.hrefVar];
        // Nunca se emite <a href="">: un botón sin destino resuelto se omite.
        if (!href) return "";
        return `<p>${brandButtonHtml({ href, label: block.label, brandColor })}</p>`;
      }
      return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />`;
    })
    .filter((html) => html !== "")
    .join("\n");
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `node --experimental-strip-types --test lib/email/render-blocks.test.ts`
Expected: PASS — 8 tests, 0 fallos.

- [ ] **Step 5: Commit**

```bash
git add lib/email/render-blocks.ts lib/email/render-blocks.test.ts
git commit -m "feat: add pure email block renderer"
```

---

### Task 4: `lib/email/default-templates.ts` — plantillas predeterminadas (TDD)

**Files:**
- Create: `lib/email/default-templates.ts`
- Test: `lib/email/default-templates.test.ts`

**Interfaces:**
- Consumes: `EmailType`, `EmailBlock` (Task 2).
- Produces: `defaultSubjectFor(emailType): string`, `defaultBlocksFor(emailType): EmailBlock[]`, `resolveEmailContent(emailType, override): { subject: string; blocks: EmailBlock[] }`.

- [ ] **Step 1: Escribir los tests que deben fallar**

```ts
// lib/email/default-templates.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSubjectFor, defaultBlocksFor, resolveEmailContent } from "./default-templates.ts";
import { EMAIL_TYPES } from "./blocks.ts";

test("cada tipo de correo tiene subject y al menos un bloque por defecto", () => {
  for (const type of EMAIL_TYPES) {
    assert.ok(defaultSubjectFor(type).length > 0, `${type} subject vacío`);
    assert.ok(defaultBlocksFor(type).length > 0, `${type} sin bloques`);
  }
});

test("invite_supplier incluye un botón con hrefVar inviteUrl", () => {
  const blocks = defaultBlocksFor("invite_supplier");
  const button = blocks.find((b) => b.type === "button");
  assert.ok(button);
  assert.equal((button as { hrefVar: string }).hrefVar, "inviteUrl");
});

test("las 3 alertas usan {{documentoDestinatario}} en el cuerpo", () => {
  for (const type of ["alert_expiring", "alert_expired", "alert_missing"] as const) {
    const blocks = defaultBlocksFor(type);
    const hasToken = blocks.some((b) => b.type === "text" && b.text.includes("{{documentoDestinatario}}"));
    assert.ok(hasToken, `${type} no usa documentoDestinatario`);
  }
});

test("resolveEmailContent usa el override cuando existe", () => {
  const override = { subject: "Custom", blocks: [{ id: "x", type: "text" as const, text: "hola" }] };
  assert.deepEqual(resolveEmailContent("invite_supplier", override), override);
});

test("resolveEmailContent cae a la plantilla predeterminada cuando override es null", () => {
  const result = resolveEmailContent("invite_supplier", null);
  assert.equal(result.subject, defaultSubjectFor("invite_supplier"));
  assert.deepEqual(result.blocks, defaultBlocksFor("invite_supplier"));
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `node --experimental-strip-types --test lib/email/default-templates.test.ts`
Expected: FAIL — `Cannot find module './default-templates.ts'`

- [ ] **Step 3: Implementar**

```ts
// lib/email/default-templates.ts
// Traducción a bloques del HTML que hoy está hardcodeado en resend.ts/
// alerts.ts — usada como fallback de render (org sin fila personalizada) y
// como punto de partida al abrir el editor por primera vez.
//
// Las 2 invitaciones quedan con el mismo texto que hoy (solo pierden el
// <strong> de invite_org_admin: los bloques de texto son planos, formato
// enriquecido está fuera de alcance — ver spec). Las 3 alertas SÍ cambian
// de redacción: hoy la audiencia "supplier" recibe una frase de acción que
// "org" no recibe (p.ej. "Renuévalo cargando una versión nueva"), y el
// modelo de una sola plantilla por tipo de alerta no puede mantener esa
// asimetría. La redacción de acá es neutral y aplica igual a ambas
// audiencias (ver "Nota de diseño" en el plan).
import type { EmailBlock, EmailType } from "./blocks";

const SUBJECTS: Record<EmailType, string> = {
  invite_supplier: "Invitación de {{organizationName}} — Gestión Documental",
  invite_org_admin: "Invitación como {{role}} de {{organizationName}} — Gestión Documental",
  alert_expiring: "{{documentoDestinatario}} vence en {{daysUntil}} días",
  alert_expired: "{{documentoDestinatario}} venció",
  alert_missing: "Documento pendiente: {{documentTypeName}}",
};

const BLOCKS: Record<EmailType, Omit<EmailBlock, "id">[]> = {
  invite_supplier: [
    { type: "text", text: "{{organizationName}} te invitó a cargar tus documentos como proveedor." },
    { type: "button", label: "Aceptar invitación", hrefVar: "inviteUrl" },
    { type: "text", text: "Este enlace expira en 72 horas y solo puede usarse una vez." },
  ],
  invite_org_admin: [
    { type: "text", text: "Fuiste invitado a administrar {{organizationName}} como {{role}} en Gestión Documental." },
    { type: "button", label: "Aceptar invitación", hrefVar: "inviteUrl" },
    { type: "text", text: "Este enlace expira en 72 horas y solo puede usarse una vez." },
  ],
  alert_expiring: [
    {
      type: "text",
      text: "{{documentoDestinatario}} vence el {{expiryDate}} (en {{daysUntil}} días). Recuerda mantenerlo vigente.",
    },
  ],
  alert_expired: [
    { type: "text", text: "{{documentoDestinatario}} venció el {{expiryDate}}. Es importante actualizarlo lo antes posible." },
  ],
  alert_missing: [
    { type: "text", text: "{{documentoDestinatario}} todavía no ha sido cargado. Es un documento obligatorio." },
  ],
};

export function defaultSubjectFor(emailType: EmailType): string {
  return SUBJECTS[emailType];
}

// ids generados acá (no en el editor): la plantilla predeterminada debe ser
// determinística para que el fallback de render no varíe entre llamadas.
export function defaultBlocksFor(emailType: EmailType): EmailBlock[] {
  return BLOCKS[emailType].map((block, index) => ({ ...block, id: `default-${index}` }) as EmailBlock);
}

export function resolveEmailContent(
  emailType: EmailType,
  override: { subject: string; blocks: EmailBlock[] } | null
): { subject: string; blocks: EmailBlock[] } {
  return override ?? { subject: defaultSubjectFor(emailType), blocks: defaultBlocksFor(emailType) };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `node --experimental-strip-types --test lib/email/default-templates.test.ts`
Expected: PASS — 5 tests, 0 fallos.

- [ ] **Step 5: Commit**

```bash
git add lib/email/default-templates.ts lib/email/default-templates.test.ts
git commit -m "feat: add default email templates as blocks"
```

---

### Task 5: `lib/email/template-schema.ts` — validación server-side con zod (TDD)

**Files:**
- Create: `lib/email/template-schema.ts`
- Test: `lib/email/template-schema.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ALLOWED_VARIABLES_BY_TYPE`, `BUTTON_HREF_VAR_BY_TYPE`, `BLOCK_LIMITS`, `EmailType` (Task 2).
- Produces: `buildBlocksSchema(emailType, organizationId): ZodSchema` — `.safeParse({ subject, blocks })` devuelve `{ success, data }` o `{ success: false, error }`.

- [ ] **Step 1: Instalar zod**

Run: `npm install zod`
Expected: agrega `"zod": "^..."` a `dependencies` en `package.json` (hoy solo está presente de forma transitiva vía otros paquetes, no como dependencia directa).

- [ ] **Step 2: Escribir los tests que deben fallar**

```ts
// lib/email/template-schema.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBlocksSchema } from "./template-schema.ts";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const ASSET_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"}/storage/v1/object/public/email-assets/${ORG_ID}/img.png`;
const OTHER_ORG_ASSET_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"}/storage/v1/object/public/email-assets/22222222-2222-2222-2222-222222222222/img.png`;

test("acepta una plantilla válida con variables permitidas", () => {
  const schema = buildBlocksSchema("invite_supplier", ORG_ID);
  const result = schema.safeParse({
    subject: "Invitación de {{organizationName}}",
    blocks: [
      { id: "1", type: "text", text: "{{organizationName}} te invitó." },
      { id: "2", type: "button", label: "Aceptar", hrefVar: "inviteUrl" },
    ],
  });
  assert.equal(result.success, true);
});

test("rechaza un token de variable no permitido para el tipo", () => {
  const schema = buildBlocksSchema("invite_supplier", ORG_ID);
  const result = schema.safeParse({
    subject: "Hola",
    blocks: [{ id: "1", type: "text", text: "{{destinatarioSecreto}}" }],
  });
  assert.equal(result.success, false);
});

test("rechaza un hrefVar de botón distinto al permitido para el tipo", () => {
  const schema = buildBlocksSchema("invite_supplier", ORG_ID);
  const result = schema.safeParse({
    subject: "Hola",
    blocks: [{ id: "1", type: "button", label: "x", hrefVar: "portalUrl" }],
  });
  assert.equal(result.success, false);
});

test("rechaza una imagen que no pertenece al bucket/prefijo de la organización", () => {
  const schema = buildBlocksSchema("invite_supplier", ORG_ID);
  const result = schema.safeParse({
    subject: "Hola",
    blocks: [{ id: "1", type: "image", url: OTHER_ORG_ASSET_URL, alt: "x" }],
  });
  assert.equal(result.success, false);
});

test("acepta una imagen que sí pertenece al prefijo de la organización", () => {
  const schema = buildBlocksSchema("invite_supplier", ORG_ID);
  const result = schema.safeParse({
    subject: "Hola",
    blocks: [{ id: "1", type: "image", url: ASSET_URL, alt: "x" }],
  });
  assert.equal(result.success, true);
});

test("rechaza más de 20 bloques", () => {
  const schema = buildBlocksSchema("alert_missing", ORG_ID);
  const blocks = Array.from({ length: 21 }, (_, i) => ({ id: String(i), type: "divider" as const }));
  const result = schema.safeParse({ subject: "Hola", blocks });
  assert.equal(result.success, false);
});

test("rechaza un bloque de texto de más de 2000 caracteres", () => {
  const schema = buildBlocksSchema("alert_missing", ORG_ID);
  const result = schema.safeParse({ subject: "Hola", blocks: [{ id: "1", type: "text", text: "a".repeat(2001) }] });
  assert.equal(result.success, false);
});

test("rechaza un subject de más de 200 caracteres", () => {
  const schema = buildBlocksSchema("alert_missing", ORG_ID);
  const result = schema.safeParse({ subject: "a".repeat(201), blocks: [{ id: "1", type: "divider" }] });
  assert.equal(result.success, false);
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `node --experimental-strip-types --test lib/email/template-schema.test.ts`
Expected: FAIL — `Cannot find module './template-schema.ts'`

- [ ] **Step 4: Implementar**

```ts
// lib/email/template-schema.ts
// Validación server-side independiente del formulario: saveEmailTemplate
// puede invocarse directamente (sin pasar por el editor), así que el
// formulario nunca es el único punto de validación (ver sección 2 del
// spec). zod es la herramienta correcta para un array anidado de variantes
// por "type" sin reinventar un validador a mano.
import { z } from "zod";
import { ALLOWED_VARIABLES_BY_TYPE, BUTTON_HREF_VAR_BY_TYPE, BLOCK_LIMITS, type EmailType } from "./blocks";

function containsOnlyAllowedTokens(text: string, allowed: string[]): boolean {
  const tokens = [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  return tokens.every((t) => allowed.includes(t));
}

export function buildBlocksSchema(emailType: EmailType, organizationId: string) {
  const allowedVariables = ALLOWED_VARIABLES_BY_TYPE[emailType];
  const allowedHrefVar = BUTTON_HREF_VAR_BY_TYPE[emailType];
  // Mismo formato de URL pública que devuelve supabase.storage.getPublicUrl()
  // — ver uploadEmailImage() en lib/actions/email-templates.ts.
  const expectedAssetPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/email-assets/${organizationId}/`;

  const textBlock = z.object({
    id: z.string(),
    type: z.literal("text"),
    text: z
      .string()
      .min(1)
      .max(BLOCK_LIMITS.maxTextLength)
      .refine((t) => containsOnlyAllowedTokens(t, allowedVariables), "Variable no permitida para este tipo de correo."),
  });

  const imageBlock = z.object({
    id: z.string(),
    type: z.literal("image"),
    url: z.string().refine((u) => u.startsWith(expectedAssetPrefix), "La imagen debe pertenecer a esta organización."),
    alt: z.string().max(BLOCK_LIMITS.maxAltLength),
  });

  const buttonBlock = z.object({
    id: z.string(),
    type: z.literal("button"),
    label: z.string().min(1).max(BLOCK_LIMITS.maxButtonLabelLength),
    hrefVar: z.literal(allowedHrefVar),
  });

  const dividerBlock = z.object({ id: z.string(), type: z.literal("divider") });

  return z.object({
    subject: z
      .string()
      .min(1)
      .max(BLOCK_LIMITS.maxSubjectLength)
      .refine((t) => containsOnlyAllowedTokens(t, allowedVariables), "Variable no permitida en el asunto."),
    blocks: z
      .array(z.discriminatedUnion("type", [textBlock, imageBlock, buttonBlock, dividerBlock]))
      .min(1)
      .max(BLOCK_LIMITS.maxBlocks),
  });
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `node --experimental-strip-types --test lib/email/template-schema.test.ts`
Expected: PASS — 8 tests, 0 fallos.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/email/template-schema.ts lib/email/template-schema.test.ts
git commit -m "feat: add zod validation schema for email block templates"
```

---

### Task 6: `lib/email/get-template-row.ts` — lectura compartida de la fila personalizada

**Files:**
- Create: `lib/email/get-template-row.ts`

**Interfaces:**
- Consumes: `EmailBlock`, `EmailType` (Task 2).
- Produces: `getOrgEmailTemplate(client, organizationId, emailType): Promise<{ subject: string; blocks: EmailBlock[] } | null>`.

Sin test — es un wrapper de una sola consulta, mismo nivel que `getOrganizationDetail()` en `lib/actions/superadmin.ts` (tampoco testeado individualmente).

- [ ] **Step 1: Implementar**

```ts
// lib/email/get-template-row.ts
// Un solo lugar para "¿esta organización personalizó este tipo de correo?"
// — usado por la Server Action del editor, por los emisores de invitación/
// alerta, y por el cron de alertas (con su propio cache por corrida). Acepta
// cualquier SupabaseClient (con o sin sesión, admin o no): el caller decide
// si la lectura debe pasar por RLS o no, igual que logAudit().
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailBlock, EmailType } from "./blocks";

export async function getOrgEmailTemplate(
  client: SupabaseClient,
  organizationId: string,
  emailType: EmailType
): Promise<{ subject: string; blocks: EmailBlock[] } | null> {
  const { data } = await client
    .from("organization_email_templates")
    .select("subject, blocks")
    .eq("organization_id", organizationId)
    .eq("email_type", emailType)
    .maybeSingle();

  if (!data) return null;
  return { subject: data.subject, blocks: data.blocks as EmailBlock[] };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add lib/email/get-template-row.ts
git commit -m "feat: add shared org email template row lookup"
```

---

### Task 7: `lib/actions/email-templates.ts` — Server Actions del editor

**Files:**
- Create: `lib/actions/email-templates.ts`

**Interfaces:**
- Consumes: `getCurrentMembership` (`lib/auth/session.ts`), `detectFileType` (`lib/documents/file-type.ts`), `createAdminClient` (`lib/supabase/admin.ts`), `logAudit` (`lib/actions/audit.ts`), `EMAIL_TYPES`/`EmailType` (Task 2), `buildBlocksSchema` (Task 5), `defaultSubjectFor`/`defaultBlocksFor` (Task 4), `getOrgEmailTemplate` (Task 6).
- Produces: `getEmailTemplate(emailType)`, `saveEmailTemplate(formData)`, `resetEmailTemplate(formData)`, `uploadEmailImage(formData): Promise<{ ok: true; url: string } | { ok: false; error: string }>`.

- [ ] **Step 1: Implementar**

```ts
// lib/actions/email-templates.ts
"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMembership } from "@/lib/auth/session";
import { detectFileType } from "@/lib/documents/file-type";
import { logAudit } from "@/lib/actions/audit";
import { EMAIL_TYPES, type EmailType } from "@/lib/email/blocks";
import { buildBlocksSchema } from "@/lib/email/template-schema";
import { defaultBlocksFor, defaultSubjectFor } from "@/lib/email/default-templates";
import { getOrgEmailTemplate } from "@/lib/email/get-template-row";

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

function isEmailType(value: string): value is EmailType {
  return (EMAIL_TYPES as readonly string[]).includes(value);
}

async function requireOrgAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership || !["owner", "admin"].includes(membership.role)) redirect("/app");

  return { supabase, user, organizationId: membership.organizationId };
}

export async function getEmailTemplate(emailType: string) {
  if (!isEmailType(emailType)) redirect("/app/settings/emails");
  const { supabase, organizationId } = await requireOrgAdmin();

  const override = await getOrgEmailTemplate(supabase, organizationId, emailType);
  return {
    subject: override?.subject ?? defaultSubjectFor(emailType),
    blocks: override?.blocks ?? defaultBlocksFor(emailType),
    isCustomized: override !== null,
  };
}

export async function saveEmailTemplate(formData: FormData) {
  const emailType = String(formData.get("emailType") ?? "");
  const subject = String(formData.get("subject") ?? "");
  const blocksRaw = String(formData.get("blocks") ?? "[]");

  function fail(message: string): never {
    redirect(`/app/settings/emails/${emailType}?error=${encodeURIComponent(message)}`);
  }

  if (!isEmailType(emailType)) redirect("/app/settings/emails");
  const { supabase, user, organizationId } = await requireOrgAdmin();

  let parsedBlocks: unknown;
  try {
    parsedBlocks = JSON.parse(blocksRaw);
  } catch {
    fail("No se pudo leer la plantilla.");
  }

  const schema = buildBlocksSchema(emailType, organizationId);
  const result = schema.safeParse({ subject, blocks: parsedBlocks });
  if (!result.success) {
    fail(result.error.issues[0]?.message ?? "Plantilla inválida.");
  }

  const { error } = await supabase.from("organization_email_templates").upsert(
    {
      organization_id: organizationId,
      email_type: emailType,
      subject: result.data.subject,
      blocks: result.data.blocks,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,email_type" }
  );
  if (error) fail("No se pudo guardar la plantilla.");

  await logAudit(supabase, {
    organizationId,
    actorId: user.id,
    action: "email_template.update",
    entityType: "organization_email_templates",
    entityId: emailType,
  });

  redirect(`/app/settings/emails/${emailType}?saved=1`);
}

export async function resetEmailTemplate(formData: FormData) {
  const emailType = String(formData.get("emailType") ?? "");
  if (!isEmailType(emailType)) redirect("/app/settings/emails");

  const { supabase, user, organizationId } = await requireOrgAdmin();
  const admin = createAdminClient();

  const { data: existing } = await supabase
    .from("organization_email_templates")
    .select("blocks")
    .eq("organization_id", organizationId)
    .eq("email_type", emailType)
    .maybeSingle();

  const { error } = await supabase
    .from("organization_email_templates")
    .delete()
    .eq("organization_id", organizationId)
    .eq("email_type", emailType);
  if (error) redirect(`/app/settings/emails/${emailType}?error=${encodeURIComponent("No se pudo restaurar.")}`);

  // Borrado best-effort de las imágenes referenciadas por la fila borrada —
  // un fallo acá no impide restaurar la plantilla (ver sección 5 del spec).
  const imagePaths = ((existing?.blocks as { type: string; url?: string }[] | undefined) ?? [])
    .filter((b) => b.type === "image" && b.url)
    .map((b) => b.url!.split("/email-assets/")[1])
    .filter((p): p is string => Boolean(p));
  if (imagePaths.length > 0) {
    try {
      await admin.storage.from("email-assets").remove(imagePaths);
    } catch (removeError) {
      console.error("email-assets cleanup failed", { code: (removeError as Error).name });
    }
  }

  await logAudit(supabase, {
    organizationId,
    actorId: user.id,
    action: "email_template.reset",
    entityType: "organization_email_templates",
    entityId: emailType,
  });

  redirect(`/app/settings/emails/${emailType}?saved=1`);
}

// A diferencia de las otras 3 acciones, esta NO redirige: el editor la
// invoca directamente (sin <form>) para subir una imagen sin perder el
// estado en memoria de los demás bloques.
export async function uploadEmailImage(
  formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const image = formData.get("image");
  const { organizationId } = await requireOrgAdmin();

  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (image.size > IMAGE_MAX_BYTES) {
    return { ok: false, error: "La imagen supera el máximo de 2MB." };
  }

  const bytes = new Uint8Array(await image.arrayBuffer());
  const detected = detectFileType(bytes);
  if (!detected || detected.mime === "application/pdf") {
    return { ok: false, error: "La imagen debe ser PNG o JPG." };
  }

  const admin = createAdminClient();
  const storagePath = `${organizationId}/${randomUUID()}.${detected.ext}`;
  const { error: uploadError } = await admin.storage.from("email-assets").upload(storagePath, bytes, {
    contentType: detected.mime,
  });
  if (uploadError) return { ok: false, error: "No se pudo subir la imagen." };

  const url = admin.storage.from("email-assets").getPublicUrl(storagePath).data.publicUrl;
  return { ok: true, url };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/email-templates.ts
git commit -m "feat: add email template server actions (get/save/reset/upload)"
```

---

### Task 8: Conectar las invitaciones a las plantillas personalizadas

**Files:**
- Modify: `lib/email/resend.ts`
- Modify: `lib/actions/invitations.ts`
- Modify: `lib/actions/superadmin.ts`

**Interfaces:**
- Consumes: `renderBlocks` (Task 3), `resolveEmailContent` (Task 4), `getOrgEmailTemplate` (Task 6).
- Produces: `sendInvitationEmail`/`sendOrgAdminInvitationEmail` ganan un parámetro requerido `templateOverride: { subject: string; blocks: EmailBlock[] } | null`.

- [ ] **Step 1: Reescribir `lib/email/resend.ts`**

Reemplaza el archivo completo:

```ts
import "server-only";
import { sendEmail } from "@/lib/email/send";
import { renderEmailHtml } from "@/lib/email/template";
import { renderBlocks, substituteVariables } from "@/lib/email/render-blocks";
import { resolveEmailContent } from "@/lib/email/default-templates";
import type { EmailBlock } from "@/lib/email/blocks";

type Branding = { logoUrl: string | null; brandColor: string | null };
type TemplateOverride = { subject: string; blocks: EmailBlock[] } | null;

export async function sendInvitationEmail(params: {
  to: string;
  inviteUrl: string;
  organizationName: string;
  branding: Branding;
  templateOverride: TemplateOverride;
}) {
  const { subject, blocks } = resolveEmailContent("invite_supplier", params.templateOverride);
  const variables = { organizationName: params.organizationName, inviteUrl: params.inviteUrl };

  await sendEmail({
    to: params.to,
    // .replace(...) evita que una variable con salto de línea inyecte un
    // header de correo adicional en el subject.
    subject: substituteVariables(subject, variables).replace(/[\r\n]/g, " "),
    html: renderEmailHtml({
      logoUrl: params.branding.logoUrl,
      bodyHtml: renderBlocks(blocks, variables, params.branding.brandColor),
    }),
  });
}

export async function sendOrgAdminInvitationEmail(params: {
  to: string;
  inviteUrl: string;
  organizationName: string;
  role: "owner" | "admin";
  branding: Branding;
  templateOverride: TemplateOverride;
}) {
  const { subject, blocks } = resolveEmailContent("invite_org_admin", params.templateOverride);
  const variables = { organizationName: params.organizationName, role: params.role, inviteUrl: params.inviteUrl };

  await sendEmail({
    to: params.to,
    subject: substituteVariables(subject, variables).replace(/[\r\n]/g, " "),
    html: renderEmailHtml({
      logoUrl: params.branding.logoUrl,
      bodyHtml: renderBlocks(blocks, variables, params.branding.brandColor),
    }),
  });
}
```

- [ ] **Step 2: Actualizar `createInvitation` en `lib/actions/invitations.ts`**

Añade el import:

```ts
import { getOrgEmailTemplate } from "@/lib/email/get-template-row";
```

Encuentra:

```ts
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url, brand_color")
    .eq("id", membership.organizationId)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/invite?token=${rawToken}`;

  try {
    await sendInvitationEmail({
      to: email,
      inviteUrl,
      organizationName: org?.name ?? "tu organización",
      branding: { logoUrl: org?.logo_url ?? null, brandColor: org?.brand_color ?? null },
    });
```

Reemplaza con:

```ts
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url, brand_color")
    .eq("id", membership.organizationId)
    .single();

  const templateOverride = await getOrgEmailTemplate(supabase, membership.organizationId, "invite_supplier");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/invite?token=${rawToken}`;

  try {
    await sendInvitationEmail({
      to: email,
      inviteUrl,
      organizationName: org?.name ?? "tu organización",
      branding: { logoUrl: org?.logo_url ?? null, brandColor: org?.brand_color ?? null },
      templateOverride,
    });
```

- [ ] **Step 3: Actualizar `lib/actions/superadmin.ts`**

Añade el import:

```ts
import { getOrgEmailTemplate } from "@/lib/email/get-template-row";
```

`sendAndRecordOrgAdminInvitation` gana un parámetro `templateOverride`. Encuentra:

```ts
async function sendAndRecordOrgAdminInvitation(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  actorId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: (typeof ROLES)[number];
  branding: { logoUrl: string | null; brandColor: string | null };
}) {
```

Reemplaza con:

```ts
async function sendAndRecordOrgAdminInvitation(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  actorId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: (typeof ROLES)[number];
  branding: { logoUrl: string | null; brandColor: string | null };
  templateOverride: { subject: string; blocks: import("@/lib/email/blocks").EmailBlock[] } | null;
}) {
```

Dentro de la misma función, encuentra:

```ts
  try {
    await sendOrgAdminInvitationEmail({
      to: params.email,
      inviteUrl,
      organizationName: params.organizationName,
      role: params.role,
      branding: params.branding,
    });
```

Reemplaza con:

```ts
  try {
    await sendOrgAdminInvitationEmail({
      to: params.email,
      inviteUrl,
      organizationName: params.organizationName,
      role: params.role,
      branding: params.branding,
      templateOverride: params.templateOverride,
    });
```

Ahora actualiza los 3 llamadores. **`createOrganizationAndInviteAdmin`** — la organización se acaba de crear, así que `templateOverride` siempre es `null`, pero se usa `admin` (no `supabase`) porque el superadmin que ejecuta esto no es necesariamente miembro de esta organización (RLS con `is_member_of` lo bloquearía). Encuentra:

```ts
  const result = await sendAndRecordOrgAdminInvitation({
    supabase,
    actorId: user.id,
    organizationId: org.id,
    organizationName: companyName,
    email,
    role: role as (typeof ROLES)[number],
    branding: { logoUrl: org.logo_url ?? null, brandColor: org.brand_color ?? null },
  });
```

Reemplaza con:

```ts
  const templateOverride = await getOrgEmailTemplate(admin, org.id, "invite_org_admin");

  const result = await sendAndRecordOrgAdminInvitation({
    supabase,
    actorId: user.id,
    organizationId: org.id,
    organizationName: companyName,
    email,
    role: role as (typeof ROLES)[number],
    branding: { logoUrl: org.logo_url ?? null, brandColor: org.brand_color ?? null },
    templateOverride,
  });
```

**`inviteAdminToOrganization`** — encuentra:

```ts
  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, logo_url, brand_color")
    .eq("id", organizationId)
    .maybeSingle();
  if (!organization) fail("Organización no encontrada.");

  const result = await sendAndRecordOrgAdminInvitation({
    supabase,
    actorId: user.id,
    organizationId,
    organizationName: organization.name,
    email,
    role: role as (typeof ROLES)[number],
    branding: { logoUrl: organization.logo_url ?? null, brandColor: organization.brand_color ?? null },
  });
```

Reemplaza con:

```ts
  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, logo_url, brand_color")
    .eq("id", organizationId)
    .maybeSingle();
  if (!organization) fail("Organización no encontrada.");

  const admin = createAdminClient();
  const templateOverride = await getOrgEmailTemplate(admin, organizationId, "invite_org_admin");

  const result = await sendAndRecordOrgAdminInvitation({
    supabase,
    actorId: user.id,
    organizationId,
    organizationName: organization.name,
    email,
    role: role as (typeof ROLES)[number],
    branding: { logoUrl: organization.logo_url ?? null, brandColor: organization.brand_color ?? null },
    templateOverride,
  });
```

**`resendOrgAdminInvitation`** — encuentra:

```ts
  const pendingOrg = pending.organizations as unknown as {
    name: string;
    logo_url: string | null;
    brand_color: string | null;
  } | null;
  const organizationName = pendingOrg?.name ?? "tu organización";

  const result = await sendAndRecordOrgAdminInvitation({
    supabase,
    actorId: user.id,
    organizationId,
    organizationName,
    email: pending.email,
    role: pending.role as (typeof ROLES)[number],
    branding: { logoUrl: pendingOrg?.logo_url ?? null, brandColor: pendingOrg?.brand_color ?? null },
  });
```

Reemplaza con:

```ts
  const pendingOrg = pending.organizations as unknown as {
    name: string;
    logo_url: string | null;
    brand_color: string | null;
  } | null;
  const organizationName = pendingOrg?.name ?? "tu organización";

  const admin = createAdminClient();
  const templateOverride = await getOrgEmailTemplate(admin, organizationId, "invite_org_admin");

  const result = await sendAndRecordOrgAdminInvitation({
    supabase,
    actorId: user.id,
    organizationId,
    organizationName,
    email: pending.email,
    role: pending.role as (typeof ROLES)[number],
    branding: { logoUrl: pendingOrg?.logo_url ?? null, brandColor: pendingOrg?.brand_color ?? null },
    templateOverride,
  });
```

Nota: `inviteAdminToOrganization` y `resendOrgAdminInvitation` ya podían usar una variable local `admin` si alguna vez la declararon — verifica que no quede una declaración `const admin = createAdminClient();` duplicada en la misma función al aplicar este cambio (ninguna de las dos la tenía antes de esta tarea, así que es una declaración nueva en ambas).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos. Este paso es el que detecta cualquier llamador olvidado — `sendInvitationEmail`/`sendOrgAdminInvitationEmail`/`sendAndRecordOrgAdminInvitation` ahora requieren `templateOverride`, así que un call site olvidado falla acá.

- [ ] **Step 5: Correr la suite de unit tests**

Run: `npm run test:unit`
Expected: PASS, 0 fallos.

- [ ] **Step 6: Verificación manual**

Run: `npm run dev` (verifica primero que no haya un dev server zombie — `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*next dev*' }`).
Pasos: invita a un proveedor nuevo desde una organización sin plantilla personalizada → confirma en Mailpit/Inbucket (URL de `supabase status`) que el correo se ve exactamente igual que antes de esta tarea (mismo texto). Repite para una invitación de admin desde `/superadmin`.

- [ ] **Step 7: Commit**

```bash
git add lib/email/resend.ts lib/actions/invitations.ts lib/actions/superadmin.ts
git commit -m "feat: wire invitation emails to org-customizable templates"
```

---

### Task 9: Conectar las alertas a las plantillas personalizadas

**Files:**
- Modify: `lib/email/alerts.ts`
- Modify: `app/api/cron/alerts/route.ts`

**Interfaces:**
- Consumes: `renderBlocks`/`substituteVariables` (Task 3), `resolveEmailContent` (Task 4), `getOrgEmailTemplate` (Task 6).
- Produces: `sendAlertEmail` gana un 6º parámetro `templateOverride: { subject: string; blocks: EmailBlock[] } | null`. `buildAlertEmail` se elimina.

- [ ] **Step 1: Reescribir `lib/email/alerts.ts`**

Reemplaza el archivo completo:

```ts
import "server-only";
import { sendEmail } from "@/lib/email/send";
import { renderEmailHtml } from "@/lib/email/template";
import { renderBlocks, substituteVariables } from "@/lib/email/render-blocks";
import { resolveEmailContent } from "@/lib/email/default-templates";
import type { EmailBlock, EmailType } from "@/lib/email/blocks";

export type AlertKind = "expiring" | "expired" | "missing";
export type Audience = "supplier" | "org";

type AlertParams = {
  supplierName: string;
  documentTypeName: string;
  daysUntil?: number; // solo para "expiring"
  expiryDate?: string; // "expiring" | "expired"
};

// Frase "sujeto + documento" según quién recibe el correo — reemplaza los
// mapas subjectSupplier/subjectOrg y bodySupplier/bodyOrg que existían acá
// antes de esta tarea. "del", nunca "de el" (ver sección 3 del spec).
function buildDocumentoDestinatario(audience: Audience, params: AlertParams): string {
  return audience === "supplier"
    ? `tu documento ${params.documentTypeName}`
    : `el documento ${params.documentTypeName} del proveedor ${params.supplierName}`;
}

function buildPortalUrl(audience: Audience): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  // El proveedor gestiona sus documentos en /portal; el personal de la
  // organización, en /app — mismo botón, distinto destino según quién lo ve.
  return audience === "supplier" ? `${appUrl}/portal` : `${appUrl}/app`;
}

export async function sendAlertEmail(
  to: string,
  kind: AlertKind,
  audience: Audience,
  params: AlertParams,
  branding: { logoUrl: string | null; brandColor: string | null },
  templateOverride: { subject: string; blocks: EmailBlock[] } | null
) {
  const emailType: EmailType = `alert_${kind}`;
  const { subject, blocks } = resolveEmailContent(emailType, templateOverride);

  const variables: Record<string, string | undefined> = {
    documentoDestinatario: buildDocumentoDestinatario(audience, params),
    documentTypeName: params.documentTypeName,
    expiryDate: params.expiryDate,
    daysUntil: params.daysUntil !== undefined ? String(params.daysUntil) : undefined,
    portalUrl: buildPortalUrl(audience),
  };

  await sendEmail({
    to,
    subject: substituteVariables(subject, variables).replace(/[\r\n]/g, " "),
    html: renderEmailHtml({
      logoUrl: branding.logoUrl,
      bodyHtml: renderBlocks(blocks, variables, branding.brandColor),
    }),
  });
}
```

- [ ] **Step 2: Extender el cache de branding del cron para también cachear la plantilla**

En `app/api/cron/alerts/route.ts`, añade el import:

```ts
import { getOrgEmailTemplate } from "@/lib/email/get-template-row";
import type { AlertKind } from "@/lib/email/alerts";
```

Encuentra:

```ts
type OrgBranding = { logoUrl: string | null; brandColor: string | null };

// El job puede mandar muchos correos por organización en una sola corrida
// (uno por documento/proveedor) — este cache evita repetir la consulta de
// branding por cada correo.
const brandingCache = new Map<string, OrgBranding>();

async function getOrgBranding(admin: SupabaseClient, organizationId: string): Promise<OrgBranding> {
  const cached = brandingCache.get(organizationId);
  if (cached) return cached;

  const { data } = await admin
    .from("organizations")
    .select("logo_url, brand_color")
    .eq("id", organizationId)
    .maybeSingle();

  const branding: OrgBranding = { logoUrl: data?.logo_url ?? null, brandColor: data?.brand_color ?? null };
  brandingCache.set(organizationId, branding);
  return branding;
}
```

Reemplaza con:

```ts
type OrgBranding = { logoUrl: string | null; brandColor: string | null };

// El job puede mandar muchos correos por organización en una sola corrida
// (uno por documento/proveedor) — este cache evita repetir la consulta de
// branding/plantilla por cada correo.
const brandingCache = new Map<string, OrgBranding>();
const templateCache = new Map<string, Parameters<typeof sendAlertEmail>[5]>();

async function getOrgBranding(admin: SupabaseClient, organizationId: string): Promise<OrgBranding> {
  const cached = brandingCache.get(organizationId);
  if (cached) return cached;

  const { data } = await admin
    .from("organizations")
    .select("logo_url, brand_color")
    .eq("id", organizationId)
    .maybeSingle();

  const branding: OrgBranding = { logoUrl: data?.logo_url ?? null, brandColor: data?.brand_color ?? null };
  brandingCache.set(organizationId, branding);
  return branding;
}

async function getCachedOrgTemplate(admin: SupabaseClient, organizationId: string, kind: AlertKind) {
  const key = `${organizationId}:${kind}`;
  if (templateCache.has(key)) return templateCache.get(key)!;

  const template = await getOrgEmailTemplate(admin, organizationId, `alert_${kind}` as const);
  templateCache.set(key, template);
  return template;
}
```

Encuentra:

```ts
async function notifyBoth(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    supplierId: string;
    supplierEmail: string | null;
    documentTypeId?: string;
    kind: AlertKind;
    typeSuffix: string;
    today: string;
    alertParams: Parameters<typeof sendAlertEmail>[3];
  }
) {
  const results: ("sent" | "duplicate" | "insert_failed" | "send_failed")[] = [];
  const branding = await getOrgBranding(admin, params.organizationId);

  if (params.supplierEmail) {
    results.push(
      await notifyOnce(admin, {
        organizationId: params.organizationId,
        type: `${params.typeSuffix}:supplier`,
        recipient: params.supplierEmail,
        supplierId: params.supplierId,
        documentTypeId: params.documentTypeId,
        today: params.today,
        send: () => sendAlertEmail(params.supplierEmail!, params.kind, "supplier", params.alertParams, branding),
      })
    );
  }

  const orgEmails = await getOrgRecipientEmails(admin, params.organizationId);
  for (const email of orgEmails) {
    results.push(
      await notifyOnce(admin, {
        organizationId: params.organizationId,
        type: `${params.typeSuffix}:org`,
        recipient: email,
        supplierId: params.supplierId,
        documentTypeId: params.documentTypeId,
        today: params.today,
        send: () => sendAlertEmail(email, params.kind, "org" as Audience, params.alertParams, branding),
      })
    );
  }

  return results;
}
```

Reemplaza con:

```ts
async function notifyBoth(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    supplierId: string;
    supplierEmail: string | null;
    documentTypeId?: string;
    kind: AlertKind;
    typeSuffix: string;
    today: string;
    alertParams: Parameters<typeof sendAlertEmail>[3];
  }
) {
  const results: ("sent" | "duplicate" | "insert_failed" | "send_failed")[] = [];
  const branding = await getOrgBranding(admin, params.organizationId);
  const templateOverride = await getCachedOrgTemplate(admin, params.organizationId, params.kind);

  if (params.supplierEmail) {
    results.push(
      await notifyOnce(admin, {
        organizationId: params.organizationId,
        type: `${params.typeSuffix}:supplier`,
        recipient: params.supplierEmail,
        supplierId: params.supplierId,
        documentTypeId: params.documentTypeId,
        today: params.today,
        send: () =>
          sendAlertEmail(params.supplierEmail!, params.kind, "supplier", params.alertParams, branding, templateOverride),
      })
    );
  }

  const orgEmails = await getOrgRecipientEmails(admin, params.organizationId);
  for (const email of orgEmails) {
    results.push(
      await notifyOnce(admin, {
        organizationId: params.organizationId,
        type: `${params.typeSuffix}:org`,
        recipient: email,
        supplierId: params.supplierId,
        documentTypeId: params.documentTypeId,
        today: params.today,
        send: () => sendAlertEmail(email, params.kind, "org" as Audience, params.alertParams, branding, templateOverride),
      })
    );
  }

  return results;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Correr la suite de unit tests**

Run: `npm run test:unit`
Expected: PASS, 0 fallos.

- [ ] **Step 5: Verificación manual**

Run: `curl -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3000/api/cron/alerts` contra el dev server local, con al menos un documento por vencer dentro de 30 días.
Expected: `200` JSON; el correo recibido (Mailpit/Inbucket) muestra "tu documento X vence..." si el destinatario es el proveedor, y "el documento X del proveedor Y vence..." si el destinatario es la organización — confirma que `{{documentoDestinatario}}` resuelve distinto para cada audiencia en la misma corrida, y que el nombre del tipo de documento ("X") es idéntico en ambos correos (`{{documentTypeName}}` no varía por audiencia).

- [ ] **Step 6: Commit**

```bash
git add lib/email/alerts.ts app/api/cron/alerts/route.ts
git commit -m "feat: wire alert emails to org-customizable templates"
```

---

### Task 10: UI — página de lista `/app/settings/emails`

**Files:**
- Create: `app/app/settings/emails/page.tsx`

**Interfaces:**
- Consumes: `getCurrentMembership` (`lib/auth/session.ts`), `EMAIL_TYPES`/`EMAIL_TYPE_LABEL` (Task 2), `getOrgEmailTemplate` (Task 6).

- [ ] **Step 1: Implementar**

```tsx
// app/app/settings/emails/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { getOrgEmailTemplate } from "@/lib/email/get-template-row";
import { EMAIL_TYPES, EMAIL_TYPE_LABEL } from "@/lib/email/blocks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function EmailTemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");
  if (!["owner", "admin"].includes(membership.role)) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <p className="text-sm text-muted-foreground">Solo owner/admin pueden editar los correos de la organización.</p>
      </div>
    );
  }

  const statuses = await Promise.all(
    EMAIL_TYPES.map(async (type) => ({
      type,
      customized: (await getOrgEmailTemplate(supabase, membership.organizationId, type)) !== null,
    }))
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Correos</h1>

      <Card>
        <CardHeader>
          <CardTitle>Plantillas de correo</CardTitle>
          <CardDescription>Personaliza el texto, las imágenes y los botones de cada correo transaccional.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {statuses.map(({ type, customized }) => (
            <Link
              key={type}
              href={`/app/settings/emails/${type}`}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted"
            >
              <span>{EMAIL_TYPE_LABEL[type]}</span>
              <Badge variant={customized ? "default" : "outline"}>{customized ? "Personalizado" : "Predeterminado"}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add app/app/settings/emails/page.tsx
git commit -m "feat: add email templates list page"
```

---

### Task 11: UI — editor de bloques con preview `/app/settings/emails/[type]`

**Files:**
- Create: `app/app/settings/emails/[type]/page.tsx`
- Create: `components/app/email-template-editor.tsx`
- Create: `lib/email/sample-data.ts`

**Interfaces:**
- Consumes: `getEmailTemplate`/`saveEmailTemplate`/`resetEmailTemplate`/`uploadEmailImage` (Task 7), `renderBlocks`/`substituteVariables` (Task 3), `renderEmailHtml` (`lib/email/template.ts`, existente), `ALLOWED_VARIABLES_BY_TYPE`/`BUTTON_HREF_VAR_BY_TYPE`/`BLOCK_LIMITS`/`EmailBlock`/`EmailType` (Task 2).
- Produces: `getSamplePreviewSets(emailType): { label: string; variables: Record<string, string> }[]`.

- [ ] **Step 1: Datos de ejemplo para el preview**

```ts
// lib/email/sample-data.ts
// Datos de ejemplo para la vista previa del editor. Para los 3 tipos de
// alerta hay DOS variantes (proveedor / organización) porque
// {{documentoDestinatario}} resuelve distinto según quién recibe el correo
// — el admin necesita ver ambas lecturas de la misma plantilla, no solo
// una (ver sección 3 del spec).
import type { EmailType } from "./blocks";

const ALERT_SAMPLE_BASE = { documentTypeName: "Certificación bancaria", expiryDate: "15 de agosto de 2026", daysUntil: "15" };

export function getSamplePreviewSets(emailType: EmailType): { label: string; variables: Record<string, string> }[] {
  switch (emailType) {
    case "invite_supplier":
      return [{ label: "Vista previa", variables: { organizationName: "Acme S.A.S.", inviteUrl: "https://ejemplo.com/invite?token=demo" } }];
    case "invite_org_admin":
      return [
        {
          label: "Vista previa",
          variables: { organizationName: "Acme S.A.S.", role: "admin", inviteUrl: "https://ejemplo.com/org-invite?token=demo" },
        },
      ];
    case "alert_expiring":
    case "alert_expired":
    case "alert_missing":
      return [
        {
          label: "Como proveedor",
          variables: {
            ...ALERT_SAMPLE_BASE,
            documentoDestinatario: `tu documento ${ALERT_SAMPLE_BASE.documentTypeName}`,
            portalUrl: "https://ejemplo.com/portal",
          },
        },
        {
          label: "Como organización",
          variables: {
            ...ALERT_SAMPLE_BASE,
            documentoDestinatario: `el documento ${ALERT_SAMPLE_BASE.documentTypeName} del proveedor Acme S.A.S.`,
            portalUrl: "https://ejemplo.com/app",
          },
        },
      ];
  }
}
```

- [ ] **Step 2: Página del editor (Server Component)**

```tsx
// app/app/settings/emails/[type]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { getEmailTemplate } from "@/lib/actions/email-templates";
import { EMAIL_TYPES, EMAIL_TYPE_LABEL, ALLOWED_VARIABLES_BY_TYPE, BUTTON_HREF_VAR_BY_TYPE, type EmailType } from "@/lib/email/blocks";
import { getSamplePreviewSets } from "@/lib/email/sample-data";
import { EmailTemplateEditor } from "@/components/app/email-template-editor";

function isEmailType(value: string): value is EmailType {
  return (EMAIL_TYPES as readonly string[]).includes(value);
}

export default async function EmailTemplateEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { type } = await params;
  const { error, saved } = await searchParams;
  if (!isEmailType(type)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");
  if (!["owner", "admin"].includes(membership.role)) redirect("/app/settings/emails");

  const { data: org } = await supabase
    .from("organizations")
    .select("logo_url, brand_color")
    .eq("id", membership.organizationId)
    .single();

  const template = await getEmailTemplate(type);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">{EMAIL_TYPE_LABEL[type]}</h1>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm text-muted-foreground">Guardado.</p> : null}
      <EmailTemplateEditor
        emailType={type}
        initialSubject={template.subject}
        initialBlocks={template.blocks}
        isCustomized={template.isCustomized}
        allowedVariables={ALLOWED_VARIABLES_BY_TYPE[type]}
        buttonHrefVar={BUTTON_HREF_VAR_BY_TYPE[type]}
        samplePreviewSets={getSamplePreviewSets(type)}
        logoUrl={org?.logo_url ?? null}
        brandColor={org?.brand_color ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 3: Componente cliente del editor**

```tsx
// components/app/email-template-editor.tsx
"use client";

import { useMemo, useState } from "react";
import { saveEmailTemplate, resetEmailTemplate, uploadEmailImage } from "@/lib/actions/email-templates";
import { renderBlocks, substituteVariables } from "@/lib/email/render-blocks";
import { renderEmailHtml } from "@/lib/email/template";
import type { EmailBlock, EmailType } from "@/lib/email/blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TEXTAREA_CLASS =
  "w-full min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function newBlock(type: EmailBlock["type"], buttonHrefVar: string): EmailBlock {
  const id = crypto.randomUUID();
  if (type === "text") return { id, type, text: "" };
  if (type === "image") return { id, type, url: "", alt: "" };
  if (type === "button") return { id, type, label: "Ver más", hrefVar: buttonHrefVar };
  return { id, type };
}

export function EmailTemplateEditor({
  emailType,
  initialSubject,
  initialBlocks,
  isCustomized,
  allowedVariables,
  buttonHrefVar,
  samplePreviewSets,
  logoUrl,
  brandColor,
}: {
  emailType: EmailType;
  initialSubject: string;
  initialBlocks: EmailBlock[];
  isCustomized: boolean;
  allowedVariables: string[];
  buttonHrefVar: string;
  samplePreviewSets: { label: string; variables: Record<string, string> }[];
  logoUrl: string | null;
  brandColor: string | null;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [blocks, setBlocks] = useState<EmailBlock[]>(initialBlocks);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function updateBlock(id: string, patch: Partial<EmailBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)));
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  function moveBlock(id: string, direction: -1 | 1) {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addBlock(type: EmailBlock["type"]) {
    setBlocks((prev) => [...prev, newBlock(type, buttonHrefVar)]);
  }

  async function handleImageUpload(id: string, file: File) {
    setUploadError(null);
    const formData = new FormData();
    formData.append("image", file);
    const result = await uploadEmailImage(formData);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    updateBlock(id, { url: result.url } as Partial<EmailBlock>);
  }

  const activeSample = samplePreviewSets[previewIndex]!.variables;
  const previewSubject = useMemo(() => substituteVariables(subject, activeSample), [subject, activeSample]);
  const previewHtml = useMemo(
    () => renderEmailHtml({ logoUrl, bodyHtml: renderBlocks(blocks, activeSample, brandColor) }),
    [blocks, activeSample, logoUrl, brandColor]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form action={saveEmailTemplate} className="space-y-4">
        <input type="hidden" name="emailType" value={emailType} />
        <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />

        <div className="space-y-2">
          <Label htmlFor="subject">Asunto</Label>
          <Input id="subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
        </div>

        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-muted-foreground">Variables:</span>
          {allowedVariables.map((v) => (
            <button
              key={v}
              type="button"
              className="rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-muted/70"
              onClick={() => setSubject((s) => `${s}{{${v}}}`)}
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {blocks.map((block, index) => (
            <div key={block.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase text-muted-foreground">{block.type}</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveBlock(block.id, -1)}>
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === blocks.length - 1}
                    onClick={() => moveBlock(block.id, 1)}
                  >
                    ↓
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeBlock(block.id)}>
                    ×
                  </Button>
                </div>
              </div>

              {block.type === "text" ? (
                <>
                  <textarea
                    className={TEXTAREA_CLASS}
                    value={block.text}
                    maxLength={2000}
                    onChange={(e) => updateBlock(block.id, { text: e.target.value } as Partial<EmailBlock>)}
                  />
                  <div className="flex flex-wrap gap-1">
                    {allowedVariables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-muted/70"
                        onClick={() => updateBlock(block.id, { text: `${block.text}{{${v}}}` } as Partial<EmailBlock>)}
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {block.type === "image" ? (
                <div className="space-y-2">
                  {block.url ? <img src={block.url} alt={block.alt} className="max-h-24 rounded border border-border" /> : null}
                  <Input
                    type="file"
                    accept=".png,.jpg,.jpeg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleImageUpload(block.id, file);
                    }}
                  />
                  <Input
                    placeholder="Texto alternativo"
                    value={block.alt}
                    maxLength={200}
                    onChange={(e) => updateBlock(block.id, { alt: e.target.value } as Partial<EmailBlock>)}
                  />
                </div>
              ) : null}

              {block.type === "button" ? (
                <Input
                  placeholder="Texto del botón"
                  value={block.label}
                  maxLength={200}
                  onChange={(e) => updateBlock(block.id, { label: e.target.value } as Partial<EmailBlock>)}
                />
              ) : null}
            </div>
          ))}
        </div>

        {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => addBlock("text")}>
            + Texto
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addBlock("image")}>
            + Imagen
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addBlock("button")}>
            + Botón
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addBlock("divider")}>
            + Separador
          </Button>
        </div>

        <div className="flex gap-2">
          <Button type="submit">Guardar</Button>
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Vista previa</h2>
          {samplePreviewSets.length > 1 ? (
            <div className="flex gap-1">
              {samplePreviewSets.map((set, index) => (
                <Button
                  key={set.label}
                  type="button"
                  size="sm"
                  variant={index === previewIndex ? "default" : "outline"}
                  onClick={() => setPreviewIndex(index)}
                >
                  {set.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <p className="text-sm font-medium">{previewSubject}</p>
        <iframe title="Vista previa del correo" srcDoc={previewHtml} sandbox="" className="h-[500px] w-full rounded-lg border border-border" />

        {isCustomized ? (
          <form
            action={resetEmailTemplate}
            onSubmit={(e) => {
              if (!confirm("¿Restaurar la plantilla predeterminada? Se perderá tu personalización.")) e.preventDefault();
            }}
          >
            <input type="hidden" name="emailType" value={emailType} />
            <Button type="submit" variant="destructive" size="sm">
              Restaurar predeterminado
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 5: Verificación manual**

Run: `npm run dev` (verifica primero que no haya un dev server zombie).
Pasos: entra a `/app/settings/emails` como owner/admin → abre "Invitación a proveedor" → confirma que el preview muestra el texto actual → añade un bloque de texto con `{{organizationName}}` → confirma que el preview lo sustituye en vivo → sube una imagen PNG en un bloque de imagen → confirma que aparece en el preview → guarda → confirma "Guardado." y que el badge de la lista pasa a "Personalizado" → abre una alerta (ej. "Alerta: documento por vencer") → alterna entre "Como proveedor"/"Como organización" en el preview → confirma que `{{documentoDestinatario}}` cambia de "tu documento..." a "el documento... del proveedor..." → restaura predeterminado → confirma que vuelve al texto original y el badge pasa a "Predeterminado".

- [ ] **Step 6: Commit**

```bash
git add app/app/settings/emails lib/email/sample-data.ts components/app/email-template-editor.tsx
git commit -m "feat: add email template block editor with live preview"
```

---

### Task 12: Nav — enlace "Correos" en el sidebar

**Files:**
- Modify: `components/app-sidebar.tsx`

**Interfaces:** ninguna nueva — solo añade un `NavItem`.

- [ ] **Step 1: Añadir el item de navegación**

Encuentra:

```ts
import {
  Home,
  Users,
  FileText,
  Lock,
  ClipboardCheck,
  Gavel,
  CreditCard,
  ShieldAlert,
  ShieldCheck,
  LogOut,
  ArrowRight,
} from "lucide-react";
```

Reemplaza con:

```ts
import {
  Home,
  Users,
  FileText,
  Lock,
  ClipboardCheck,
  Gavel,
  CreditCard,
  Mail,
  ShieldAlert,
  ShieldCheck,
  LogOut,
  ArrowRight,
} from "lucide-react";
```

Encuentra:

```ts
  items.push({ href: "/app/security", label: "Seguridad", icon: Lock });
  if (isAdmin) {
    items.push({ href: "/app/plan", label: "Plan", icon: CreditCard });
  }
```

Reemplaza con:

```ts
  items.push({ href: "/app/security", label: "Seguridad", icon: Lock });
  if (isAdmin) {
    items.push({ href: "/app/settings/emails", label: "Correos", icon: Mail });
    items.push({ href: "/app/plan", label: "Plan", icon: CreditCard });
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Verificación manual**

Pasos: entra como owner/admin → confirma que "Correos" aparece en el sidebar entre "Seguridad" y "Plan" → entra como `reviewer` → confirma que NO aparece (mismo `isAdmin` gate que "Plan").

- [ ] **Step 4: Commit**

```bash
git add components/app-sidebar.tsx
git commit -m "feat: add Correos link to app sidebar nav"
```

---

### Task 13: Test de aislamiento RLS multi-tenant

**Files:**
- Modify: `scripts/test-rls-isolation.mts`

**Interfaces:** ninguna nueva — extiende el script existente.

- [ ] **Step 1: Añadir setup de una plantilla personalizada para Org A**

En la función `setup()`, después del bloque que inserta `documentA`/`documentB` (justo antes de `console.log("[setup] listo.\n");`), añade:

```ts
  const { error: templateAErr } = await admin.from("organization_email_templates").insert({
    organization_id: orgA.id,
    email_type: "invite_supplier",
    subject: "Asunto de prueba Org A",
    blocks: [{ id: "1", type: "divider" }],
  });
  if (templateAErr) throw templateAErr;
```

- [ ] **Step 2: Añadir los checks de aislamiento**

En `main()`, después del bloque `// --- 4. Insert cross-tenant: debe ser rechazado por RLS ---` y antes del `} finally {`, añade:

```ts
    // --- 5. organization_email_templates: lectura/escritura cross-tenant ---
    const { data: templatesFromA } = await asUserA
      .from("organization_email_templates")
      .select("id")
      .eq("organization_id", ctx.orgA.id);
    check("Org A SÍ ve su propia plantilla de correo (control positivo)", (templatesFromA?.length ?? 0) === 1);

    const { data: templatesFromB, error: templatesReadErr } = await asUserA
      .from("organization_email_templates")
      .select("id")
      .eq("organization_id", ctx.orgB.id);
    check(
      "Org A NO ve plantillas de correo de Org B",
      !templatesReadErr && (templatesFromB?.length ?? -1) === 0,
      templatesReadErr ? templatesReadErr.message : `filas devueltas: ${templatesFromB?.length}`
    );

    const { data: templateInsertData, error: templateInsertErr } = await asUserA
      .from("organization_email_templates")
      .insert({
        organization_id: ctx.orgB.id,
        email_type: "invite_org_admin",
        subject: "intruso",
        blocks: [{ id: "1", type: "divider" }],
      })
      .select();
    check(
      "INSERT de plantilla de Org A hacia Org B es rechazado por RLS",
      !!templateInsertErr && (templateInsertData?.length ?? 0) === 0,
      templateInsertErr ? templateInsertErr.message : "el insert NO fue rechazado — esto es una fuga"
    );
```

- [ ] **Step 3: Correr el test**

Run: `npm run test:rls`
Expected: todos los checks pasan, incluidos los 3 nuevos, terminando con "✓ Aislamiento multi-tenant verificado: 0 fugas." (requiere `supabase start` corriendo — el script se niega a correr contra un proyecto remoto sin `ALLOW_REMOTE_RLS_TEST=true`).

- [ ] **Step 4: Commit**

```bash
git add scripts/test-rls-isolation.mts
git commit -m "test: extend RLS isolation test to organization_email_templates"
```

---

### Task 14: Verificación final

**Files:** ninguno — solo verificación.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: solo los errores preexistentes `TS5097` en archivos `*.test.ts` (no relacionados con esta feature).

- [ ] **Step 2: Suite completa de unit tests**

Run: `npm run test:unit`
Expected: PASS, 0 fallos — incluye los tests de las Tasks 3, 4 y 5 más todos los preexistentes.

- [ ] **Step 3: `check:no-secret-leak`**

Run: `npm run check:no-secret-leak`
Expected: PASS.

- [ ] **Step 4: Test de aislamiento RLS**

Run: `npm run test:rls`
Expected: PASS, 0 fugas (incluye los checks de la Task 13).

- [ ] **Step 5: Regresión de invitaciones sin personalizar**

Pasos: en una organización que nunca abrió `/app/settings/emails`, invita a un proveedor y a un admin → confirma que ambos correos se ven exactamente igual que antes de esta feature (mismo texto, mismo botón).

- [ ] **Step 6: Equivalencia de contenido en alertas sin personalizar (criterio corregido — NO "mismo texto que hoy")**

Pasos: dispara el cron de alertas (`curl -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3000/api/cron/alerts`) para una organización sin plantillas personalizadas, con casos de los 3 tipos (`expiring`/`expired`/`missing`) → para cada correo recibido, verifica contra el criterio del spec (sección "Definición de hecho"), no contra "regresión cero" literal:
  - Contiene el nombre del tipo de documento, la fecha de vencimiento (si aplica) y los días restantes (si aplica) — los mismos datos que el texto anterior, sin ninguno faltante.
  - Ningún token `{{...}}` sin resolver ni campo vacío.
  - La redacción es neutral y tiene sentido tanto si el destinatario es el proveedor como si es la organización — no incluye frases de acción exclusivas del proveedor ("Renuévalo cargando...", "Súbelo desde tu portal...", "Carga una versión vigente...").

- [ ] **Step 7: Aislamiento multi-tenant visual**

Pasos: personaliza el correo de invitación de la Org A con un texto distintivo → invita a un proveedor desde la Org B (sin personalizar) → confirma que el correo de la Org B usa el texto predeterminado, nunca el texto de la Org A.

- [ ] **Step 8: Rol `reviewer` — sin escritura ni UI, con lectura**

Pasos: entra como un usuario con rol `reviewer` de una organización → confirma que "Correos" NO aparece en el sidebar (Task 12) → navega directamente a `/app/settings/emails` → confirma redirect fuera de la página (no ve la lista) → intenta invocar `saveEmailTemplate`/`resetEmailTemplate`/`uploadEmailImage` (ej. con `curl` autenticado como ese usuario, o confirmando en el código que `requireOrgAdmin()` redirige antes de tocar la tabla) → confirma que ninguna escritura se completa. Por otro lado, confirma en Supabase Studio (con ese mismo usuario autenticado vía la API REST) que SÍ puede hacer `select` sobre `organization_email_templates` de su propia organización — es el comportamiento esperado (sección 1 del spec), no una fuga.

No hay commit para esta tarea — es solo verificación. Si algún paso falla, corrige en la tarea correspondiente y vuelve a correr esta tarea completa antes de dar la feature por terminada.
