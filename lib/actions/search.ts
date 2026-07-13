"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";

export type SearchResult = { id: string; label: string; sublabel: string; href: string };

// Búsqueda liviana para la barra superior — proveedores por razón social o
// NIT, acotada a la org actual (RLS ya lo haría, pero igual se revalida
// organization_id explícito, CLAUDE.md regla 5).
export async function searchSuppliers(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) return [];

  const { data } = await supabase
    .from("suppliers")
    .select("id, legal_name, nit")
    .eq("organization_id", membership.organizationId)
    .or(`legal_name.ilike.%${trimmed}%,nit.ilike.%${trimmed}%`)
    .order("legal_name")
    .limit(6);

  return (data ?? []).map((s) => ({
    id: s.id,
    label: s.legal_name,
    sublabel: s.nit,
    href: `/app/suppliers/${s.id}`,
  }));
}
