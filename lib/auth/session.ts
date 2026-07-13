import type { SupabaseClient } from "@supabase/supabase-js";

export type Membership = {
  organizationId: string;
  role: "owner" | "admin" | "reviewer";
};

// La app todavía no tiene selector de organización: se asume la primera
// membresía activa del usuario como "la" organización actual. Un usuario en
// más de una org solo puede gestionar la primera por ahora.
//
// Filtra por organizations.status = 'active': esta función la usa el
// middleware y prácticamente toda Server Action para autorizar — que una
// organización "bloqueada" (panel de superadmin) devuelva null acá es lo que
// realmente le corta el acceso a sus miembros, en todos lados a la vez.
export async function getCurrentMembership(
  supabase: SupabaseClient,
  userId: string
): Promise<Membership | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations!inner(status)")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("organizations.status", "active")
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { organizationId: data.organization_id, role: data.role };
}

// True si el usuario tiene una membresía activa en ALGUNA organización, sin
// importar si esa organización está bloqueada — usado solo para distinguir
// "bloqueado" de "nunca tuvo rol" en el mensaje que ve el usuario (ver
// app/app/page.tsx). No usar esto para autorizar nada.
export async function hasBlockedMembership(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("organization_members")
    .select("organizations!inner(status)")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("organizations.status", "blocked")
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}

// Análogo a getCurrentMembership() pero para el lado "proveedor": true si el
// usuario tiene acceso activo a AL MENOS un supplier_users de una
// organización activa (misma razón: una org bloqueada bloquea también a sus
// proveedores).
export async function hasSupplierAccess(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("supplier_users")
    .select("supplier_id, organizations!inner(status)")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("organizations.status", "active")
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}
