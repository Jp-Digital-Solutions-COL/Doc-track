"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMembership } from "@/lib/auth/session";
import { generateInvitationToken, hashInvitationToken } from "@/lib/auth/invitation-token";
import { findUserIdByEmail } from "@/lib/auth/find-user-by-email";
import { sendInvitationEmail } from "@/lib/email/resend";
import { logAudit } from "@/lib/actions/audit";
import { TEXT_LIMITS, exceedsLimit } from "@/lib/security/text-limits";
import { CURRENT_POLICY_VERSION, CONSENT_PURPOSE } from "@/lib/legal/policy";

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

export async function createInvitation(formData: FormData) {
  const supplierId = String(formData.get("supplierId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!supplierId) redirect("/app/suppliers");
  if (!email || !email.includes("@") || exceedsLimit(email, TEXT_LIMITS.email)) {
    redirect(`/app/suppliers/${supplierId}?error=${encodeURIComponent("Ingresa un correo válido.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    redirect(`/app/suppliers/${supplierId}?error=${encodeURIComponent("Solo owner/admin pueden invitar proveedores.")}`);
  }

  // Revalida que el proveedor sea de esta org (RLS lo haría de todos modos
  // al insertar en invitations, pero así el mensaje de error es más claro).
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, organization_id")
    .eq("id", supplierId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!supplier) redirect("/app/suppliers");

  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const expiresAt = new Date(Date.now() + SEVENTY_TWO_HOURS_MS).toISOString();

  const { data: invitation, error } = await supabase
    .from("invitations")
    .insert({
      organization_id: membership.organizationId,
      supplier_id: supplierId,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !invitation) {
    redirect(`/app/suppliers/${supplierId}?error=${encodeURIComponent("No se pudo crear la invitación.")}`);
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", membership.organizationId)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/invite?token=${rawToken}`;

  try {
    await sendInvitationEmail({
      to: email,
      inviteUrl,
      organizationName: org?.name ?? "tu organización",
    });
  } catch (sendError) {
    // El error real (p.ej. de la API de Resend) queda en el log del server,
    // nunca en la respuesta al cliente — podría traer detalles internos.
    console.error("sendInvitationEmail failed", { code: (sendError as Error).name });
    redirect(`/app/suppliers/${supplierId}?error=${encodeURIComponent("No se pudo enviar el correo de invitación.")}`);
  }

  await logAudit(supabase, {
    organizationId: membership.organizationId,
    actorId: user.id,
    action: "invitation.create",
    entityType: "invitation",
    entityId: invitation.id,
  });

  redirect(`/app/suppliers/${supplierId}?invited=1`);
}

export async function acceptInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const acceptedPolicy = formData.get("acceptedPolicy") === "on";

  if (!token) {
    redirect(`/invite?error=${encodeURIComponent("Falta el token de invitación.")}`);
  }
  if (!acceptedPolicy) {
    redirect(
      `/invite?token=${encodeURIComponent(token)}&error=${encodeURIComponent("Debes aceptar la Política de Tratamiento de Datos.")}`
    );
  }

  const tokenHash = hashInvitationToken(token);
  const admin = createAdminClient();

  // Pre-auth: solo el admin client puede leer invitations aquí (RLS exige
  // is_admin_of(), y quien acepta una invitación no es miembro de nada).
  const { data: invitation } = await admin
    .from("invitations")
    .select("id, email, supplier_id, organization_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  const isValid = Boolean(invitation) && !invitation!.used_at && new Date(invitation!.expires_at) > new Date();
  if (!invitation || !isValid) {
    redirect(`/invite?error=${encodeURIComponent("Este enlace no es válido o ya expiró.")}`);
  }

  // Nunca pasar un password vacío a createUser: si por una condición de
  // carrera el email SÍ existiera ya, esto evitaría dejar una cuenta nueva
  // sin contraseña utilizable (createErr con email_exists la ignora igual).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invitation.email,
    password: password || generateInvitationToken(),
    email_confirm: true,
  });

  let userId: string;
  let isNewUser: boolean;

  if (createErr) {
    if (createErr.code !== "email_exists") {
      redirect(`/invite?token=${encodeURIComponent(token)}&error=${encodeURIComponent("No se pudo procesar la invitación.")}`);
    }
    const foundId = await findUserIdByEmail(admin, invitation.email);
    if (!foundId) {
      redirect(`/invite?token=${encodeURIComponent(token)}&error=${encodeURIComponent("No se pudo procesar la invitación.")}`);
    }
    userId = foundId!;
    isNewUser = false;
  } else {
    userId = created.user.id;
    isNewUser = true;
  }

  await admin
    .from("supplier_users")
    .upsert(
      {
        organization_id: invitation.organization_id,
        supplier_id: invitation.supplier_id,
        user_id: userId,
        status: "active",
      },
      { onConflict: "supplier_id,user_id" }
    );

  await admin.from("invitations").update({ used_at: new Date().toISOString() }).eq("id", invitation.id);

  // Evidencia de autorización de tratamiento (Ley 1581) — una por cada
  // relación proveedor/organización aceptada, incluso si el usuario ya
  // tenía cuenta de otra invitación anterior.
  const { error: consentError } = await admin.from("consent_records").insert({
    organization_id: invitation.organization_id,
    subject_type: "supplier_contact",
    user_id: userId,
    supplier_id: invitation.supplier_id,
    purpose: CONSENT_PURPOSE.supplier_contact,
    policy_version: CURRENT_POLICY_VERSION,
  });
  if (consentError) {
    console.error("consent_records insert failed", { organizationId: invitation.organization_id, code: consentError.code });
  }

  await logAudit(admin, {
    organizationId: invitation.organization_id,
    actorId: userId,
    actorType: "supplier",
    action: "invitation.accept",
    entityType: "invitation",
    entityId: invitation.id,
  });

  if (isNewUser) {
    // Ya sabemos la contraseña que acaban de fijar: los dejamos con sesión
    // iniciada de una vez, en vez de mandarlos a loguearse de nuevo.
    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ email: invitation.email, password });
    redirect("/portal");
  }

  redirect("/portal/login?linked=1");
}

// Usado por la página /invite (Server Component) para decidir qué formulario
// mostrar, sin duplicar la lógica de validación del token.
export async function checkInvitationForDisplay(token: string) {
  const tokenHash = hashInvitationToken(token);
  const admin = createAdminClient();

  const { data: invitation } = await admin
    .from("invitations")
    .select("email, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  const isValid = Boolean(invitation) && !invitation!.used_at && new Date(invitation!.expires_at) > new Date();
  if (!invitation || !isValid) {
    return { valid: false as const };
  }

  const foundId = await findUserIdByEmail(admin, invitation.email);

  return { valid: true as const, email: invitation.email, userExists: Boolean(foundId) };
}
