"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { logAudit } from "@/lib/actions/audit";

// Formulario: un checkbox "required" y otro "mandatory" por cada
// document_type, ambos con value=<document_type_id>. Esta acción reconcilia
// el estado deseado contra supplier_requirements (insert/update/delete).
export async function updateSupplierRequirements(formData: FormData) {
  const supplierId = String(formData.get("supplierId") ?? "");
  if (!supplierId) redirect("/app/suppliers");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  // Revalida que el proveedor sea de esta org antes de tocar sus requisitos.
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!supplier) redirect("/app/suppliers");

  const desiredRequired = new Set(formData.getAll("required").map(String));
  const desiredMandatory = new Set(formData.getAll("mandatory").map(String));

  const { data: existing } = await supabase
    .from("supplier_requirements")
    .select("id, document_type_id, is_mandatory")
    .eq("supplier_id", supplierId);

  const existingByType = new Map((existing ?? []).map((r) => [r.document_type_id, r]));

  const toDelete = (existing ?? []).filter((r) => !desiredRequired.has(r.document_type_id)).map((r) => r.id);
  const toInsert = [...desiredRequired].filter((typeId) => !existingByType.has(typeId));
  const toUpdate = [...desiredRequired]
    .filter((typeId) => existingByType.has(typeId))
    .filter((typeId) => existingByType.get(typeId)!.is_mandatory !== desiredMandatory.has(typeId));

  if (toDelete.length > 0) {
    await supabase.from("supplier_requirements").delete().in("id", toDelete);
  }
  if (toInsert.length > 0) {
    await supabase.from("supplier_requirements").insert(
      toInsert.map((documentTypeId) => ({
        organization_id: membership.organizationId,
        supplier_id: supplierId,
        document_type_id: documentTypeId,
        is_mandatory: desiredMandatory.has(documentTypeId),
      }))
    );
  }
  for (const typeId of toUpdate) {
    await supabase
      .from("supplier_requirements")
      .update({ is_mandatory: desiredMandatory.has(typeId) })
      .eq("id", existingByType.get(typeId)!.id);
  }

  if (toDelete.length || toInsert.length || toUpdate.length) {
    await logAudit(supabase, {
      organizationId: membership.organizationId,
      actorId: user.id,
      action: "supplier_requirements.update",
      entityType: "supplier",
      entityId: supplierId,
    });
  }

  redirect(`/app/suppliers/${supplierId}?saved=1`);
}
