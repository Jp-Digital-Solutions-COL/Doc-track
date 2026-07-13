"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { logAudit } from "@/lib/actions/audit";
import { TEXT_LIMITS, exceedsLimit } from "@/lib/security/text-limits";

function readDocumentTypeFields(formData: FormData) {
  const validityMode = String(formData.get("validity_mode") ?? "days");
  const validityRaw = String(formData.get("default_validity_days") ?? "").trim();
  const validity = validityRaw ? Number(validityRaw) : null;
  // El input de fecha fija solo necesita mes/día — el año que elija el
  // usuario es irrelevante y se descarta.
  const fixedDateRaw = String(formData.get("default_validity_fixed_date") ?? "").trim();
  const fixedDateParts = /^\d{4}-(\d{2})-(\d{2})$/.exec(fixedDateRaw);

  const isFixedDate = validityMode === "fixed_date" && fixedDateParts !== null;

  return {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    requires_expiry: formData.get("requires_expiry") === "on",
    default_validity_days: !isFixedDate && validity && validity > 0 ? Math.trunc(validity) : null,
    default_validity_month: isFixedDate ? Number(fixedDateParts[1]) : null,
    default_validity_day: isFixedDate ? Number(fixedDateParts[2]) : null,
  };
}

function findDocumentTypeLengthError(fields: ReturnType<typeof readDocumentTypeFields>): string | null {
  if (exceedsLimit(fields.name, TEXT_LIMITS.documentTypeName)) return "Nombre demasiado largo.";
  if (fields.description && exceedsLimit(fields.description, TEXT_LIMITS.documentTypeDescription)) {
    return "Descripción demasiado larga.";
  }
  return null;
}

export async function createDocumentType(formData: FormData) {
  const fields = readDocumentTypeFields(formData);
  if (!fields.name) {
    redirect(`/app/document-types/new?error=${encodeURIComponent("El nombre es obligatorio.")}`);
  }
  const lengthError = findDocumentTypeLengthError(fields);
  if (lengthError) redirect(`/app/document-types/new?error=${encodeURIComponent(lengthError)}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  const { data: docType, error } = await supabase
    .from("document_types")
    .insert({ ...fields, organization_id: membership.organizationId })
    .select("id")
    .single();

  if (error) {
    const message = error.code === "23505" ? "Ya existe un tipo de documento con ese nombre." : "No se pudo crear el tipo de documento.";
    redirect(`/app/document-types/new?error=${encodeURIComponent(message)}`);
  }

  await logAudit(supabase, {
    organizationId: membership.organizationId,
    actorId: user.id,
    action: "document_type.create",
    entityType: "document_type",
    entityId: docType.id,
  });

  redirect("/app/document-types");
}

export async function updateDocumentType(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const fields = readDocumentTypeFields(formData);

  if (!id) redirect("/app/document-types");
  if (!fields.name) {
    redirect(`/app/document-types/${id}?error=${encodeURIComponent("El nombre es obligatorio.")}`);
  }
  const lengthError = findDocumentTypeLengthError(fields);
  if (lengthError) redirect(`/app/document-types/${id}?error=${encodeURIComponent(lengthError)}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  const { data: updated, error } = await supabase
    .from("document_types")
    .update(fields)
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    const message =
      error?.code === "23505" ? "Ya existe un tipo de documento con ese nombre." : "No se pudo actualizar.";
    redirect(`/app/document-types/${id}?error=${encodeURIComponent(message)}`);
  }

  await logAudit(supabase, {
    organizationId: membership.organizationId,
    actorId: user.id,
    action: "document_type.update",
    entityType: "document_type",
    entityId: id,
  });

  redirect("/app/document-types?saved=1");
}

export async function deleteDocumentType(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/app/document-types");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  const { error } = await supabase
    .from("document_types")
    .delete()
    .eq("id", id)
    .eq("organization_id", membership.organizationId);

  if (error) {
    // Con más frecuencia: hay documentos existentes de ese tipo (ON DELETE
    // RESTRICT en documents.document_type_id).
    redirect(
      `/app/document-types?error=${encodeURIComponent("No se pudo eliminar: puede estar en uso por documentos o proveedores existentes.")}`
    );
  }

  await logAudit(supabase, {
    organizationId: membership.organizationId,
    actorId: user.id,
    action: "document_type.delete",
    entityType: "document_type",
    entityId: id,
  });

  redirect("/app/document-types");
}
