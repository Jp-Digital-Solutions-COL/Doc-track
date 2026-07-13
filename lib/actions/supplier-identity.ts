"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { logAudit } from "@/lib/actions/audit";
import { encryptField, decryptField } from "@/lib/security/field-encryption";
import { TEXT_LIMITS, exceedsLimit } from "@/lib/security/text-limits";

const ADMIN_ROLES = ["owner", "admin"] as const;
type IdentityField = "legal_rep" | "beneficial_owner";

export async function updateSupplierIdentity(formData: FormData) {
  const supplierId = String(formData.get("supplierId") ?? "");
  const legalRepName = String(formData.get("legalRepName") ?? "").trim();
  const legalRepIdNumber = String(formData.get("legalRepIdNumber") ?? "").trim();
  const beneficialOwnerName = String(formData.get("beneficialOwnerName") ?? "").trim();
  const beneficialOwnerIdNumber = String(formData.get("beneficialOwnerIdNumber") ?? "").trim();
  const returnTo = `/app/suppliers/${supplierId}`;

  if (!supplierId) redirect("/app/suppliers");

  if (
    exceedsLimit(legalRepName, TEXT_LIMITS.companyName) ||
    exceedsLimit(beneficialOwnerName, TEXT_LIMITS.companyName) ||
    exceedsLimit(legalRepIdNumber, TEXT_LIMITS.idNumber) ||
    exceedsLimit(beneficialOwnerIdNumber, TEXT_LIMITS.idNumber)
  ) {
    redirect(`${returnTo}?error=${encodeURIComponent("Uno de los campos es demasiado largo.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership || !ADMIN_ROLES.includes(membership.role as (typeof ADMIN_ROLES)[number])) {
    redirect(`${returnTo}?error=${encodeURIComponent("Solo owner/admin pueden editar esta información.")}`);
  }

  // Un campo vacío significa "no cambiar", nunca "borrar" — el formulario
  // jamás precarga el número descifrado, así que dejarlo en blanco es la
  // forma normal de guardar sin tocarlo.
  const update: Record<string, string> = {};
  if (legalRepName) update.legal_rep_full_name = legalRepName;
  if (legalRepIdNumber) update.legal_rep_id_number_enc = encryptField(legalRepIdNumber);
  if (beneficialOwnerName) update.beneficial_owner_full_name = beneficialOwnerName;
  if (beneficialOwnerIdNumber) update.beneficial_owner_id_number_enc = encryptField(beneficialOwnerIdNumber);

  if (Object.keys(update).length === 0) {
    redirect(`${returnTo}?saved=1`);
  }

  const { error } = await supabase
    .from("suppliers")
    .update(update)
    .eq("id", supplierId)
    .eq("organization_id", membership.organizationId);

  if (error) redirect(`${returnTo}?error=${encodeURIComponent("No se pudo guardar la información.")}`);

  await logAudit(supabase, {
    organizationId: membership.organizationId,
    actorId: user.id,
    action: "supplier.identity.update",
    entityType: "supplier",
    entityId: supplierId,
  });

  redirect(`${returnTo}?saved=1`);
}

// Descifra SOLO el campo pedido, SOLO para owner/admin de la org dueña del
// proveedor, y deja rastro en audit_logs — nunca se descifra al cargar la
// página, solo cuando alguien pide verlo explícitamente (CLAUDE.md regla 5 y
// el requisito de esta fase: "solo el server descifra, solo cuando es
// estrictamente necesario"). Se invoca directo desde un client component,
// nunca vía query string (regla 9: nada de datos sensibles en la URL).
export async function revealSupplierIdentity(
  supplierId: string,
  field: IdentityField
): Promise<{ error: string } | { idNumber: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado." as const };

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership || !ADMIN_ROLES.includes(membership.role as (typeof ADMIN_ROLES)[number])) {
    return { error: "No autorizado." as const };
  }

  const column = field === "legal_rep" ? "legal_rep_id_number_enc" : "beneficial_owner_id_number_enc";

  const { data: supplier } = await supabase
    .from("suppliers")
    .select(column)
    .eq("id", supplierId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  const encrypted = supplier ? (supplier as unknown as Record<string, string | null>)[column] : null;
  if (!encrypted) return { error: "No hay un número registrado." as const };

  let idNumber: string;
  try {
    idNumber = decryptField(encrypted);
  } catch (err) {
    console.error("decryptField failed", { supplierId, field, code: (err as Error).name });
    return { error: "No se pudo descifrar el valor." as const };
  }

  await logAudit(supabase, {
    organizationId: membership.organizationId,
    actorId: user.id,
    action: field === "legal_rep" ? "supplier.identity.reveal_legal_rep" : "supplier.identity.reveal_beneficial_owner",
    entityType: "supplier",
    entityId: supplierId,
  });

  return { idNumber };
}
