import type { SupabaseClient } from "@supabase/supabase-js";

// Roles para los que el segundo factor (TOTP) es obligatorio, no opcional.
export const MFA_REQUIRED_ROLES = ["owner", "admin"] as const;

// True si el usuario es owner/admin activo de AL MENOS una organización.
// RLS ya limita esta consulta a las filas propias del usuario (is_member_of
// es trivialmente cierto sobre su propia fila de membresía), así que no hace
// falta el admin client aquí.
export async function userRequiresMfa(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", MFA_REQUIRED_ROLES)
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}
