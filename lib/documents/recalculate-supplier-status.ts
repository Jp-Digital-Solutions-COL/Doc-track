import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateSupplierStatus } from "@/lib/documents/supplier-status";
import { logAudit } from "@/lib/actions/audit";

// Se llama después de CUALQUIER cambio que pueda mover el estado calculado
// del proveedor: subir/resubir un documento, o aprobar/rechazar uno. Solo
// escribe y audita si el estado realmente cambió — "todo cambio de estado
// se audita" no significa auditar cada vez que se re-evalúa y da lo mismo.
export async function recalculateSupplierStatus(
  supabase: SupabaseClient,
  params: {
    supplierId: string;
    organizationId: string;
    actorId: string | null;
    actorType?: "user" | "supplier" | "system";
  }
) {
  const [{ data: requirements }, { data: documents }, { data: supplier }] = await Promise.all([
    supabase
      .from("supplier_requirements")
      .select("document_type_id, is_mandatory")
      .eq("supplier_id", params.supplierId),
    supabase
      .from("documents")
      .select("document_type_id, status, expiry_date")
      .eq("supplier_id", params.supplierId),
    supabase.from("suppliers").select("status").eq("id", params.supplierId).maybeSingle(),
  ]);

  if (!supplier) return;

  const newStatus = calculateSupplierStatus(
    (requirements ?? []).map((r) => ({ documentTypeId: r.document_type_id, isMandatory: r.is_mandatory })),
    (documents ?? []).map((d) => ({ documentTypeId: d.document_type_id, status: d.status, expiryDate: d.expiry_date }))
  );

  if (newStatus === supplier.status) return;

  const { error } = await supabase.from("suppliers").update({ status: newStatus }).eq("id", params.supplierId);
  if (error) return;

  await logAudit(supabase, {
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorType: params.actorType,
    action: `supplier.status_change:${newStatus}`,
    entityType: "supplier",
    entityId: params.supplierId,
  });
}
