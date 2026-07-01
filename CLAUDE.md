# CLAUDE.md — SaaS Gestión Documental (JP Digital Solutions)

## Contexto
SaaS multi-tenant para gestión documental de proveedores. Maneja datos
personales sensibles (cédulas, EEFF, certificaciones bancarias, beneficiario
final). La seguridad y el aislamiento entre tenants es el requisito #1.

**Estrategia de entornos (2 fases):**
- **Fase A — desarrollo LOCAL** con la CLI de Supabase (stack en Docker). Todo
  el proyecto se construye y prueba aquí, sin costo.
- **Fase B — migración a Supabase PRO** (hosted). Solo cuando el producto esté
  probado. Ver "Checklist de migración a Pro" al final.

Diseña TODO desde la Fase A pensando en que migrará sin fricción: migraciones
versionadas, nada hardcodeado, y las mismas políticas RLS en local y en prod.

## Stack
- Next.js 15 App Router + TypeScript (sin carpeta src/ — App Router en raíz)
- Supabase (Postgres + Auth + Storage), @supabase/ssr
- **Supabase CLI + Docker Desktop** para el entorno local
- Tailwind + shadcn/ui
- Resend (emails), Vercel Cron (alertas)
- Deploy: Vercel

## Entorno LOCAL (Fase A)
Requisito: **Docker Desktop corriendo** antes de arrancar Supabase.

Comandos base (Windows CMD):
```
supabase init                 :: crea supabase/ con config.toml (una sola vez)
supabase start                :: levanta el stack local en Docker
supabase status               :: muestra URLs y llaves LOCALES
supabase migration new <nom>  :: crea una migración vacía en supabase/migrations
supabase db reset             :: recrea la BD local aplicando migraciones + seed
supabase stop                 :: apaga el stack
```

Servicios locales (por defecto):
- API/Storage: http://127.0.0.1:54321
- Studio (UI):  http://127.0.0.1:54323
- Postgres:     postgresql://postgres:postgres@127.0.0.1:54322/postgres
- Emails de prueba (Inbucket/Mailpit): revisar en `supabase status`

`.env.local` en Fase A usa las llaves que imprime `supabase status`:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key local>
SUPABASE_SERVICE_ROLE_KEY=<service_role local>   # SOLO server
```

## Reglas de seguridad INVIOLABLES (aplican en local Y en prod)
1. RLS activada en TODA tabla. Ninguna migración se acepta sin sus políticas
   RLS (SELECT/INSERT/UPDATE/DELETE) con USING y WITH CHECK correctos.
2. Toda tabla de negocio lleva columna organization_id con índice.
3. El service_role key SOLO se usa en server (Route Handlers / Server Actions /
   Edge Functions). NUNCA en componentes cliente ni en variables NEXT_PUBLIC_*.
4. Buckets de Storage SIEMPRE privados. Los documentos se sirven únicamente por
   signed URLs generadas en el server con TTL <= 60 segundos.
5. Toda operación privilegiada revalida la pertenencia al tenant en el server,
   aunque RLS ya lo haga (defensa en profundidad).
6. Prohibido loguear PII, nombres de archivo, contenido o tokens. Solo IDs y
   nombres de eventos.
7. Subidas: validar MIME por magic bytes, tamaño máx, extensiones permitidas
   (pdf, jpg, jpeg, png). Guardar el archivo con nombre UUID, nunca el original.
8. Todo acceso, descarga, aprobación o rechazo de un documento se registra en
   la tabla audit_logs (append-only; sin UPDATE ni DELETE a nivel de BD).
9. IDs siempre uuid. Nunca exponer IDs secuenciales ni datos en la URL.
10. Cookies de sesión httpOnly, secure, SameSite=Lax. Headers de seguridad
    (CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff).

## ⚠️ Regla crítica local → prod
Las llaves que da `supabase start`/`supabase status` son **llaves de demo
públicas e idénticas para todos**. NUNCA se copian a producción, a Vercel ni a
un repo. En producción se usan EXCLUSIVAMENTE las llaves del proyecto Pro,
cargadas como variables de entorno en Vercel. Verifica que ningún valor local
quede en el código antes de migrar.

## Convenciones
- Comandos para Windows CMD (no PowerShell).
- Toda la BD se define por MIGRACIONES en supabase/migrations. Nunca se cambia
  el esquema "a mano" en Studio sin capturarlo en una migración.
- Cada tabla nueva → su migración incluye la RLS en el MISMO archivo.
- Datos de prueba en supabase/seed.sql (nunca datos reales de un cliente).
- Los buckets de Storage y sus políticas se definen por SQL/migración (o
  config.toml), no solo por clic en Studio, para que se repliquen en prod.

## Definición de "hecho" para features con datos
- [ ] RLS probada como dos usuarios de dos organizaciones distintas (0 fugas).
- [ ] El server revalida organization_id.
- [ ] Acción registrada en audit_logs.
- [ ] Sin PII en logs/errores.
- [ ] La migración corre limpia con `supabase db reset`.

## Checklist de migración a Supabase Pro (Fase B)
Ejecutar solo cuando el producto esté probado en local:
- [ ] Crear proyecto en Supabase (plan Pro), elegir región (documentar que es
      transferencia internacional para Ley 1581).
- [ ] `supabase link --project-ref <ref>` y `supabase db push` (aplica todas
      las migraciones al proyecto remoto).
- [ ] Crear buckets privados en el remoto y verificar sus políticas RLS.
- [ ] Cargar en Vercel las variables con las llaves de PRODUCCIÓN (service_role
      sin prefijo NEXT_PUBLIC_). Cero llaves locales.
- [ ] Activar: SSL Enforcement, Network Restrictions, MFA obligatorio en la org.
- [ ] Dejar activo el logging de conexiones (para rastro de auditoría).
- [ ] (Opcional pero recomendado para datos críticos) habilitar PITR.
- [ ] Firmar el DPA (contrato de encargo) desde documentos legales del dashboard.
- [ ] Correr el test de aislamiento multi-tenant CONTRA el remoto (debe pasar).
- [ ] Configurar y verificar el Vercel Cron de alertas.
- [ ] Prueba de humo end-to-end: crear org, invitar proveedor, subir doc,
      aprobar, recibir alerta.
```
