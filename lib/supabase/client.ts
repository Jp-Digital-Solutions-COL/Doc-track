import { createBrowserClient } from "@supabase/ssr";

// Cliente para Client Components. Usa la anon key (segura para exponer al
// navegador) — el aislamiento real lo da RLS en Postgres, no este archivo.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
