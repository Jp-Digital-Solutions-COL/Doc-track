"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { logAudit } from "@/lib/actions/audit";
import { TEXT_LIMITS, exceedsLimit } from "@/lib/security/text-limits";

const STATUSES = ["pendiente", "en_revision", "activo", "rechazado", "vencido"] as const;

function readSupplierFields(formData: FormData) {
  return {
    legal_name: String(formData.get("legal_name") ?? "").trim(),
    nit: String(formData.get("nit") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim() || null,
    primary_contact_email: String(formData.get("primary_contact_email") ?? "").trim() || null,
  };
}

// Límites de longitud — defensa contra metadatos abusivos/oversized, no solo
// validación de formato (CLAUDE.md: "sanitiza y limita metadatos").
function findSupplierFieldsLengthError(fields: ReturnType<typeof readSupplierFields>): string | null {
  if (exceedsLimit(fields.legal_name, TEXT_LIMITS.companyName)) return "Razón social demasiado larga.";
  if (exceedsLimit(fields.nit, TEXT_LIMITS.nit)) return "NIT demasiado largo.";
  if (fields.category && exceedsLimit(fields.category, TEXT_LIMITS.category)) return "Categoría demasiado larga.";
  if (fields.primary_contact_email && exceedsLimit(fields.primary_contact_email, TEXT_LIMITS.email)) {
    return "Correo de contacto demasiado largo.";
  }
  return null;
}

export async function createSupplier(formData: FormData) {
  const fields = readSupplierFields(formData);
  if (!fields.legal_name || !fields.nit) {
    redirect(`/app/suppliers/new?error=${encodeURIComponent("Razón social y NIT son obligatorios.")}`);
  }
  const lengthError = findSupplierFieldsLengthError(fields);
  if (lengthError) redirect(`/app/suppliers/new?error=${encodeURIComponent(lengthError)}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // organization_id se resuelve en el server, nunca desde el formulario.
  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .insert({ ...fields, organization_id: membership.organizationId })
    .select("id")
    .single();

  if (error) {
    const message = error.code === "23505" ? "Ya existe un proveedor con ese NIT." : "No se pudo crear el proveedor.";
    redirect(`/app/suppliers/new?error=${encodeURIComponent(message)}`);
  }

  await logAudit(supabase, {
    organizationId: membership.organizationId,
    actorId: user.id,
    action: "supplier.create",
    entityType: "supplier",
    entityId: supplier.id,
  });

  redirect(`/app/suppliers/${supplier.id}`);
}

export async function updateSupplier(formData: FormData) {
  const supplierId = String(formData.get("supplierId") ?? "");
  const status = String(formData.get("status") ?? "");
  const fields = readSupplierFields(formData);

  if (!supplierId) redirect("/app/suppliers");
  if (!fields.legal_name || !fields.nit) {
    redirect(`/app/suppliers/${supplierId}?error=${encodeURIComponent("Razón social y NIT son obligatorios.")}`);
  }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    redirect(`/app/suppliers/${supplierId}?error=${encodeURIComponent("Estado inválido.")}`);
  }
  const lengthError = findSupplierFieldsLengthError(fields);
  if (lengthError) redirect(`/app/suppliers/${supplierId}?error=${encodeURIComponent(lengthError)}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  // .eq("organization_id", ...) además de RLS: defensa en profundidad
  // explícita (CLAUDE.md regla 5), no solo confiar en que la policy filtre.
  const { data: updated, error } = await supabase
    .from("suppliers")
    .update({ ...fields, status })
    .eq("id", supplierId)
    .eq("organization_id", membership.organizationId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    const message =
      error?.code === "23505" ? "Ya existe un proveedor con ese NIT." : "No se pudo actualizar el proveedor.";
    redirect(`/app/suppliers/${supplierId}?error=${encodeURIComponent(message)}`);
  }

  await logAudit(supabase, {
    organizationId: membership.organizationId,
    actorId: user.id,
    action: "supplier.update",
    entityType: "supplier",
    entityId: supplierId,
  });

  redirect(`/app/suppliers/${supplierId}?saved=1`);
}
