import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente para Server Components / Route Handlers / Server Actions.
// Usa la anon key + cookies de sesión; RLS decide qué filas puede ver cada
// usuario. Requiere `await` porque Next 15 hace `cookies()` asíncrono.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignorable: ocurre cuando setAll se llama desde un Server
            // Component. Si hay middleware de sesión, seguirá funcionando.
          }
        },
      },
    }
  );
}
