"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMembership } from "@/lib/auth/session";
import { detectFileType } from "@/lib/documents/file-type";
import { logAudit } from "@/lib/actions/audit";
import { EMAIL_TYPES, type EmailType } from "@/lib/email/blocks";
import { buildBlocksSchema } from "@/lib/email/template-schema";
import { defaultBlocksFor, defaultSubjectFor } from "@/lib/email/default-templates";
import { getOrgEmailTemplate } from "@/lib/email/get-template-row";

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

function isEmailType(value: string): value is EmailType {
  return (EMAIL_TYPES as readonly string[]).includes(value);
}

// Única barrera real de autorización de este archivo: organizationId sale
// SIEMPRE de la membresía de la sesión, nunca de formData — así ningún
// caller puede leer/escribir la plantilla de otra organización pasando un
// organizationId propio en el formulario.
async function requireOrgAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership || !["owner", "admin"].includes(membership.role)) redirect("/app");

  return { supabase, user, organizationId: membership.organizationId };
}

export async function getEmailTemplate(emailType: string) {
  if (!isEmailType(emailType)) redirect("/app/settings/emails");
  const { supabase, organizationId } = await requireOrgAdmin();

  const override = await getOrgEmailTemplate(supabase, organizationId, emailType);
  return {
    subject: override?.subject ?? defaultSubjectFor(emailType),
    blocks: override?.blocks ?? defaultBlocksFor(emailType),
    isCustomized: override !== null,
  };
}

export async function saveEmailTemplate(formData: FormData) {
  const emailType = String(formData.get("emailType") ?? "");
  const subject = String(formData.get("subject") ?? "");
  const blocksRaw = String(formData.get("blocks") ?? "[]");

  function fail(message: string): never {
    redirect(`/app/settings/emails/${emailType}?error=${encodeURIComponent(message)}`);
  }

  if (!isEmailType(emailType)) redirect("/app/settings/emails");
  const { supabase, user, organizationId } = await requireOrgAdmin();

  let parsedBlocks: unknown;
  try {
    parsedBlocks = JSON.parse(blocksRaw);
  } catch {
    fail("No se pudo leer la plantilla.");
  }

  const schema = buildBlocksSchema(emailType, organizationId);
  const result = schema.safeParse({ subject, blocks: parsedBlocks });
  if (!result.success) {
    fail(result.error.issues[0]?.message ?? "Plantilla inválida.");
  }

  const { error } = await supabase.from("organization_email_templates").upsert(
    {
      organization_id: organizationId,
      email_type: emailType,
      subject: result.data.subject,
      blocks: result.data.blocks,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,email_type" }
  );
  if (error) fail("No se pudo guardar la plantilla.");

  await logAudit(supabase, {
    organizationId,
    actorId: user.id,
    action: "email_template.update",
    entityType: "organization_email_templates",
    entityId: emailType,
  });

  redirect(`/app/settings/emails/${emailType}?saved=1`);
}

export async function resetEmailTemplate(formData: FormData) {
  const emailType = String(formData.get("emailType") ?? "");
  if (!isEmailType(emailType)) redirect("/app/settings/emails");

  const { supabase, user, organizationId } = await requireOrgAdmin();
  const admin = createAdminClient();

  const { data: existing } = await supabase
    .from("organization_email_templates")
    .select("blocks")
    .eq("organization_id", organizationId)
    .eq("email_type", emailType)
    .maybeSingle();

  const { error } = await supabase
    .from("organization_email_templates")
    .delete()
    .eq("organization_id", organizationId)
    .eq("email_type", emailType);
  if (error) redirect(`/app/settings/emails/${emailType}?error=${encodeURIComponent("No se pudo restaurar.")}`);

  // Borrado best-effort de las imágenes referenciadas por la fila borrada —
  // un fallo acá no impide restaurar la plantilla (ver sección 5 del spec).
  const imagePaths = ((existing?.blocks as { type: string; url?: string }[] | undefined) ?? [])
    .filter((b) => b.type === "image" && b.url)
    .map((b) => b.url!.split("/email-assets/")[1])
    .filter((p): p is string => Boolean(p));
  if (imagePaths.length > 0) {
    try {
      await admin.storage.from("email-assets").remove(imagePaths);
    } catch (removeError) {
      console.error("email-assets cleanup failed", { code: (removeError as Error).name });
    }
  }

  await logAudit(supabase, {
    organizationId,
    actorId: user.id,
    action: "email_template.reset",
    entityType: "organization_email_templates",
    entityId: emailType,
  });

  redirect(`/app/settings/emails/${emailType}?saved=1`);
}

// A diferencia de las otras 3 acciones, esta NO redirige: el editor la
// invoca directamente (sin <form>) para subir una imagen sin perder el
// estado en memoria de los demás bloques.
export async function uploadEmailImage(
  formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const image = formData.get("image");
  const { organizationId } = await requireOrgAdmin();

  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (image.size > IMAGE_MAX_BYTES) {
    return { ok: false, error: "La imagen supera el máximo de 2MB." };
  }

  const bytes = new Uint8Array(await image.arrayBuffer());
  const detected = detectFileType(bytes);
  if (!detected || detected.mime === "application/pdf") {
    return { ok: false, error: "La imagen debe ser PNG o JPG." };
  }

  const admin = createAdminClient();
  const storagePath = `${organizationId}/${randomUUID()}.${detected.ext}`;
  const { error: uploadError } = await admin.storage.from("email-assets").upload(storagePath, bytes, {
    contentType: detected.mime,
  });
  if (uploadError) return { ok: false, error: "No se pudo subir la imagen." };

  const url = admin.storage.from("email-assets").getPublicUrl(storagePath).data.publicUrl;
  return { ok: true, url };
}
