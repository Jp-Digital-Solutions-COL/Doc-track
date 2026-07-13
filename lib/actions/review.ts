"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { logAudit } from "@/lib/actions/audit";
import { recalculateSupplierStatus } from "@/lib/documents/recalculate-supplier-status";
import { TEXT_LIMITS, exceedsLimit } from "@/lib/security/text-limits";

const DECISIONS = ["aprobado", "rechazado"] as const;

export async function reviewDocument(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const returnTo = String(formData.get("returnTo") ?? "/app/suppliers");

  function fail(message: string): never {
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }

  if (!documentId || !DECISIONS.includes(decision as (typeof DECISIONS)[number])) {
    return fail("Solicitud de revisión inválida.");
  }
  if (decision === "rechazado" && !notes) {
    return fail("Rechazar un documento requiere una nota explicando el motivo.");
  }
  if (notes && exceedsLimit(notes, TEXT_LIMITS.reviewNotes)) {
    return fail("La nota es demasiado larga.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Revisar es cosa de organization_members (cualquier rol activo: owner,
  // admin o reviewer) — nunca del propio proveedor, que no tiene policy de
  // UPDATE de `status`/`reviewed_by` fuera de la resubida (ver migración de
  // documents_update_supplier).
  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) return fail("No autorizado.");

  const { data: document } = await supabase
    .from("documents")
    .select("id, organization_id, supplier_id")
    .eq("id", documentId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!document) return fail("Documento no encontrado.");

  const { error } = await supabase
    .from("documents")
    .update({ status: decision, reviewed_by: user.id, review_notes: notes })
    .eq("id", documentId);
  if (error) return fail("No se pudo registrar la revisión.");

  await logAudit(supabase, {
    organizationId: document.organization_id,
    actorId: user.id,
    actorType: "user",
    action: decision === "aprobado" ? "document.approve" : "document.reject",
    entityType: "document",
    entityId: document.id,
  });

  await recalculateSupplierStatus(supabase, {
    supplierId: document.supplier_id,
    organizationId: document.organization_id,
    actorId: user.id,
    actorType: "user",
  });

  redirect(`${returnTo}?reviewed=1`);
}
