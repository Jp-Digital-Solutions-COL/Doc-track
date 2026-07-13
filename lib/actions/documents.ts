"use server";

import { randomUUID, createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { detectFileType } from "@/lib/documents/file-type";
import { logAudit } from "@/lib/actions/audit";
import { getCurrentMembership } from "@/lib/auth/session";
import { recalculateSupplierStatus } from "@/lib/documents/recalculate-supplier-status";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { nextFixedDateOnOrAfter } from "@/lib/documents/fixed-date-validity";

const MAX_BYTES = 15 * 1024 * 1024;

// A dónde volver tras subir, según quién sube: el org member vuelve a la
// ficha del proveedor, el proveedor vuelve a su portal.
function backTo(returnTo: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return `${returnTo}${qs ? `?${qs}` : ""}`;
}

export async function uploadDocument(formData: FormData) {
  const supplierId = String(formData.get("supplierId") ?? "");
  const documentTypeId = String(formData.get("documentTypeId") ?? "");
  const issueDate = String(formData.get("issueDate") ?? "") || null;
  const expiryDateInput = String(formData.get("expiryDate") ?? "") || null;
  const returnTo = String(formData.get("returnTo") ?? "/app/suppliers");
  const file = formData.get("file");

  function fail(message: string): never {
    redirect(backTo(returnTo, { error: message }));
  }

  if (!supplierId || !documentTypeId) return fail("Faltan datos del formulario.");
  if (!(file instanceof File) || file.size === 0) return fail("Selecciona un archivo.");
  if (file.size > MAX_BYTES) return fail("El archivo supera el máximo de 15MB.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { success: withinUploadLimit } = await checkRateLimit("upload", `user:${user.id}`);
  if (!withinUploadLimit) return fail("Demasiadas subidas. Espera un minuto e intenta de nuevo.");

  // No confiamos en de quién dice ser el formulario: releemos el proveedor
  // con el cliente normal (RLS ya solo deja ver esta fila si el usuario es
  // org member de esa org O contacto de ESE proveedor — cualquiera de los
  // dos casos válidos para subir).
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, organization_id")
    .eq("id", supplierId)
    .maybeSingle();
  if (!supplier) return fail("No se pudo subir el documento.");

  // El tipo de documento debe pertenecer a la MISMA organización del
  // proveedor (documents.document_type_id no tiene esa validación a nivel
  // de FK/constraint, así que se revalida aquí).
  const { data: documentType } = await supabase
    .from("document_types")
    .select("id, requires_expiry, default_validity_days, default_validity_month, default_validity_day")
    .eq("id", documentTypeId)
    .eq("organization_id", supplier.organization_id)
    .maybeSingle();
  if (!documentType) return fail("Tipo de documento inválido.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectFileType(bytes);
  if (!detected) return fail("Formato de archivo no permitido (solo PDF, JPG o PNG).");

  let expiryDate = expiryDateInput;
  if (documentType.requires_expiry && !expiryDate) {
    if (issueDate && documentType.default_validity_days) {
      const computed = new Date(issueDate);
      computed.setDate(computed.getDate() + documentType.default_validity_days);
      expiryDate = computed.toISOString().slice(0, 10);
    } else if (issueDate && documentType.default_validity_month && documentType.default_validity_day) {
      expiryDate = nextFixedDateOnOrAfter(issueDate, documentType.default_validity_month, documentType.default_validity_day);
    } else {
      return fail("Este tipo de documento requiere fecha de vencimiento.");
    }
  }

  const fileHash = createHash("sha256").update(bytes).digest("hex");

  // ¿Ya existe un documento de este tipo para este proveedor? Si sí, esto es
  // una RESUBIDA: nueva versión en document_versions, no un documento nuevo
  // (Fase 5.4). documents tiene un unique(supplier_id, document_type_id) que
  // hace de esto un invariante real, no solo de la app.
  const { data: existingDocument } = await supabase
    .from("documents")
    .select("id")
    .eq("supplier_id", supplier.id)
    .eq("document_type_id", documentType.id)
    .maybeSingle();

  const documentId = existingDocument?.id ?? randomUUID();
  const objectName = `${randomUUID()}.${detected.ext}`;
  const storagePath = `${supplier.organization_id}/${supplier.id}/${documentId}/${objectName}`;

  const { error: uploadError } = await supabase.storage.from("documentos").upload(storagePath, bytes, {
    contentType: detected.mime,
  });
  // Nunca se registra el nombre original del archivo ni su contenido — solo
  // IDs (CLAUDE.md regla 6). El mensaje al usuario tampoco expone la ruta.
  if (uploadError) return fail("No se pudo subir el documento.");

  // Verificación de integridad real: se descarga lo que Storage acaba de
  // guardar y se vuelve a hashear — no basta con "confiar" que el upload
  // llegó intacto.
  const { data: verifyBlob, error: verifyError } = await supabase.storage
    .from("documentos")
    .download(storagePath);
  const verifyHash = verifyBlob
    ? createHash("sha256").update(new Uint8Array(await verifyBlob.arrayBuffer())).digest("hex")
    : null;

  if (verifyError || verifyHash !== fileHash) {
    await supabase.storage.from("documentos").remove([storagePath]);
    return fail("La verificación de integridad del archivo falló. Intenta de nuevo.");
  }

  if (existingDocument) {
    const { data: lastVersion } = await supabase
      .from("document_versions")
      .select("version_no")
      .eq("document_id", documentId)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersionNo = (lastVersion?.version_no ?? 0) + 1;

    const { error: versionError } = await supabase.from("document_versions").insert({
      organization_id: supplier.organization_id,
      document_id: documentId,
      storage_path: storagePath,
      file_hash: fileHash,
      version_no: nextVersionNo,
      created_by: user.id,
    });
    if (versionError) {
      await supabase.storage.from("documentos").remove([storagePath]);
      return fail("No se pudo registrar la nueva versión.");
    }

    // Reinicia el estado de revisión: una resubida es contenido nuevo, la
    // aprobación anterior ya no aplica (Fase 6 la vuelve a evaluar).
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        storage_path: storagePath,
        file_hash: fileHash,
        mime_type: detected.mime,
        size_bytes: file.size,
        status: "cargado",
        issue_date: issueDate,
        expiry_date: expiryDate,
        uploaded_by: user.id,
        reviewed_by: null,
        review_notes: null,
      })
      .eq("id", documentId);
    if (updateError) return fail("No se pudo actualizar el documento.");

    const membership = await getCurrentMembership(supabase, user.id);
    await logAudit(supabase, {
      organizationId: supplier.organization_id,
      actorId: user.id,
      actorType: membership ? "user" : "supplier",
      action: "reupload",
      entityType: "document",
      entityId: documentId,
    });

    // Una resubida reinicia el documento a 'cargado' — el estado calculado
    // del proveedor puede haber retrocedido (de activo a en_revision, etc).
    await recalculateSupplierStatus(supabase, {
      supplierId: supplier.id,
      organizationId: supplier.organization_id,
      actorId: user.id,
      actorType: membership ? "user" : "supplier",
    });

    redirect(backTo(returnTo, { uploaded: "1" }));
  }

  const { error: docError } = await supabase.from("documents").insert({
    id: documentId,
    organization_id: supplier.organization_id,
    supplier_id: supplier.id,
    document_type_id: documentType.id,
    storage_path: storagePath,
    file_hash: fileHash,
    mime_type: detected.mime,
    size_bytes: file.size,
    status: "cargado",
    issue_date: issueDate,
    expiry_date: expiryDate,
    uploaded_by: user.id,
  });

  if (docError) {
    // No dejar el archivo huérfano en Storage si la fila no se pudo crear.
    await supabase.storage.from("documentos").remove([storagePath]);
    return fail("No se pudo registrar el documento.");
  }

  await supabase.from("document_versions").insert({
    organization_id: supplier.organization_id,
    document_id: documentId,
    storage_path: storagePath,
    file_hash: fileHash,
    version_no: 1,
    created_by: user.id,
  });

  // El actor puede ser un empleado de la empresa o un contacto del
  // proveedor subiendo lo suyo — audit_logs distingue ambos (actor_type).
  const membership = await getCurrentMembership(supabase, user.id);

  await logAudit(supabase, {
    organizationId: supplier.organization_id,
    actorId: user.id,
    actorType: membership ? "user" : "supplier",
    action: "upload",
    entityType: "document",
    entityId: documentId,
  });

  // Un documento mandatorio recién cargado puede mover el estado del
  // proveedor de "pendiente" a "en_revision".
  await recalculateSupplierStatus(supabase, {
    supplierId: supplier.id,
    organizationId: supplier.organization_id,
    actorId: user.id,
    actorType: membership ? "user" : "supplier",
  });

  redirect(backTo(returnTo, { uploaded: "1" }));
}
