# Editor visual de correos por organización — diseño

## Contexto y objetivo

Hoy los correos transaccionales (invitaciones y alertas de vencimiento) se
generan desde funciones TypeScript con HTML hardcodeado
(`lib/email/resend.ts`, `lib/email/alerts.ts`), envueltas por
`lib/email/template.ts` (`renderEmailHtml`/`brandButtonHtml`), que ya aplican
el logo y el color de marca de la organización (ver
`2026-07-18-org-branding-design.md`). Esa personalización se limita a
logo + un color; el texto, las imágenes y los botones son fijos e iguales
para todas las organizaciones, y solo el superadmin puede tocar el logo/color
desde `/superadmin`.

El dueño/administrador de cada organización quiere poder editar el **contenido**
de sus propios correos (texto, imágenes, botones) desde una interfaz visual,
sin depender del superadmin y sin tocar código.

## Alcance

**Incluye:**
- Editor visual en `/app/settings/emails`, accesible para roles `owner` y
  `admin` de la organización (mismo criterio que ya usa `createInvitation` en
  `lib/actions/invitations.ts`).
- Cubre los 5 tipos de correo transaccional que existen hoy:
  `invite_supplier`, `invite_org_admin`, `alert_expiring`, `alert_expired`,
  `alert_missing`.
- Bloques editables: **texto**, **imagen**, **botón**, **separador**,
  reordenables con controles ↑/↓ (sin drag-and-drop real: no hay ninguna
  dependencia instalada que lo resuelva y los botones dan la misma
  experiencia "visual" sin añadir una librería nueva ni problemas de
  accesibilidad táctil — puede añadirse después si hace falta).
- Variables dinámicas insertables desde un selector (no texto libre) —
  ver sección 3.
- Vista previa en vivo junto al editor, renderizada con datos de ejemplo.
- Botón "Restaurar predeterminado" por tipo de correo.
- El logo y el color de marca **no** se editan aquí — siguen viniendo de
  `organizations.logo_url`/`brand_color` (gestión existente, sin cambios).

**No incluye (fuera de alcance, se puede pedir después):**
- Drag-and-drop real (usamos ↑/↓).
- Formato de texto enriquecido (negrita, links inline) — los bloques de texto
  son texto plano con variables.
- Edición del logo/color desde esta pantalla (sigue siendo la tarjeta "Marca").
- Plantillas distintas por audiencia en alertas (ver "variable inteligente"
  en la sección 3 — una sola plantilla por tipo de alerta cubre ambas
  audiencias).
- Envío de correos de prueba real (la vista previa in-app cubre la necesidad
  inicial).

## 1. Modelo de datos

Migración nueva en `supabase/migrations/`:

```sql
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

create index on public.organization_email_templates (organization_id);

alter table public.organization_email_templates enable row level security;

-- Mismo patrón de is_admin_of()/is_member_of() ya usado por el resto de
-- tablas de negocio (ver migraciones de organizations/suppliers).
create policy "org admins select own templates"
  on public.organization_email_templates for select
  using (is_member_of(organization_id));

create policy "org admins write own templates"
  on public.organization_email_templates for insert
  with check (is_admin_of(organization_id));

create policy "org admins update own templates"
  on public.organization_email_templates for update
  using (is_admin_of(organization_id))
  with check (is_admin_of(organization_id));

create policy "org admins delete own templates"
  on public.organization_email_templates for delete
  using (is_admin_of(organization_id));
```

- Una fila por combinación org+tipo (máx. 5 filas por organización).
- Sin fila = sin personalizar → se renderiza la plantilla predeterminada
  (ver sección 4). "Restaurar predeterminado" borra la fila.
- `is_admin_of`/`is_member_of` son los helpers de RLS ya definidos y usados
  por `organization_members` y el resto de tablas de negocio (ver
  `20260701232033_create_organization_members.sql`) — se reutilizan tal
  cual, mismo criterio de permisos que el resto del esquema.
- La policy de `select` usa `is_member_of` (no `is_admin_of`), a propósito:
  cualquier miembro de la organización, incluido un `reviewer`, puede **leer**
  las plantillas vía RLS aunque no tenga acceso a la UI de edición. Es una
  decisión deliberada, no un descuido — el contenido de una plantilla de
  correo no es información sensible, y mantener el `select` a nivel de
  organización (en vez de admin) simplifica cualquier código futuro que
  necesite renderizar/previsualizar un correo sin volver a verificar el rol
  (ej. un futuro endpoint de envío de prueba). Lo que sí está restringido a
  `owner`/`admin` es la **escritura** (`insert`/`update`/`delete`) y el
  **acceso a la página** `/app/settings/emails` (sección 7).
- El server además revalida el rol (`owner`/`admin`) y el `organization_id`
  de la sesión antes de cada escritura, igual que el resto de acciones
  privilegiadas (defensa en profundidad, regla 5 de `CLAUDE.md`).

## 2. Formato de `blocks` (jsonb)

Array ordenado de bloques. Cuatro tipos:

```ts
type EmailBlock =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image"; url: string; alt: string }
  | { id: string; type: "button"; label: string; hrefVar: string }
  | { id: string; type: "divider" };
```

- `id`: uuid corto generado en el cliente, solo para el `key` de React y los
  controles ↑/↓ — no tiene significado semántico.
- `text`: texto plano con tokens `{{variable}}`. Se escapa como HTML antes de
  insertar los valores (nunca se interpreta como HTML) — este es el límite de
  seguridad que evita inyección, ya que el admin nunca escribe HTML crudo.
- `image.url`: URL pública devuelta al subir a Storage (sección 5) —el campo
  nunca acepta una URL externa arbitraria pegada a mano, solo la que resulta
  de subir un archivo.
- `button.hrefVar`: nombre de una variable del sistema (`"inviteUrl"` o
  `"portalUrl"`), **nunca** una URL libre — así el CTA siempre apunta a un
  destino válido y no puede usarse para phishing desde dentro de la propia
  plataforma.
- `subject`: mismo tratamiento de texto plano + variables que los bloques de
  texto.

**Validación server-side (independiente del formulario):** `saveEmailTemplate`
valida el array completo de `blocks` con un esquema `zod` en el servidor —
`zod` no es dependencia directa hoy (`npm install zod`, sí está presente de
forma transitiva vía otros paquetes) pero es la herramienta correcta para
validar un array anidado de variantes por `type` sin reinventar un validador
a mano. Esto es necesario porque la Server Action puede invocarse
directamente (`fetch`/curl con el token de sesión), sin pasar por el
formulario del editor, así que el formulario nunca es el único punto de
validación. El esquema valida, por tipo de bloque, los campos requeridos y
sus longitudes (ver límites de tamaño abajo), y además:

- `image.url` se verifica contra el bucket `email-assets` **y** contra el
  prefijo de la propia organización (`{organizationId}/...` — ver sección 5):
  cualquier URL que no apunte a ese bucket+prefijo se rechaza, igual que se
  rechaza un token `{{...}}` no permitido. Evita que una organización
  referencie el asset de otra organización, o cualquier URL externa, pegando
  el valor directamente en el `formData`.
- `button.hrefVar` se valida contra la lista de variables de botón permitidas
  para ese `email_type` (sección 3) — un valor fuera de esa lista se rechaza.

**Límites de tamaño** (validados en el mismo esquema `zod`, con mensaje de
error claro, no truncado silencioso):

- Máximo 20 bloques por plantilla.
- Máximo 2000 caracteres por bloque de texto.
- Máximo 200 caracteres para `subject` y para `button.label`.

## 3. Variables por tipo de correo

| `email_type` | Variables disponibles | Variable del botón |
|---|---|---|
| `invite_supplier` | `{{organizationName}}` | `inviteUrl` |
| `invite_org_admin` | `{{organizationName}}`, `{{role}}` | `inviteUrl` |
| `alert_expiring` | `{{documentoDestinatario}}`, `{{documentTypeName}}`, `{{expiryDate}}`, `{{daysUntil}}` | `portalUrl` |
| `alert_expired` | `{{documentoDestinatario}}`, `{{documentTypeName}}`, `{{expiryDate}}` | `portalUrl` |
| `alert_missing` | `{{documentoDestinatario}}`, `{{documentTypeName}}` | `portalUrl` |

`{{documentTypeName}}` convive con `{{documentoDestinatario}}`, no lo
reemplaza — resolver la frase compuesta a una sola variable (sección
anterior) le quitó al admin la posibilidad de mencionar el tipo de documento
por sí solo una segunda vez en el cuerpo (ej. "recuerda que la
{{documentTypeName}} debe estar vigente...") o de usarlo en el `subject` sin
arrastrar la frase completa. `{{documentTypeName}}` resuelve siempre al
nombre del tipo de documento a secas (ej. "Certificación bancaria"), **igual
para las dos audiencias** — a diferencia de `{{documentoDestinatario}}`, no
varía según quién recibe el correo.

**`{{supplierName}}` no se expone como variable independiente en v1.** Para
la audiencia `supplier` no tiene un valor natural — el destinatario *es* el
proveedor, no tiene sentido que un correo se dirija a sí mismo por su propio
nombre de la misma forma que se referencia a un tercero. Resolverla a vacío
(o a "tu empresa") para `supplier` y al nombre real para `org` produciría
plantillas que leen bien para una audiencia y raro para la otra — exactamente
el problema que `{{documentoDestinatario}}` ya resuelve para el caso
"sujeto + documento". Si más adelante hace falta poder mencionar al
proveedor por su nombre en el cuerpo del correo dirigido a la organización,
se añade como mejora aparte, con su propia discusión de cómo se comporta
para la audiencia `supplier`.

**Variable inteligente `{{documentoDestinatario}}`:** una sola sustitución de
`{{destinatario}}` no funciona gramaticalmente en español — "tu" y "del
proveedor Acme" van en posiciones distintas de la frase ("**tu** documento
vence" vs. "el documento **del proveedor Acme** vence"), así que una
plantilla fija como "El documento de {{destinatario}} vence" produciría "el
documento de tu vence" para la audiencia `supplier`. En vez de sustituir una
palabra suelta, `{{documentoDestinatario}}` resuelve la **frase completa**
"sujeto + documento" según quién recibe el correo:

- Audiencia `supplier` → `"tu documento {documentTypeName}"`.
- Audiencia `org` → `"el documento {documentTypeName} del proveedor
  {supplierName}"` (con "del", nunca "de el").

| Tipo de alerta | Audiencia `supplier` | Audiencia `org` |
|---|---|---|
| `alert_expiring` | "tu documento Certificación bancaria" | "el documento Certificación bancaria del proveedor Acme S.A.S." |
| `alert_expired` | "tu documento Certificación bancaria" | "el documento Certificación bancaria del proveedor Acme S.A.S." |
| `alert_missing` | "tu documento Certificación bancaria" | "el documento Certificación bancaria del proveedor Acme S.A.S." |

El texto exacto es el mismo en los 3 tipos de alerta (la frase "sujeto +
documento" no cambia con el tipo) — lo que varía entre `alert_expiring`/
`alert_expired`/`alert_missing` es el resto de la plantilla alrededor de esta
frase (menciona vencimiento, fecha, o carga faltante), editable libremente
por el admin.

Esto reemplaza los mapas `subjectSupplier`/`subjectOrg` y
`bodySupplier`/`bodyOrg` hardcodeados en `buildAlertEmail`
(`lib/email/alerts.ts`) por una sola plantilla editable + esta sustitución
automática. Evita que las dos audiencias queden con textos que se
desincronizan con el tiempo.

Al guardar, el server valida que el texto de cada bloque y el `subject` solo
contengan tokens `{{...}}` de la lista permitida para ese `email_type`
(tabla de arriba, ya incluye `{{documentTypeName}}` para los 3 tipos de
alerta) — cualquier otro token se rechaza (error de validación, no se guarda
silenciosamente vacío). Los datos de ejemplo del preview (sección 7) incluyen
un valor para cada variable de la lista, `{{documentTypeName}}` incluido, así
que el admin ve de inmediato cómo queda al usarla junto a
`{{documentoDestinatario}}` en el mismo bloque.

## 4. Plantillas predeterminadas (fallback)

`lib/email/default-templates.ts` — una función `defaultBlocksFor(emailType)`
que traduce el HTML hardcodeado actual (`resend.ts`/`alerts.ts`) a bloques,
usada en dos momentos:

1. **Render:** cuando una organización no tiene fila en
   `organization_email_templates` para ese tipo, se usan estos bloques —
   sin cambio de comportamiento para organizaciones que nunca abren el
   editor, con una precisión importante para las 3 alertas (ver "Nota de
   diseño — regresión en alertas" al final de esta sección; las 2
   invitaciones sí quedan byte a byte idénticas).
2. **Editor:** al abrir por primera vez el editor de un tipo sin
   personalizar, se precargan estos bloques como punto de partida (el admin
   edita texto real, no una pantalla en blanco).

**Nota de diseño — regresión en alertas:** el modelo de una sola plantilla
por tipo de alerta para las dos audiencias (sección 3) tiene una
consecuencia directa sobre la copia por defecto: hoy la audiencia
`supplier` recibe una frase de acción que `org` no recibe (ej. "Renuévalo
cargando una versión nueva", "Súbelo desde tu portal", "Carga una versión
vigente...") porque esa acción solo tiene sentido para quien sube el
documento. Con una sola plantilla compartida no se puede mantener esa
asimetría, así que la copia por defecto de las 3 alertas **no es byte a
byte idéntica a la actual**. El criterio correcto, por tipo de correo:

- **Invitaciones (`invite_supplier`, `invite_org_admin`):** idénticas byte
  a byte al texto actual — nunca tuvieron esta asimetría, así que no hay
  ninguna razón para que cambien.
- **Alertas (`alert_expiring`, `alert_expired`, `alert_missing`):**
  equivalentes en contenido — mismos datos (documento, fecha, días) y
  mismo propósito informativo — pero con una redacción neutral que aplica
  igual a ambas audiencias, sin las frases de acción exclusivas del
  proveedor. Esto ya estaba implícito en la decisión de "variable
  inteligente" tomada durante el brainstorming; se deja explícito acá para
  que la implementación no se mida contra un criterio de "cero cambio de
  texto" que el propio diseño hace imposible de cumplir para alertas.

## 5. Storage: bucket público `email-assets`

Igual patrón que `org-logos` (ver diseño de branding): bucket público nuevo,
separado de `documentos` (que sigue privado) y de `org-logos` (logo de marca,
no imágenes de contenido de correo).

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-assets', 'email-assets', true, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
```

- Público por la misma razón que `org-logos`: las imágenes se ven en correos
  abiertos horas/días después, cuando una signed URL ya expiró.
- Sin policy de insert/update/delete para `authenticated` — solo el
  `service_role`, invocado desde la Server Action tras validar
  owner/admin de la organización (mismo patrón que
  `updateOrganizationBranding`).
- Validación por magic bytes reutilizando `lib/documents/file-type.ts`
  (`detectFileType`), nombre de archivo UUID, límite 2MB — mismas reglas que
  el logo.
- **Path con prefijo de organización:** cada subida se guarda bajo
  `{organizationId}/{uuid}.{ext}` dentro del bucket (mismo esquema de path
  que `org-logos`). Esto es lo que permite validar en `saveEmailTemplate`
  que un `image.url` efectivamente pertenece a la organización que está
  guardando la plantilla (sección 2) — sin el prefijo no habría forma de
  distinguir, solo mirando la URL, a qué organización pertenece cada imagen.

**Imágenes huérfanas (decisión explícita para v1):** no hay limpieza
automática de archivos abandonados — una subida que el admin nunca llega a
guardar en la plantilla, o una imagen que queda reemplazada tras varias
ediciones, se queda en el bucket indefinidamente. Se acepta este costo en v1,
mitigado por el límite de 2MB por archivo y por estar todo bajo el prefijo de
la organización (fácil de auditar/limpiar manualmente más adelante si hace
falta). La única limpieza que sí ocurre: "Restaurar predeterminado" hace un
borrado *best-effort* (no bloqueante, un fallo de borrado no impide restaurar)
de las imágenes referenciadas por los bloques de la fila que está eliminando.

## 6. Renderer compartido

`lib/email/render-blocks.ts` (nuevo, con test unitario TDD):

```ts
export function renderBlocks(blocks: EmailBlock[], variables: Record<string, string>): string
```

- Recorre los bloques en orden, sustituye `{{variable}}` en `text` (HTML-escaped),
  genera `<img>`/`brandButtonHtml(...)`/`<hr>` según el tipo.
- Bloques `button` resuelven `hrefVar` contra `variables[hrefVar]` (ej.
  `variables.inviteUrl`).
- Función pura, sin acceso a red/DB — fácil de testear con `node:test` igual
  que `template.test.ts`.

**Comportamiento ante variables sin valor:**
- Si un token permitido (ej. `{{expiryDate}}`) llega `undefined` o `""` en
  `variables` al momento de renderizar, se sustituye por cadena vacía y se
  loguea un `console.warn` (solo el nombre de la variable/tipo de correo,
  nunca contenido — regla 6 de `CLAUDE.md`) — no se lanza excepción, para no
  tumbar un envío completo de alertas por un dato faltante en un solo correo.
- Si el `hrefVar` de un bloque `button` no resuelve a un valor en `variables`
  (undefined/vacío), el bloque **se omite por completo** del HTML — nunca se
  emite un `<a href="">`, que sería un botón roto o potencialmente engañoso.

`lib/email/resend.ts` y `lib/email/alerts.ts` cambian de "construir HTML a
mano" a: cargar blocks (fila existente o default) → `renderBlocks(blocks, variables)`
→ `renderEmailHtml({ logoUrl, bodyHtml })` (sin cambios en esta última). El
cron de alertas (`app/api/cron/alerts/route.ts`) extiende su cache existente
de branding por corrida para también cachear la plantilla (blocks) por
organización+tipo, evitando repetir la consulta por cada correo enviado en la
misma corrida.

## 7. UI

- `app/app/settings/emails/page.tsx`: lista los 5 tipos de correo con su
  estado ("Predeterminado" / "Personalizado"). Gate de rol `owner`/`admin`
  igual que el resto de `/app` (revalidación server-side, no solo esconder
  el link).
- `app/app/settings/emails/[type]/page.tsx` + un client component
  `EmailTemplateEditor`: lista de bloques editable (añadir/quitar/↑↓/editar
  campos) a la izquierda, preview a la derecha, botón "Guardar" y botón
  "Restaurar predeterminado".
- **Preview:** se renderiza dentro de un `<iframe srcdoc={html}>`, no con
  `dangerouslySetInnerHTML` directo en la página. Dos razones: aísla los
  estilos inline del correo (`renderEmailHtml`/`renderBlocks` generan CSS
  pensado para clientes de correo, no para convivir con los estilos globales
  de `/app`) y se acerca más al render real que verá el destinatario en su
  cliente de correo. El `html` del `srcdoc` sale de `renderBlocks(blocks, sampleVariables)`
  + `renderEmailHtml(...)` — los mismos datos de ejemplo que ya generan las
  variables permitidas de cada `email_type` (sección 3). El preview también
  muestra, fuera del iframe, el **subject** ya renderizado con esos mismos
  datos de ejemplo (no solo el cuerpo).
- Nuevo item de navegación en `components/app-sidebar.tsx` bajo
  `isAdmin` (junto a "Plan"), ej. "Correos" o dentro de un futuro grupo
  "Configuración" si se decide agrupar — a definir en el plan de
  implementación.
- Server Actions nuevas en `lib/actions/email-templates.ts`:
  `getEmailTemplate`, `saveEmailTemplate`, `resetEmailTemplate`,
  `uploadEmailImage` — todas revalidan `getCurrentMembership` +
  `["owner","admin"].includes(role)` antes de tocar la fila de la
  organización del usuario (nunca confían en un `organizationId` de
  formulario sin cruzarlo contra la sesión). `saveEmailTemplate` además
  corre la validación `zod` de `blocks` descrita en la sección 2 antes de
  escribir en la base de datos.

## Definición de "hecho" (además del checklist estándar de `CLAUDE.md`)

- [ ] RLS probada con dos organizaciones distintas: la org A no puede leer ni
      escribir plantillas de la org B.
- [ ] Un usuario con rol `reviewer` no puede acceder a `/app/settings/emails`
      ni invocar `saveEmailTemplate`/`resetEmailTemplate`/`uploadEmailImage`
      (redirect/rechazo server-side). Sí puede leer las filas de su propia
      organización vía RLS (`select` es a nivel de miembro, ver sección 1) —
      eso es intencional, no una fuga.
- [ ] Guardar un bloque de texto con un token `{{variable}}` no permitido
      para ese `email_type` es rechazado, no guardado en blanco.
- [ ] Una organización sin fila personalizada en `invite_supplier`/
      `invite_org_admin` sigue enviando exactamente el mismo texto que hoy,
      byte a byte (regresión cero para invitaciones).
- [ ] Una organización sin fila personalizada en `alert_expiring`/
      `alert_expired`/`alert_missing` envía una redacción equivalente en
      contenido (mismo documento, fecha y días — sin datos faltantes ni
      tokens `{{...}}` sin resolver), con texto neutral válido para ambas
      audiencias, sin las frases de acción exclusivas del proveedor que
      tenía el texto anterior (ver "Nota de diseño — regresión en alertas"
      en la sección 4). Esto NO se mide contra "mismo texto que hoy".
- [ ] La variable `{{documentoDestinatario}}` resuelve a la frase completa
      correcta ("tu documento X" / "el documento X del proveedor Y") para
      audiencia `supplier` vs `org`, en los 3 tipos de alerta.
- [ ] `{{documentTypeName}}` resuelve al mismo valor ("Certificación
      bancaria", sin frase alrededor) para ambas audiencias en el mismo
      envío, y puede usarse en `subject` y en el cuerpo de forma
      independiente de `{{documentoDestinatario}}` (ej. mencionarlo dos
      veces en el mismo correo).
- [ ] Los botones nunca aceptan una URL libre — solo `inviteUrl`/`portalUrl`.
- [ ] `npm run test:unit` cubre `render-blocks.test.ts` con casos de cada
      tipo de bloque, de la variable inteligente, y de los dos casos de
      variable sin valor: token de texto vacío/undefined (se sustituye por
      `""` sin lanzar) y `hrefVar` de botón sin resolver (el bloque se omite
      del HTML, nunca `href=""`).
