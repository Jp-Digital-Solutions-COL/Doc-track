"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { generateInvitationToken, hashInvitationToken } from "@/lib/auth/invitation-token";
import { findUserIdByEmail } from "@/lib/auth/find-user-by-email";
import { sendOrgAdminInvitationEmail } from "@/lib/email/resend";
import { logAudit } from "@/lib/actions/audit";
import { TEXT_LIMITS, exceedsLimit } from "@/lib/security/text-limits";
import { CURRENT_POLICY_VERSION, CONSENT_PURPOSE } from "@/lib/legal/policy";
import { detectFileType } from "@/lib/documents/file-type";
import { isValidHexColor } from "@/lib/branding/derive-palette";

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
const ROLES = ["owner", "admin"] as const;

// El cliente admin bypassa RLS al crear la organización (organizations no
// tiene policy de INSERT para nadie, igual que en signup()) — por eso este
// chequeo es la ÚNICA barrera real contra que cualquier usuario autenticado
// cree organizaciones arbitrarias. No es cosmético como en /app/audit.
async function requireSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ok = await isSuperadmin(supabase);
  if (!ok) redirect("/app");

  return { supabase, user };
}

export async function createOrganizationAndInviteAdmin(formData: FormData) {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const nit = String(formData.get("nit") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "owner");

  function fail(message: string): never {
    redirect(`/superadmin?error=${encodeURIComponent(message)}`);
  }

  if (!companyName || !nit || !email || !email.includes("@")) {
    fail("Completa todos los campos.");
  }
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    fail("Rol inválido.");
  }
  if (
    exceedsLimit(companyName, TEXT_LIMITS.companyName) ||
    exceedsLimit(nit, TEXT_LIMITS.nit) ||
    exceedsLimit(email, TEXT_LIMITS.email)
  ) {
    fail("Uno de los campos es demasiado largo.");
  }

  const { supabase, user } = await requireSuperadmin();
  const admin = createAdminClient();

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: companyName, nit })
    .select()
    .single();

  if (orgError) {
    fail(orgError.code === "23505" ? "Ese NIT ya está registrado." : "No se pudo crear la organización.");
  }

  // A partir de acá ya corre con el cliente normal (RLS: organizations_*_superadmin) —
  // solo el INSERT de arriba necesitaba el cliente admin.
  const result = await sendAndRecordOrgAdminInvitation({
    supabase,
    actorId: user.id,
    organizationId: org.id,
    organizationName: companyName,
    email,
    role: role as (typeof ROLES)[number],
  });

  if (!result.ok) {
    if (!result.invitationId) {
      // Ni la invitación se pudo crear: no dejar una organización huérfana.
      await admin.from("organizations").delete().eq("id", org.id);
      fail("No se pudo crear la invitación.");
    }
    // La invitación SÍ quedó creada, solo falló el envío del correo — se
    // conserva la organización, se puede reenviar desde su ficha.
    fail("La organización se creó, pero no se pudo enviar el correo de invitación. Podés reenviarla desde su ficha.");
  }

  await logAudit(admin, {
    organizationId: org.id,
    actorId: user.id,
    action: "organization.provision_invite",
    entityType: "organization",
    entityId: org.id,
  });

  redirect("/superadmin?invited=1");
}

export async function acceptOrgAdminInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const acceptedPolicy = formData.get("acceptedPolicy") === "on";

  if (!token) {
    redirect(`/org-invite?error=${encodeURIComponent("Falta el token de invitación.")}`);
  }
  if (!acceptedPolicy) {
    redirect(
      `/org-invite?token=${encodeURIComponent(token)}&error=${encodeURIComponent("Debes aceptar la Política de Tratamiento de Datos.")}`
    );
  }

  const tokenHash = hashInvitationToken(token);
  const admin = createAdminClient();

  const { data: invitation } = await admin
    .from("org_provision_invitations")
    .select("id, email, organization_id, role, expires_at, used_at, revoked_at, organizations(name)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  const isValid =
    Boolean(invitation) && !invitation!.used_at && !invitation!.revoked_at && new Date(invitation!.expires_at) > new Date();
  if (!invitation || !isValid) {
    redirect(`/org-invite?error=${encodeURIComponent("Este enlace no es válido o ya expiró.")}`);
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invitation.email,
    password: password || generateInvitationToken(),
    email_confirm: true,
  });

  let userId: string;
  let isNewUser: boolean;

  if (createErr) {
    if (createErr.code !== "email_exists") {
      redirect(`/org-invite?token=${encodeURIComponent(token)}&error=${encodeURIComponent("No se pudo procesar la invitación.")}`);
    }
    const foundId = await findUserIdByEmail(admin, invitation.email);
    if (!foundId) {
      redirect(`/org-invite?token=${encodeURIComponent(token)}&error=${encodeURIComponent("No se pudo procesar la invitación.")}`);
    }
    userId = foundId!;
    isNewUser = false;
  } else {
    userId = created.user.id;
    isNewUser = true;
  }

  const { error: memberError } = await admin
    .from("organization_members")
    .upsert(
      {
        organization_id: invitation.organization_id,
        user_id: userId,
        role: invitation.role,
        status: "active",
      },
      { onConflict: "organization_id,user_id" }
    );

  if (memberError) {
    if (isNewUser) await admin.auth.admin.deleteUser(userId);
    redirect(`/org-invite?token=${encodeURIComponent(token)}&error=${encodeURIComponent("No se pudo completar el registro.")}`);
  }

  await admin.from("org_provision_invitations").update({ used_at: new Date().toISOString() }).eq("id", invitation.id);

  const { error: consentError } = await admin.from("consent_records").insert({
    organization_id: invitation.organization_id,
    subject_type: "org_owner",
    user_id: userId,
    purpose: CONSENT_PURPOSE.org_owner,
    policy_version: CURRENT_POLICY_VERSION,
  });
  if (consentError) {
    console.error("consent_records insert failed", { organizationId: invitation.organization_id, code: consentError.code });
  }

  await logAudit(admin, {
    organizationId: invitation.organization_id,
    actorId: userId,
    actorType: "user",
    action: "organization.provision_invite_accept",
    entityType: "organization",
    entityId: invitation.organization_id,
  });

  if (isNewUser) {
    // Ya sabemos la contraseña que acaban de fijar: los dejamos con sesión
    // iniciada — owner/admin exige MFA, así que van directo a enrolarlo.
    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ email: invitation.email, password });
    redirect("/mfa/enroll?redirectTo=/app");
  }

  redirect("/login?linked=1");
}

// Usado por la página /org-invite (Server Component) para decidir qué
// formulario mostrar, sin duplicar la validación del token.
export async function checkOrgAdminInvitationForDisplay(token: string) {
  const tokenHash = hashInvitationToken(token);
  const admin = createAdminClient();

  const { data: invitation } = await admin
    .from("org_provision_invitations")
    .select("email, role, expires_at, used_at, revoked_at, organizations(name)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  const isValid =
    Boolean(invitation) && !invitation!.used_at && !invitation!.revoked_at && new Date(invitation!.expires_at) > new Date();
  if (!invitation || !isValid) {
    return { valid: false as const };
  }

  const foundId = await findUserIdByEmail(admin, invitation.email);
  const organizationName = (invitation.organizations as unknown as { name: string } | null)?.name ?? "la organización";

  return {
    valid: true as const,
    email: invitation.email,
    role: invitation.role as "owner" | "admin",
    organizationName,
    userExists: Boolean(foundId),
  };
}

// Lista de invitaciones pendientes para la página /superadmin.
export async function listOrgProvisionInvitations() {
  const { supabase } = await requireSuperadmin();

  const { data } = await supabase
    .from("org_provision_invitations")
    .select("id, email, role, expires_at, used_at, created_at, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

// Registro de auditoría de PLATAFORMA (no de tenant) — ver
// platform_audit_logs en la migración. Silencioso ante fallo, igual que
// logAudit(), pero deja rastro en el log del server.
async function logPlatformAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: { actorId: string; action: string; entityType: string; entityId?: string }
) {
  const { error } = await supabase.from("platform_audit_logs").insert({
    actor_id: params.actorId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
  });
  if (error) {
    console.error("platform_audit_logs insert failed", { action: params.action, code: error.code });
  }
}

async function sendAndRecordOrgAdminInvitation(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  actorId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: (typeof ROLES)[number];
}) {
  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const expiresAt = new Date(Date.now() + SEVENTY_TWO_HOURS_MS).toISOString();

  const { data: invitation, error } = await params.supabase
    .from("org_provision_invitations")
    .insert({
      organization_id: params.organizationId,
      email: params.email,
      role: params.role,
      token_hash: tokenHash,
      invited_by: params.actorId,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !invitation) return { ok: false as const };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/org-invite?token=${rawToken}`;

  try {
    await sendOrgAdminInvitationEmail({
      to: params.email,
      inviteUrl,
      organizationName: params.organizationName,
      role: params.role,
    });
  } catch (sendError) {
    console.error("sendOrgAdminInvitationEmail failed", { code: (sendError as Error).name });
    return { ok: false as const, invitationId: invitation.id };
  }

  return { ok: true as const, invitationId: invitation.id };
}

// Lista todas las organizaciones para la página /superadmin — vía RLS
// (organizations_select_superadmin), no cliente admin: acá sí hay una
// policy real que lo respalda.
export async function listOrganizations() {
  const { supabase } = await requireSuperadmin();

  const { data } = await supabase
    .from("organizations")
    .select("id, name, nit, plan, status, created_at, organization_members(count)")
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getOrganizationDetail(organizationId: string) {
  const { supabase } = await requireSuperadmin();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, nit, plan, status, created_at, logo_url, brand_color")
    .eq("id", organizationId)
    .maybeSingle();

  if (!organization) return null;

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id, role, status, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("org_provision_invitations")
      .select("id, email, role, expires_at, used_at, revoked_at, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
  ]);

  // auth.users no se expone vía PostgREST — resolver los correos de los
  // miembros es una operación privilegiada, igual que en /app/audit.
  const admin = createAdminClient();
  const emailByUserId = new Map<string, string>();
  await Promise.all(
    (members ?? []).map(async (m) => {
      const { data } = await admin.auth.admin.getUserById(m.user_id);
      if (data.user?.email) emailByUserId.set(m.user_id, data.user.email);
    })
  );

  return {
    organization,
    members: (members ?? []).map((m) => ({ ...m, email: emailByUserId.get(m.user_id) ?? "(desconocido)" })),
    invitations: invitations ?? [],
  };
}

export async function updateOrganization(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const nit = String(formData.get("nit") ?? "").trim();
  const plan = String(formData.get("plan") ?? "estandar");

  function fail(message: string): never {
    redirect(`/superadmin/organizations/${organizationId}?error=${encodeURIComponent(message)}`);
  }

  if (!organizationId) redirect("/superadmin");
  if (!name || !nit) fail("Nombre y NIT son obligatorios.");
  if (!["estandar", "avanzado"].includes(plan)) fail("Plan inválido.");
  if (exceedsLimit(name, TEXT_LIMITS.companyName) || exceedsLimit(nit, TEXT_LIMITS.nit)) {
    fail("Uno de los campos es demasiado largo.");
  }

  const { supabase, user } = await requireSuperadmin();

  const { error } = await supabase.from("organizations").update({ name, nit, plan }).eq("id", organizationId);
  if (error) fail(error.code === "23505" ? "Ese NIT ya está registrado." : "No se pudo guardar.");

  await logPlatformAudit(supabase, {
    actorId: user.id,
    action: "organization.update",
    entityType: "organization",
    entityId: organizationId,
  });

  redirect(`/superadmin/organizations/${organizationId}?saved=1`);
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export async function updateOrganizationBranding(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const brandColor = String(formData.get("brandColor") ?? "");
  const logo = formData.get("logo");

  function fail(message: string): never {
    redirect(`/superadmin/organizations/${organizationId}?error=${encodeURIComponent(message)}`);
  }

  if (!organizationId) redirect("/superadmin");
  if (!isValidHexColor(brandColor)) fail("Color de marca inválido.");

  const { supabase, user } = await requireSuperadmin();
  const admin = createAdminClient();

  let logoUrl: string | undefined;

  if (logo instanceof File && logo.size > 0) {
    if (logo.size > LOGO_MAX_BYTES) fail("El logo supera el máximo de 2MB.");

    const bytes = new Uint8Array(await logo.arrayBuffer());
    const detected = detectFileType(bytes);
    if (!detected || detected.mime === "application/pdf") fail("El logo debe ser PNG o JPG.");

    const { data: existing } = await supabase
      .from("organizations")
      .select("logo_url")
      .eq("id", organizationId)
      .maybeSingle();

    const storagePath = `${organizationId}/${randomUUID()}.${detected.ext}`;

    const { error: uploadError } = await admin.storage.from("org-logos").upload(storagePath, bytes, {
      contentType: detected.mime,
    });
    if (uploadError) fail("No se pudo subir el logo.");

    logoUrl = admin.storage.from("org-logos").getPublicUrl(storagePath).data.publicUrl;

    // Borra el logo anterior para no acumular archivos huérfanos en el bucket.
    const previousPath = existing?.logo_url?.split("/org-logos/")[1];
    if (previousPath) await admin.storage.from("org-logos").remove([previousPath]);
  }

  const { error } = await supabase
    .from("organizations")
    .update({ brand_color: brandColor, ...(logoUrl ? { logo_url: logoUrl } : {}) })
    .eq("id", organizationId);
  if (error) fail("No se pudo guardar la marca.");

  await logPlatformAudit(supabase, {
    actorId: user.id,
    action: "organization.update_branding",
    entityType: "organization",
    entityId: organizationId,
  });

  redirect(`/superadmin/organizations/${organizationId}?saved=1`);
}

export async function setOrganizationStatus(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!organizationId) redirect("/superadmin");
  if (!["active", "blocked"].includes(status)) {
    redirect(`/superadmin/organizations/${organizationId}?error=${encodeURIComponent("Estado inválido.")}`);
  }

  const { supabase, user } = await requireSuperadmin();

  const { error } = await supabase.from("organizations").update({ status }).eq("id", organizationId);
  if (error) {
    redirect(`/superadmin/organizations/${organizationId}?error=${encodeURIComponent("No se pudo actualizar el estado.")}`);
  }

  await logPlatformAudit(supabase, {
    actorId: user.id,
    action: status === "blocked" ? "organization.block" : "organization.unblock",
    entityType: "organization",
    entityId: organizationId,
  });

  redirect(`/superadmin/organizations/${organizationId}?saved=1`);
}

// Invita a un admin/owner ADICIONAL a una organización YA EXISTENTE — a
// diferencia de createOrganizationAndInviteAdmin(), que crea la org.
export async function inviteAdminToOrganization(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "admin");

  function fail(message: string): never {
    redirect(`/superadmin/organizations/${organizationId}?error=${encodeURIComponent(message)}`);
  }

  if (!organizationId) redirect("/superadmin");
  if (!email || !email.includes("@")) fail("Ingresa un correo válido.");
  if (!ROLES.includes(role as (typeof ROLES)[number])) fail("Rol inválido.");
  if (exceedsLimit(email, TEXT_LIMITS.email)) fail("El correo es demasiado largo.");

  const { supabase, user } = await requireSuperadmin();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();
  if (!organization) fail("Organización no encontrada.");

  const result = await sendAndRecordOrgAdminInvitation({
    supabase,
    actorId: user.id,
    organizationId,
    organizationName: organization.name,
    email,
    role: role as (typeof ROLES)[number],
  });

  if (!result.ok) fail("No se pudo enviar la invitación.");

  await logPlatformAudit(supabase, {
    actorId: user.id,
    action: "organization.invite_admin",
    entityType: "organization",
    entityId: organizationId,
  });

  redirect(`/superadmin/organizations/${organizationId}?invited=1`);
}

// "Enviar correo" / reenviar: revoca el token pendiente y crea uno nuevo de
// 72h — no se puede reenviar el mismo rawToken porque solo el hash quedó
// guardado. Usa revoked_at (no used_at: eso significa "aceptada por el
// invitado", no "invalidada por un reenvío" — ver migración revoked_at).
export async function resendOrgAdminInvitation(formData: FormData) {
  const invitationId = String(formData.get("invitationId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");

  function fail(message: string): never {
    redirect(`/superadmin/organizations/${organizationId}?error=${encodeURIComponent(message)}`);
  }

  if (!invitationId || !organizationId) redirect("/superadmin");

  const { supabase, user } = await requireSuperadmin();

  const { data: pending } = await supabase
    .from("org_provision_invitations")
    .select("id, email, role, used_at, revoked_at, organization_id, organizations(name)")
    .eq("id", invitationId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!pending || pending.used_at || pending.revoked_at) fail("La invitación no existe o ya fue usada.");

  await supabase.from("org_provision_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", invitationId);

  const organizationName = (pending.organizations as unknown as { name: string } | null)?.name ?? "tu organización";

  const result = await sendAndRecordOrgAdminInvitation({
    supabase,
    actorId: user.id,
    organizationId,
    organizationName,
    email: pending.email,
    role: pending.role as (typeof ROLES)[number],
  });

  if (!result.ok) fail("No se pudo reenviar el correo.");

  await logPlatformAudit(supabase, {
    actorId: user.id,
    action: "organization.resend_invite",
    entityType: "organization",
    entityId: organizationId,
  });

  redirect(`/superadmin/organizations/${organizationId}?invited=1`);
}

// Borrado real (no "borrado seguro" como en supplier-erasure.ts): esto es
// una herramienta de operación de plataforma, no el flujo de derechos del
// titular — borra la organización y todo lo que cuelga de ella por cascada
// (miembros, proveedores, documentos, invitaciones...). audit_logs de esa
// organización también se cascadea (por diseño, tiene FK a organization_id)
// — por eso este evento se registra en platform_audit_logs, que no depende
// de la organización y sobrevive el borrado.
export async function deleteOrganization(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const confirmNit = String(formData.get("confirmNit") ?? "").trim();

  if (!organizationId) redirect("/superadmin");

  const { supabase, user } = await requireSuperadmin();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, nit, name")
    .eq("id", organizationId)
    .maybeSingle();

  if (!organization) redirect("/superadmin");

  if (confirmNit !== organization.nit) {
    redirect(`/superadmin/organizations/${organizationId}?error=${encodeURIComponent("El NIT no coincide — no se borró nada.")}`);
  }

  const { error } = await supabase.from("organizations").delete().eq("id", organizationId);
  if (error) {
    redirect(`/superadmin/organizations/${organizationId}?error=${encodeURIComponent("No se pudo borrar la organización.")}`);
  }

  await logPlatformAudit(supabase, {
    actorId: user.id,
    action: "organization.delete",
    entityType: "organization",
    entityId: organizationId,
  });

  redirect("/superadmin?deleted=1");
}
