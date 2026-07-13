# Plan de ejecución — SaaS de Gestión Documental de Proveedores
### Multi-tenant · Seguridad por diseño · Cumplimiento Ley 1581 / SAGRILAFT
**JP Digital Solutions — Juan Pablo Jiménez Pinzón**

> Este documento es la hoja de ruta técnica para construir el SaaS con **Claude Code**. Cada fase incluye objetivo, entregable y **prompts listos para copiar/pegar**. El eje transversal es la **seguridad y la prevención de filtración de datos**, porque los documentos que manejarás (cédulas de representantes legales, estados financieros, certificaciones bancarias, beneficiario final) son datos personales sensibles + información financiera confidencial de terceros regulados.

---

## 0. Decisiones de arquitectura (léelas antes de escribir una línea)

| Decisión | Elección recomendada | Por qué |
|---|---|---|
| Framework | **Next.js 15 (App Router)** + TypeScript | Tu stack, Server Actions/Route Handlers para operaciones privilegiadas server-side |
| Backend/DB | **Supabase (Postgres + Auth + Storage)** | RLS a nivel de base de datos = defensa real contra fugas cross-tenant |
| Multi-tenancy | **Shared schema + columna `organization_id` + RLS** | Costo-eficiente y nativo. (Ver nota de aislamiento reforzado abajo) |
| Almacenamiento archivos | **Supabase Storage, buckets PRIVADOS**, rutas `org_id/supplier_id/...` | Los archivos nunca son públicos; solo se acceden por *signed URLs* de vida corta |
| UI | Tailwind + shadcn/ui | Consistente con tus otros proyectos |
| Emails/alertas | **Resend** (plan free) + **Cron Trigger de Cloudflare** llamando a `/api/cron/alerts` | Alertas de vencimiento y faltantes |
| Deploy | **Cloudflare Workers** vía `@opennextjs/cloudflare` | Dominio y DNS también en Cloudflare |
| **Entornos** | **Local primero (Supabase CLI + Docker) → luego Supabase Pro** | Construyes y pruebas todo gratis en local; migras a Pro solo cuando esté probado |
| Región de datos | Supabase Pro en **us-east-1** (o el más cercano) | Documenta la transferencia internacional para Habeas Data |
| Plan Supabase | **Pro (~USD 25/mes) + DPA firmado**, NO Team | La seguridad de la plataforma es igual en Pro; el Team (~USD 599) solo da reportes descargables/SSO que no necesitas |

**Estrategia de entornos (2 fases) — léela antes de la Fase 1:**
- **Fase A — desarrollo LOCAL** con la CLI de Supabase (stack completo en Docker: Postgres, Auth, Storage, Studio). Todo el proyecto se construye y prueba aquí, sin costo. Requiere **Docker Desktop**.
- **Fase B — migración a Supabase PRO** (hosted). Solo cuando el producto esté probado. Ver la fase final "Migración a Pro + deploy".

Regla de oro para que la migración sea indolora: **define TODA la base de datos y los buckets por migraciones/SQL versionadas** (nunca a mano en Studio), usa las mismas políticas RLS en local y en prod, y no hardcodees nada. Con eso, migrar es `supabase db push` + cargar las llaves de producción como secrets de Cloudflare.

> ⚠️ Las llaves que imprime `supabase status` en local son **llaves de demo públicas e idénticas para todos**. Nunca deben llegar a Cloudflare, al repo ni a producción. En prod se usan exclusivamente las llaves del proyecto Pro.

**Nota crítica sobre aislamiento (el punto que preocupa al cliente):**
El patrón *shared schema + RLS* es el estándar de la industria y es seguro **si las políticas RLS están bien hechas y probadas**. El 95% de las filtraciones en SaaS multi-tenant vienen de **RLS ausente o mal configurada**, no del patrón en sí. Para tu caso, la estrategia es **defensa en profundidad de 4 capas**:

1. **RLS en cada tabla** (nadie ve filas de otra organización, ni siquiera con el anon key).
2. **Chequeo a nivel de aplicación** (el server valida `organization_id` en cada operación, aunque RLS ya lo haga).
3. **Storage con RLS por carpeta** + signed URLs de 60 s generadas solo en el server.
4. **Auditoría inmutable** (todo acceso a un documento queda registrado).

Si un cliente grande (ej. Michael Page) exige aislamiento físico, la opción premium (Opción 2 de tu propuesta) puede ofrecer **un proyecto Supabase dedicado por cliente**. No lo construyas ahora; déjalo como capacidad de la arquitectura.

---

## 1. Modelo de amenazas y seguridad (esto es lo que vende tu SaaS)

### 1.1 Datos que manejas y su clasificación

| Dato | Clasificación | Riesgo si se filtra |
|---|---|---|
| Copia cédula/pasaporte del rep. legal | **Dato personal — alto** | Suplantación, sanción SIC |
| Estados financieros | Confidencial financiero | Daño reputacional/comercial |
| Certificación bancaria | Confidencial | Fraude |
| RUT / NIT | Semi-público pero sensible en conjunto | Perfilamiento |
| Beneficiario final (>5%) | **Dato personal + SAGRILAFT** | Sanción Supersociedades + SIC |
| Certificaciones comerciales | Confidencial | Menor |

### 1.2 Matriz de amenazas → mitigación

| # | Amenaza | Mitigación en el diseño |
|---|---|---|
| T1 | **Fuga cross-tenant** (org A ve datos de org B) | RLS con `organization_id` + `WITH CHECK` en INSERT/UPDATE + tests automáticos de aislamiento |
| T2 | Archivos expuestos públicamente | Buckets **privados**, sin URLs públicas; signed URLs TTL 60 s generadas server-side |
| T3 | **IDOR** (adivinar el ID de un documento ajeno) | IDs `uuid` + RLS + validación de pertenencia en cada endpoint |
| T4 | `service_role` key filtrada al cliente | La key nunca sale del server; verificación en CI de que no está en el bundle |
| T5 | Inyección vía nombre de archivo / XSS | Sanitizar nombres, guardar con UUID, `Content-Disposition: attachment`, CSP estricta |
| T6 | Subida de malware / ejecutable | Allowlist MIME por *magic bytes*, límite de tamaño, extensiones permitidas (PDF/JPG/PNG), (opcional) escaneo antivirus |
| T7 | PII en logs | Nunca loguear contenido ni nombres; solo IDs y eventos |
| T8 | Acceso indebido de un insider | Auditoría **append-only** + roles mínimos + RLS también para lectura de logs |
| T9 | Robo de sesión | Cookies httpOnly/secure/SameSite, expiración corta, **MFA (TOTP)** para admins |
| T10 | Datos en reposo/tránsito | Cifrado en reposo (Supabase AES-256) + TLS forzado + **cifrado app-level** de campos ultra-sensibles (nº cédula) con pgcrypto/Vault |
| T11 | Pérdida de datos | PITR (point-in-time recovery) + backups verificados |
| T12 | Enumeración de invitaciones | Tokens de invitación aleatorios de 256 bits, un solo uso, expiración |

### 1.3 Principios no negociables (van al CLAUDE.md)

- **RLS activada en TODAS las tablas.** Tabla sin RLS = tabla pública. Ninguna migración se acepta sin sus políticas.
- **El `service_role` key solo vive server-side.** Nunca en un componente cliente, nunca en un `NEXT_PUBLIC_*`.
- **Todo bucket es privado.** Cero URLs públicas de documentos.
- **Cada operación privilegiada pasa por un Server Action / Route Handler** que revalida pertenencia al tenant.
- **Todo acceso/descarga de documento se audita.**
- **Ningún dato personal en logs, mensajes de error o URLs.**

---

## 2. Modelo de datos

```
organizations            -- tenants (las empresas cliente: AQUIA, etc.)
  id (uuid, pk)
  name, nit, plan, created_at

organization_members     -- usuarios internos de la empresa
  id, organization_id (fk), user_id (fk auth.users)
  role  -- 'owner' | 'admin' | 'reviewer'
  status

profiles                 -- extiende auth.users
  user_id (pk), full_name, phone, mfa_enabled

suppliers                -- proveedores de cada empresa
  id, organization_id (fk)
  legal_name, nit, category, status  -- 'pendiente'|'en_revision'|'activo'|'rechazado'|'vencido'
  primary_contact_email

document_types           -- catálogo configurable por empresa
  id, organization_id (fk)
  name, description, requires_expiry (bool), default_validity_days

supplier_requirements    -- qué docs debe entregar cada proveedor
  id, organization_id, supplier_id, document_type_id, is_mandatory

documents                -- metadatos del archivo (NO el archivo)
  id, organization_id, supplier_id, document_type_id
  storage_path, file_hash (sha256), mime_type, size_bytes
  status  -- 'cargado'|'aprobado'|'rechazado'|'vencido'
  issue_date, expiry_date, uploaded_by, reviewed_by, review_notes

document_versions        -- historial de cada documento
  id, document_id, storage_path, version_no, created_at, created_by

invitations              -- acceso seguro del proveedor
  id, organization_id, supplier_id, email
  token_hash (sha256 del token), expires_at, used_at

audit_logs               -- inmutable, append-only
  id, organization_id, actor_id, actor_type ('user'|'supplier'|'system')
  action, entity_type, entity_id, ip, user_agent, created_at

notifications            -- cola de alertas enviadas
  id, organization_id, type, channel, recipient, payload, sent_at, status
```

Reglas de oro del esquema:
- **`organization_id` en TODA tabla de negocio** (incluso donde parezca redundante) → habilita RLS simple y rápida.
- **Índice en `organization_id`** en cada tabla (rendimiento de RLS).
- IDs siempre `uuid` (evita enumeración).
- `documents` guarda `file_hash` para detectar duplicados y verificar integridad.

---

## 3. Cumplimiento legal Colombia (resumen accionable)

Marco vigente a 2026: **Ley 1581 de 2012** + **Decreto 1377 de 2013** (protección de datos personales, vigilancia de la **SIC**), **Ley 1266 de 2008** (habeas data financiero) y el contexto **SAGRILAFT/PTEE — Ley 2195 de 2022** que motiva la recolección. Hay una reforma en trámite (PL 274/2025 acumulado con 214/2025) que se alinea con el RGPD europeo (perfilamiento, decisiones automatizadas, datos biométricos); conviene diseñar ya en esa dirección.

Obligaciones que impactan el producto:
- **Autorización de tratamiento**: capturar y guardar el consentimiento del titular (proveedor y personas naturales relacionadas) con fecha, finalidad y versión de la política.
- **Finalidad y minimización**: solo pide lo necesario; no reutilices datos para otros fines.
- **Derechos del titular (Habeas Data)**: flujos para consultar (10 días), rectificar y **suprimir** datos (15 días para reclamos), salvo deber legal/contractual de conservación.
- **Medidas de seguridad**: técnicas y organizativas proporcionales a la sensibilidad (justo lo que estás construyendo).
- **RNBD (Registro Nacional de Bases de Datos)**: obligatorio para responsables con **activos > 100.000 UVT** (~USD 1,1M). El **responsable es la empresa cliente**, no tú; tú eres **Encargado del Tratamiento**. → Necesitas un **contrato de transmisión/encargo de datos** con cada cliente.
- **Transferencia internacional**: si Supabase está fuera de Colombia, documéntalo y respáldalo en el contrato y la política de privacidad.
- **Reporte de incidentes**: define un procedimiento de notificación de brechas al cliente (responsable) y a la SIC.
- Sanciones SIC: hasta **2.000 SMMLV**. Esto es el argumento comercial de por qué invertir en seguridad.

> Acción concreta: prepara desde el inicio (1) Política de Tratamiento de Datos, (2) Aviso de Privacidad, (3) modelo de **Contrato de Encargo/Transmisión** con el cliente, (4) Manual de manejo de incidentes. Estos NO los genera Claude Code, pero deben existir antes de vender. Buscar asesoría de un abogado en protección de datos es dinero bien gastado dado el tipo de cliente.

---

## 4. CLAUDE.md del proyecto (guardrails de seguridad)

Crea este archivo en la raíz del repo **antes de programar**. Hará que cada sesión de Claude Code respete las reglas de seguridad automáticamente.

```markdown
# CLAUDE.md — SaaS Gestión Documental (JP Digital Solutions)

## Contexto
SaaS multi-tenant para gestión documental de proveedores. Maneja datos
personales sensibles (cédulas, EEFF, certificaciones bancarias, beneficiario
final). La seguridad y el aislamiento entre tenants es el requisito #1.

**Estrategia de entornos (2 fases):**
- Fase A — desarrollo LOCAL con la CLI de Supabase (stack en Docker), sin costo.
- Fase B — migración a Supabase PRO (hosted), solo cuando esté probado.
Diseña TODO desde la Fase A para migrar sin fricción: migraciones versionadas,
nada hardcodeado, mismas políticas RLS en local y en prod.

## Stack
- Next.js 15 App Router + TypeScript (sin carpeta src/ — App Router en raíz)
- Supabase (Postgres + Auth + Storage), @supabase/ssr
- Supabase CLI + Docker Desktop para el entorno local
- Tailwind + shadcn/ui
- Resend (emails, plan free), Cron Trigger de Cloudflare (alertas)
- Deploy: Cloudflare Workers vía `@opennextjs/cloudflare`

## Entorno LOCAL (Fase A) — requiere Docker Desktop corriendo
supabase init | supabase start | supabase status | supabase stop
supabase migration new <nom> | supabase db reset
- API/Storage: http://127.0.0.1:54321 · Studio: http://127.0.0.1:54323
- Postgres: postgresql://postgres:postgres@127.0.0.1:54322/postgres
- Emails de prueba: ver `supabase status` (Inbucket/Mailpit)
.env.local (Fase A) usa las llaves que imprime `supabase status`.

## Reglas de seguridad INVIOLABLES (aplican en local Y en prod)
1. RLS activada en TODA tabla. Ninguna migración se acepta sin sus políticas
   RLS (SELECT/INSERT/UPDATE/DELETE) con USING y WITH CHECK correctos.
2. Toda tabla de negocio lleva columna organization_id con índice.
3. El service_role key SOLO se usa en server (Route Handlers / Server Actions /
   Edge Functions). NUNCA en componentes cliente ni en variables NEXT_PUBLIC_*.
4. Buckets de Storage SIEMPRE privados. Los documentos se sirven únicamente
   por signed URLs generadas en el server con TTL <= 60 segundos.
5. Toda operación privilegiada revalida la pertenencia al tenant en el server,
   aunque RLS ya lo haga (defensa en profundidad).
6. Prohibido loguear PII, nombres de archivo, contenido o tokens. Solo IDs
   y nombres de eventos.
7. Subidas: validar MIME por magic bytes, tamaño máx, extensiones permitidas
   (pdf, jpg, jpeg, png). Guardar el archivo con nombre UUID, nunca el original.
8. Todo acceso, descarga, aprobación o rechazo de un documento se registra en
   audit_logs (append-only; sin UPDATE ni DELETE a nivel de BD).
9. IDs siempre uuid. Nunca exponer IDs secuenciales ni datos en la URL.
10. Cookies de sesión httpOnly, secure, SameSite=Lax. Headers de seguridad
    (CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff).

## ⚠️ Regla crítica local → prod
Las llaves de `supabase start/status` son llaves de demo PÚBLICAS e idénticas
para todos. NUNCA se copian a producción, a Cloudflare ni al repo. En prod se
usan solo las llaves del proyecto Pro, cargadas como secrets de Cloudflare.

## Convenciones
- Comandos en CMD de Windows (no PowerShell).
- Toda la BD se define por MIGRACIONES en supabase/migrations (nunca a mano en
  Studio sin capturarlo en migración).
- Cada tabla nueva → su migración incluye la RLS en el mismo archivo.
- Buckets y sus políticas se definen por SQL/migración (o config.toml) para que
  se repliquen en prod. Datos de prueba en supabase/seed.sql (nunca reales).
- Tests de aislamiento multi-tenant antes de considerar una feature "lista".

## Definición de "hecho" para features con datos
- [ ] RLS probada como dos usuarios de dos organizaciones distintas (0 fugas).
- [ ] Server revalida organization_id.
- [ ] Acción registrada en audit_logs.
- [ ] Sin PII en logs/errores.
- [ ] La migración corre limpia con `supabase db reset`.
```

---

## 5. Roadmap por fases con prompts para Claude Code

> Ejecuta las fases en orden. Después de cada prompt, revisa el diff antes de aceptar. Marca en Claude Code que lea siempre el `CLAUDE.md`.

### Fase 1 — Setup + base de seguridad (entorno LOCAL)

**Objetivo:** proyecto Next.js 15 + Supabase LOCAL (CLI/Docker) corriendo, headers de seguridad, estructura, CLAUDE.md. Sin costo.

**Prompt 1.1**
```
Vamos a iniciar un SaaS multi-tenant de gestión documental. Antes de codear,
lee y respeta el archivo CLAUDE.md de la raíz (lo voy a crear yo).

Trabajaremos en LOCAL con la CLI de Supabase (Docker) y migraremos a Supabase
Pro después. Asume Docker Desktop instalado.

Crea el proyecto base:
- Next.js 15 con App Router en la raíz (sin carpeta src/), TypeScript, Tailwind.
- Instala y configura shadcn/ui.
- Instala @supabase/supabase-js y @supabase/ssr.
- Inicializa Supabase local: guíame con supabase init y supabase start, y dime
  cómo leer las URLs y llaves LOCALES con supabase status.
- Crea la estructura de utilidades de Supabase para App Router:
  - lib/supabase/client.ts  (cliente browser, usa anon key)
  - lib/supabase/server.ts  (cliente server con cookies, usa anon key)
  - lib/supabase/admin.ts   (cliente con service_role, SOLO server, con un
    comentario grande advirtiendo que jamás se importe en cliente)
- Crea .env.local.example y .env.local. En Fase A, .env.local usa las llaves
  LOCALES de `supabase status` (URL http://127.0.0.1:54321). Añade .env.local
  al .gitignore. Recuérdame que estas llaves locales son de demo públicas y
  NUNCA van a producción.
- Configura next.config para headers de seguridad: HSTS, X-Frame-Options DENY,
  X-Content-Type-Options nosniff, Referrer-Policy, y una Content-Security-Policy
  estricta compatible con Next.
- Comandos para Windows CMD.
Dame los pasos exactos en orden para levantar todo en local.
```

**Prompt 1.2**
```
Añade una verificación en CI (y un script npm) que falle el build si detecta
la cadena del service_role key o SUPABASE_SERVICE_ROLE en cualquier archivo
del bundle cliente o en archivos con "use client". Explícame cómo probarlo.
```

---

### Fase 2 — Modelo de datos + RLS (la fase más importante)

**Objetivo:** todas las tablas con RLS correcta y tests de aislamiento.

**Prompt 2.1**
```
Crea las migraciones SQL en /supabase/migrations para el modelo de datos.
Tablas: organizations, organization_members, profiles, suppliers,
document_types, supplier_requirements, documents, document_versions,
invitations, audit_logs, notifications. (Te paso el detalle de columnas
abajo — si algo falta, propónlo.)

Requisitos OBLIGATORIOS:
- Todas las tablas de negocio con columna organization_id (uuid) + índice.
- Todos los IDs uuid con default gen_random_uuid().
- Habilita RLS en TODAS las tablas en la misma migración.
- Crea una función SECURITY DEFINER is_member_of(org uuid) que verifique que
  auth.uid() pertenece a organization_members de esa org y esté activo.
- Políticas RLS:
  * organization_members y datos internos: solo miembros de la org (SELECT),
    y escritura solo para role in ('owner','admin').
  * suppliers/documents/etc.: SELECT e INSERT/UPDATE con is_member_of(organization_id),
    usando USING y WITH CHECK para impedir insertar en otra org.
  * audit_logs: INSERT permitido a miembros; SELECT solo owner/admin; sin UPDATE
    ni DELETE (append-only) — revoca esos permisos.
- Índices en todas las columnas usadas por las políticas.
Muéstrame el SQL comentado y cómo aplicarlo con la Supabase CLI en Windows.

[pega aquí el detalle de columnas de la sección "Modelo de datos" del plan]
```

**Prompt 2.2 — tests de aislamiento (no te saltes esto)**
```
Escribe un script de prueba (TypeScript) que:
1. Cree 2 organizaciones (Org A, Org B) con un usuario cada una.
2. Inserte un proveedor y un documento en cada org.
3. Autenticado como usuario de Org A, intente leer proveedores y documentos
   de Org B y verifique que NO ve nada (debe devolver 0 filas).
4. Intente insertar un supplier con organization_id de Org B y verifique que
   RLS lo rechaza.
Usa el cliente con anon key (nunca service_role) para que RLS aplique.
Explícame cómo correrlo y qué salida esperar. Este test debe pasar antes de
seguir.
```

---

### Fase 3 — Autenticación + multi-tenancy

**Objetivo:** login seguro, selección de organización, roles.

**Prompt 3.1**
```
Implementa autenticación con Supabase Auth (email + contraseña) usando
@supabase/ssr en App Router:
- Middleware que refresca sesión y protege rutas /app/*.
- Trigger handle_new_user que crea el registro en profiles al registrarse.
- Flujo de onboarding: al crear cuenta de empresa se crea la organization y el
  usuario queda como owner en organization_members.
- Página de login, registro y logout con shadcn/ui.
- Cookies httpOnly/secure/SameSite. Sin exponer tokens en cliente.
Respeta el CLAUDE.md. Dame los pasos exactos.
```

**Prompt 3.2**
```
Añade MFA (TOTP) opcional-obligatorio para roles owner/admin usando Supabase
Auth MFA: enrolar autenticador, verificar, y exigir el segundo factor en login
para esos roles. UI con shadcn/ui.
```

---

### Fase 4 — Proveedores + invitaciones seguras

**Objetivo:** CRUD de proveedores y acceso del proveedor por token.

**Prompt 4.1**
```
Implementa la gestión de proveedores (solo miembros de la org):
- Listado con estado (pendiente/en_revision/activo/rechazado/vencido),
  búsqueda y filtro.
- Crear/editar proveedor.
- Configurar document_types por org y supplier_requirements por proveedor.
Todo vía Server Actions que revalidan organization_id. Registra en audit_logs.
```

**Prompt 4.2 — invitación con token (revisa la seguridad)**
```
Implementa el flujo de invitación del proveedor:
- Al invitar, generar un token aleatorio de 32 bytes (base64url). Guardar SOLO
  el sha256 del token en invitations.token_hash, con expires_at (72h) y un solo
  uso (used_at).
- Enviar por Resend un enlace https://.../invite?token=XXXX
- La página valida el token comparando hash, expiración y uso; si es válido,
  crea/asocia el acceso del proveedor y marca used_at.
- El proveedor NO es un miembro de la organización: dale un rol/acceso acotado
  que por RLS solo pueda ver/gestionar SUS propios documentos, nunca datos de la
  empresa ni de otros proveedores.
Explícame el modelo de acceso del proveedor y sus políticas RLS específicas.
```

---

### Fase 5 — Carga y descarga segura de documentos (núcleo del riesgo)

**Objetivo:** subir/descargar archivos sin exposición pública.

**Prompt 5.1**
```
Configura Supabase Storage:
- Bucket privado "documentos".
- Convención de ruta: {organization_id}/{supplier_id}/{document_id}/{uuid}.{ext}
- Políticas RLS en storage.objects para que un usuario solo pueda operar sobre
  objetos cuya primera carpeta (organization_id) sea de una org a la que
  pertenece, y un proveedor solo sobre sus propias carpetas.
Muéstrame las políticas SQL comentadas.
```

**Prompt 5.2**
```
Implementa la SUBIDA de documentos vía Server Action:
- Validar tamaño (máx 15MB), extensión permitida (pdf, jpg, jpeg, png) y MIME
  real por magic bytes (no confíes en el nombre ni en el content-type del
  cliente).
- Renombrar a uuid.{ext}; calcular sha256 (file_hash).
- Subir al bucket privado en la ruta correcta.
- Crear fila en documents (+ document_versions v1) con issue_date/expiry_date.
- Registrar en audit_logs (action='upload', sin nombre de archivo original en
  claro en logs).
Manejo de errores sin filtrar PII.
```

**Prompt 5.3**
```
Implementa la DESCARGA/visualización segura:
- Un Route Handler server-side que: valida sesión, valida pertenencia
  (org o proveedor dueño), y genera una signed URL con expiración de 60s.
- Nunca exponer signed URLs en listados; generarlas solo al hacer clic.
- Registrar cada descarga en audit_logs (action='download').
- Servir con Content-Disposition attachment.
```

**Prompt 5.4 — versionado + integridad**
```
Cuando un proveedor resube un documento del mismo tipo, crea una nueva versión
en document_versions (v2, v3...), conserva el historial y actualiza documents al
puntero de la versión vigente. Muestra el historial en la UI de la empresa.
Verifica integridad comparando file_hash.
```

---

### Fase 6 — Estados, validación y flujo de aprobación

**Prompt 6.1**
```
Implementa el flujo de revisión (rol reviewer/admin):
- Ver documentos cargados por proveedor, aprobar o rechazar con nota.
- Recalcular el estado del proveedor: activo cuando todos los documentos
  mandatorios están aprobados y vigentes; vencido si alguno pasó expiry_date;
  en_revision si hay cargados sin revisar; pendiente si faltan.
- Todo cambio de estado se audita.
Implementa la lógica de estado como función pura y con tests unitarios.
```

---

### Fase 7 — Alertas automáticas (email)

**Prompt 7.1**
```
Implementa alertas con un Cron Trigger de Cloudflare + Resend:
- Job diario que detecta: documentos por vencer (30/15/5 días), documentos
  vencidos, y documentos faltantes/obligatorios sin cargar.
- Enviar email a la empresa y al proveedor según corresponda.
- Idempotencia: no reenviar la misma alerta el mismo día (tabla notifications).
- Proteger el endpoint del cron con un secreto (CRON_SECRET) verificado en el
  server.
Explícame la configuración del Worker satélite con Cron Trigger en wrangler.toml.
```

---

### Fase 8 — Auditoría, hardening y anti-fuga

**Prompt 8.1**
```
Refuerza la seguridad transversal:
- Middleware de rate limiting (login, subida, generación de signed URLs) por IP
  y por usuario (usa Upstash Redis o el mecanismo que recomiendes gratis).
- Revisa que audit_logs sea append-only a nivel de BD (revoca UPDATE/DELETE).
- Página de auditoría para owner/admin: quién accedió/descargó qué y cuándo.
- Verifica que ningún error de servidor exponga stack traces o PII al cliente.
- Sanitiza y limita metadatos.
```

**Prompt 8.2 — cifrado app-level de campos ultra-sensibles**
```
Para el número de documento de identidad del representante legal y del
beneficiario final, implementa cifrado a nivel de aplicación:
- Usa Supabase Vault (o pgcrypto con clave gestionada fuera de la BD) para
  cifrar/descifrar estos campos.
- Solo el server descifra, solo cuando es estrictamente necesario, y registra
  el acceso en audit_logs.
Explícame el manejo y rotación de la clave.
```

---

### Fase 9 — Cumplimiento en producto (Habeas Data)

**Prompt 9.1**
```
Implementa las piezas de cumplimiento de la Ley 1581:
- Captura y almacenamiento de la autorización de tratamiento (fecha, versión de
  política aceptada, finalidad) al registrar empresa y al aceptar invitación el
  proveedor.
- Páginas públicas: Política de Tratamiento de Datos y Aviso de Privacidad
  (déjalas como plantillas con placeholders para que un abogado las complete).
- Flujo de derechos del titular: solicitud de consulta, rectificación y
  supresión, con bandeja para el admin. Respeta plazos (consulta 10 días,
  reclamo 15 días).
- Exportación de datos de un proveedor (portabilidad) y borrado seguro
  (respetando retención legal/contractual).
```

---

### Fase 10 — Planes (Opción 1 vs Opción 2), migración a Pro y despliegue

**Prompt 10.1**
```
Implementa un gating de funcionalidades por plan de la organización:
- Plan "estandar" (Opción 1): estados básicos, alertas básicas.
- Plan "avanzado" (Opción 2): estados personalizables, reglas dinámicas,
  validación por contenido (OCR) — deja el OCR como módulo enchufable/feature
  flag para implementarlo después.
El gating es lógica de aplicación, NO reemplaza RLS.
```

**Prompt 10.2 — OCR (feature avanzada, opcional)**
```
Diseña (sin implementar aún) el módulo de validación por contenido (OCR):
- Al aprobar, correr OCR en un Edge Function/servicio para verificar que el
  documento corresponde (ej: el RUT contiene el NIT esperado; el certificado de
  Cámara tiene fecha < 30 días). Propón opciones de OCR y su costo/privacidad
  (idealmente procesar sin que el archivo salga de infraestructura controlada).
Entrégame el diseño y los puntos de riesgo de privacidad antes de codear.
```

**Prompt 10.3 — checklist de seguridad pre-producción**
```
Genera y ejecuta un checklist de seguridad pre-lanzamiento y córrelo contra el
proyecto, reportando hallazgos:
- RLS activa y probada en todas las tablas (test de aislamiento en verde).
- service_role solo en server (chequeo de CI en verde).
- Buckets privados, sin URLs públicas.
- Signed URLs TTL <= 60s.
- Headers de seguridad presentes (verifícalos).
- Rate limiting activo en endpoints sensibles.
- Auditoría append-only funcionando.
- Backups/PITR habilitados en Supabase.
- Sin PII en logs.
- MFA disponible para admins.
- Variables de entorno configuradas como secrets de Cloudflare (no en el repo).
Dame el reporte y las acciones pendientes.
```

**Prompt 10.4 — migración a Supabase Pro + deploy**
```
Es hora de migrar de LOCAL a Supabase Pro y desplegar. Guíame paso a paso
(Windows CMD):

1. Crear el proyecto en Supabase (plan Pro) y elegir región (documentar que es
   transferencia internacional para Ley 1581).
2. supabase link --project-ref <ref> y supabase db push para aplicar TODAS las
   migraciones al remoto. Verificar que quedaron todas las tablas + RLS.
3. Crear los buckets privados en el remoto y verificar sus políticas RLS
   (ya vienen definidos por migración — solo verificar, no crear a mano).
4. Cargar en Cloudflare las variables con las llaves de PRODUCCIÓN del
   proyecto Pro (service_role sin prefijo NEXT_PUBLIC_) como *secrets*.
   Confirmar que NINGUNA llave local quedó en el código ni en el repo.
5. Activar en Supabase: SSL Enforcement, Network Restrictions, MFA obligatorio
   en la organización, y dejar el logging de conexiones encendido.
6. (Recomendado para datos críticos) habilitar PITR.
7. Conectar Resend real (plan free — 100 emails/día) y verificar envío de
   invitaciones/alertas.
8. Configurar el Worker satélite con Cron Trigger que llame a
   `/api/cron/alerts` con CRON_SECRET, y verificar que corre.
9. Correr el test de aislamiento multi-tenant CONTRA el remoto (debe pasar).
10. Prueba de humo end-to-end: crear org, invitar proveedor, subir doc, aprobar,
    recibir alerta.
Recuérdame también firmar el DPA (contrato de encargo) desde la página de
documentos legales del dashboard de Supabase.
```

---

## 6. Checklist de seguridad (versión corta para pegar en el repo)

- [ ] RLS en todas las tablas + tests de aislamiento en verde
- [ ] `organization_id` + índice en todas las tablas de negocio
- [ ] `service_role` nunca en cliente (chequeo CI)
- [ ] Buckets privados, signed URLs TTL ≤ 60 s
- [ ] Validación de subidas por magic bytes + límite de tamaño
- [ ] Auditoría append-only de accesos/descargas
- [ ] Rate limiting en login/subida/signed URLs
- [ ] MFA para owner/admin
- [ ] Headers de seguridad (CSP/HSTS/X-Frame-Options/nosniff)
- [ ] Cifrado app-level de campos ultra-sensibles
- [ ] PITR/backups verificados
- [ ] Sin PII en logs ni URLs
- [ ] Autorización de tratamiento capturada + flujo de derechos del titular
- [ ] Contrato de encargo de datos con cada cliente + política/aviso publicados

---

## 7. Orden recomendado y tiempos

Todo el desarrollo (Fases 1–9) ocurre en **entorno LOCAL** (Supabase CLI/Docker), sin costo. La migración a **Supabase Pro** es el último paso (Prompt 10.4).

1. Fase 1–3 (base local + auth + multi-tenancy): la columna vertebral. **No avances hasta que el test de aislamiento de la Fase 2 pase.**
2. Fase 4–6 (proveedores, documentos, aprobación): el producto usable (MVP = Opción 1).
3. Fase 7–9 (alertas, hardening, cumplimiento): lo que lo hace vendible a un cliente regulado.
4. Fase 10 (planes, OCR, **migración a Pro + deploy**): diferenciación (Opción 2) y salida a producción.

Un MVP sólido y seguro (Fases 1–7 + checklist), todo probado en local antes de gastar un peso en hosting, es alcanzable en pocas semanas de trabajo enfocado con Claude Code. El OCR y el aislamiento físico por cliente son evolutivos.

---

*Nota: las plantillas legales (política de tratamiento, aviso de privacidad, contrato de encargo, manual de incidentes) deben ser revisadas por un abogado especializado en protección de datos antes de operar con clientes reales. Dado el perfil de tus clientes (vigilados por Supersociedades y sujetos a SAGRILAFT), es una inversión que reduce riesgo real de sanción.*
