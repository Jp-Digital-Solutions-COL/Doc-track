import type { SupabaseClient } from "@supabase/supabase-js";

// Llama a la función SECURITY DEFINER is_superadmin() (ver migración
// create_platform_admins_and_org_provisioning) — no se consulta
// platform_admins directamente para no depender de su policy de SELECT.
export async function isSuperadmin(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.rpc("is_superadmin");
  return Boolean(data);
}
