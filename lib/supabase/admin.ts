import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// ADVERTENCIA — SOLO SERVER. NUNCA IMPORTAR ESTE ARCHIVO DESDE:
//   - Client Components ("use client")
//   - Cualquier módulo que termine en un bundle enviado al navegador
//
// Este cliente usa SUPABASE_SERVICE_ROLE_KEY, que IGNORA TODAS LAS POLÍTICAS
// RLS. Si esta key llega al navegador, cualquier visitante tiene acceso total
// de lectura/escritura a TODOS los tenants de la base de datos.
//
// El import "server-only" de arriba hace que el build de Next.js FALLE si
// este archivo termina importado desde código de cliente — es una red de
// seguridad, no un reemplazo de revisar tus imports.
//
// Úsalo solo en Route Handlers, Server Actions o Edge Functions, y solo para
// operaciones privilegiadas que ya revalidaron organization_id en el server.
// ============================================================================
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
