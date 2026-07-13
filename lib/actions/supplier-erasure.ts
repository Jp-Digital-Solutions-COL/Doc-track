"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { logAudit } from "@/lib/actions/audit";
import { isWithinRetentionWindow } from "@/lib/legal/retention";

const ADMIN_ROLES = ["owner", "admin"] as const;

// "Borrado seguro" de los datos PERSONALES de un proveedor (supresión, Ley
// 1581) — no un borrado total de la fila `suppliers`: razón social/NIT son
// datos del negocio (relación contractual), no datos personales de una
// persona natural, y se conservan. Lo que se anonimiza son los campos que sí
// identifican a una persona: correo de contacto, nombre y cédula del
// representante legal, nombre y cédula del beneficiario final.
//
// Los documentos (archivos con cédulas, EEFF, etc.) se borran de Storage y
// de la BD SOLO si ya pasó el plazo de retención legal/contractual
// (lib/legal/retention.ts) — los que siguen dentro del plazo se conservan
// intactos y se reporta al admin cuáles fueron esos.
export async function eraseSupplierPersonalData(formData: FormData) {
  const supplierId = String(formData.get("supplierId") ?? "");
  const dataSubjectRequestId = String(formData.get("dataSubjectRequestId") ?? "") || null;
  const returnTo = `/app/suppliers/${supplierId}`;

  function fail(message: string): never {
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }

  if (!supplierId) redirect("/app/suppliers");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership || !ADMIN_ROLES.includes(membership.role as (typeof ADMIN_ROLES)[number])) {
    fail("Solo owner/admin pueden ejecutar un borrado de datos personales.");
  }

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!supplier) fail("Proveedor no encontrado.");

  const { data: documents } = await supabase
    .from("documents")
    .select("id, created_at, document_versions(storage_path)")
    .eq("supplier_id", supplierId);

  const toDelete = (documents ?? []).filter((d) => !isWithinRetentionWindow(d.created_at));
  const retainedCount = (documents ?? []).length - toDelete.length;

  const storagePaths = toDelete.flatMap((d) =>
    (d.document_versions as unknown as { storage_path: string }[]).map((v) => v.storage_path)
  );

  if (storagePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from("documentos").remove(storagePaths);
    if (removeError) fail("No se pudieron borrar los archivos del proveedor.");
  }

  if (toDelete.length > 0) {
    const { error: deleteDocsError } = await supabase
      .from("documents")
      .delete()
      .in(
        "id",
        toDelete.map((d) => d.id)
      );
    if (deleteDocsError) fail("No se pudieron borrar los documentos del proveedor.");
  }

  // Revoca el acceso al portal e invitaciones pendientes — el acceso en sí
  // es un dato ligado a una persona.
  await supabase.from("supplier_users").delete().eq("supplier_id", supplierId);
  await supabase.from("invitations").delete().eq("supplier_id", supplierId).is("used_at", null);

  const { error: anonymizeError } = await supabase
    .from("suppliers")
    .update({
      primary_contact_email: null,
      legal_rep_full_name: null,
      legal_rep_id_number_enc: null,
      beneficial_owner_full_name: null,
      beneficial_owner_id_number_enc: null,
      personal_data_erased_at: new Date().toISOString(),
    })
    .eq("id", supplierId)
    .eq("organization_id", membership.organizationId);

  if (anonymizeError) fail("No se pudieron anonimizar los datos del proveedor.");

  await logAudit(supabase, {
    organizationId: membership.organizationId,
    actorId: user.id,
    action: "supplier.personal_data_erase",
    entityType: "supplier",
    entityId: supplierId,
  });

  if (dataSubjectRequestId) {
    await supabase
      .from("data_subject_requests")
      .update({ status: "resuelta", resolved_at: new Date().toISOString() })
      .eq("id", dataSubjectRequestId)
      .eq("organization_id", membership.organizationId);
  }

  redirect(`${returnTo}?erased=1&retained=${retainedCount}`);
}
