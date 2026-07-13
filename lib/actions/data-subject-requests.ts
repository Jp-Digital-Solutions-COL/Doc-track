"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMembership } from "@/lib/auth/session";
import { logAudit } from "@/lib/actions/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/client-ip";
import { headers } from "next/headers";
import { TEXT_LIMITS, exceedsLimit } from "@/lib/security/text-limits";
import { calculateDataSubjectRequestDueDate } from "@/lib/legal/data-subject-deadline";

const REQUEST_TYPES = ["consulta", "rectificacion", "supresion"] as const;
const STATUSES = ["pendiente", "en_proceso", "resuelta", "rechazada"] as const;

// Formulario público (sin login): cualquier titular (el proveedor, su
// representante legal o el beneficiario final) puede radicar una solicitud
// identificando la empresa por su NIT — no requiere conocer un UUID interno.
export async function submitDataSubjectRequest(formData: FormData) {
  const nit = String(formData.get("nit") ?? "").trim();
  const requesterName = String(formData.get("requesterName") ?? "").trim();
  const requesterEmail = String(formData.get("requesterEmail") ?? "").trim();
  const requestType = String(formData.get("requestType") ?? "");
  const details = String(formData.get("details") ?? "").trim() || null;

  function fail(message: string): never {
    redirect(`/legal/solicitud-titular?error=${encodeURIComponent(message)}`);
  }

  if (!nit || !requesterName || !requesterEmail || !requesterEmail.includes("@")) {
    fail("Completa todos los campos obligatorios.");
  }
  if (!REQUEST_TYPES.includes(requestType as (typeof REQUEST_TYPES)[number])) {
    fail("Selecciona un tipo de solicitud válido.");
  }
  if (
    exceedsLimit(nit, TEXT_LIMITS.nit) ||
    exceedsLimit(requesterName, TEXT_LIMITS.companyName) ||
    exceedsLimit(requesterEmail, TEXT_LIMITS.email) ||
    (details && exceedsLimit(details, TEXT_LIMITS.reviewNotes))
  ) {
    fail("Uno de los campos es demasiado largo.");
  }

  const ip = getClientIp(await headers());
  const { success } = await checkRateLimit("public_form", ip);
  if (!success) fail("Demasiadas solicitudes. Intenta de nuevo en un minuto.");

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id").eq("nit", nit).maybeSingle();

  // Si el NIT no corresponde a ninguna empresa registrada, se muestra la
  // MISMA confirmación genérica — no se revela si un NIT existe o no en la
  // plataforma (evita enumeración).
  if (org) {
    const submittedAt = new Date();
    const dueDate = calculateDataSubjectRequestDueDate(
      requestType as (typeof REQUEST_TYPES)[number],
      submittedAt
    );

    const { error } = await admin.from("data_subject_requests").insert({
      organization_id: org.id,
      requester_name: requesterName,
      requester_email: requesterEmail,
      request_type: requestType,
      details,
      due_date: dueDate,
    });
    if (error) {
      console.error("data_subject_requests insert failed", { code: error.code });
    }
  }

  redirect("/legal/solicitud-titular?sent=1");
}

export async function updateDataSubjectRequestStatus(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "");
  const resolutionNotes = String(formData.get("resolutionNotes") ?? "").trim() || null;

  function fail(message: string): never {
    redirect(`/app/data-requests?error=${encodeURIComponent(message)}`);
  }

  if (!requestId || !STATUSES.includes(status as (typeof STATUSES)[number])) {
    fail("Solicitud inválida.");
  }
  if (resolutionNotes && exceedsLimit(resolutionNotes, TEXT_LIMITS.reviewNotes)) {
    fail("La nota es demasiado larga.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    fail("Solo owner/admin pueden gestionar solicitudes de titulares.");
  }

  const isResolved = status === "resuelta" || status === "rechazada";

  const { data: updated, error } = await supabase
    .from("data_subject_requests")
    .update({
      status,
      resolution_notes: resolutionNotes,
      resolved_at: isResolved ? new Date().toISOString() : null,
    })
    .eq("id", requestId)
    .eq("organization_id", membership.organizationId)
    .select("id")
    .maybeSingle();

  if (error || !updated) fail("No se pudo actualizar la solicitud.");

  await logAudit(supabase, {
    organizationId: membership.organizationId,
    actorId: user.id,
    action: "data_subject_request.update_status",
    entityType: "data_subject_request",
    entityId: requestId,
  });

  redirect("/app/data-requests?saved=1");
}
