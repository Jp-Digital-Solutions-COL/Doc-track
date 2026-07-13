"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MFA_REQUIRED_ROLES } from "@/lib/auth/mfa";
import { getCurrentMembership, hasSupplierAccess } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { TEXT_LIMITS, exceedsLimit } from "@/lib/security/text-limits";
import { CURRENT_POLICY_VERSION, CONSENT_PURPOSE } from "@/lib/legal/policy";
import type { SupabaseClient } from "@supabase/supabase-js";

// El destino tras login/signup se calcula AQUÍ, no dejándolo solo en manos
// del middleware: cuando un Server Action llama redirect(), Next.js sigue
// esa redirección como una navegación de cliente (fetch), y si el
// middleware la redirige de nuevo (p.ej. a /mfa/enroll), el fetch sigue esa
// segunda redirección en silencio pero la URL en el navegador se queda en
// el destino ORIGINAL — el usuario ve /app en la barra de direcciones con
// contenido de otra página. Calculando el destino final antes del único
// redirect() evitamos esa doble redirección.
async function resolveDestination(supabase: SupabaseClient, userId: string) {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const hasVerifiedFactor = aal?.nextLevel === "aal2";

  if (hasVerifiedFactor && aal?.currentLevel !== "aal2") {
    return "/mfa/verify";
  }

  const membership = await getCurrentMembership(supabase, userId);
  if (!membership) {
    // No es organization_member — puede ser un contacto de proveedor.
    return (await hasSupplierAccess(supabase, userId)) ? "/portal" : "/app";
  }

  if (!hasVerifiedFactor && MFA_REQUIRED_ROLES.includes(membership.role as (typeof MFA_REQUIRED_ROLES)[number])) {
    return "/mfa/enroll";
  }
  return "/app";
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Ingresa tu correo y contraseña.")}`);
  }

  // Por IP ya se limitó en middleware.ts; esto además limita por cuenta —
  // atacar la misma cuenta rotando de IP no sirve de nada.
  const { success: withinLoginLimit } = await checkRateLimit("login", `email:${email.toLowerCase()}`);
  if (!withinLoginLimit) {
    redirect(`/login?error=${encodeURIComponent("Demasiados intentos. Espera un minuto e intenta de nuevo.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Mensaje genérico a propósito: no revela si el correo existe o no.
    redirect(`/login?error=${encodeURIComponent("Correo o contraseña incorrectos.")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const destination = user ? await resolveDestination(supabase, user.id) : "/app";
  const needsRedirectParam = destination === "/mfa/verify" || destination === "/mfa/enroll";
  redirect(needsRedirectParam ? `${destination}?redirectTo=/app` : destination);
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const companyName = String(formData.get("companyName") ?? "").trim();
  const nit = String(formData.get("nit") ?? "").trim();
  const acceptedPolicy = formData.get("acceptedPolicy") === "on";

  if (!email || !password || !companyName || !nit) {
    redirect(`/signup?error=${encodeURIComponent("Todos los campos son obligatorios.")}`);
  }
  if (!acceptedPolicy) {
    redirect(`/signup?error=${encodeURIComponent("Debes aceptar la Política de Tratamiento de Datos.")}`);
  }
  if (
    exceedsLimit(email, TEXT_LIMITS.email) ||
    exceedsLimit(companyName, TEXT_LIMITS.companyName) ||
    exceedsLimit(nit, TEXT_LIMITS.nit)
  ) {
    redirect(`/signup?error=${encodeURIComponent("Uno de los campos es demasiado largo.")}`);
  }

  const supabase = await createClient();
  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) {
    redirect(`/signup?error=${encodeURIComponent(signUpError.message)}`);
  }

  // No confiamos en el id que pudiera venir del formulario ni asumimos el
  // resultado de signUp: releemos quién quedó autenticado en esta request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/signup?error=${encodeURIComponent("No se pudo verificar la sesión tras el registro.")}`);
  }

  // Crear la organización y volver owner al usuario es una operación
  // privilegiada (organizations no tiene policy de INSERT para el cliente,
  // ver supabase/migrations/..._create_organizations.sql) — por eso corre
  // aquí, en el server, con el admin client.
  const admin = createAdminClient();

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: companyName, nit })
    .select()
    .single();

  if (orgError) {
    // No dejar un usuario de Auth "huérfano" sin organización — se podría
    // reintentar el registro con el mismo correo.
    await admin.auth.admin.deleteUser(user.id);
    const message = orgError.code === "23505" ? "Ese NIT ya está registrado." : "No se pudo crear la organización.";
    redirect(`/signup?error=${encodeURIComponent(message)}`);
  }

  const { error: memberError } = await admin.from("organization_members").insert({
    organization_id: org.id,
    user_id: user.id,
    role: "owner",
    status: "active",
  });

  if (memberError) {
    await admin.from("organizations").delete().eq("id", org.id);
    await admin.auth.admin.deleteUser(user.id);
    redirect(`/signup?error=${encodeURIComponent("No se pudo completar el registro.")}`);
  }

  // Evidencia de autorización de tratamiento (Ley 1581): quién, cuándo, qué
  // versión de la política y con qué finalidad. Append-only, nunca se edita.
  const { error: consentError } = await admin.from("consent_records").insert({
    organization_id: org.id,
    subject_type: "org_owner",
    user_id: user.id,
    purpose: CONSENT_PURPOSE.org_owner,
    policy_version: CURRENT_POLICY_VERSION,
  });
  if (consentError) {
    console.error("consent_records insert failed", { organizationId: org.id, code: consentError.code });
  }

  // Quien crea la empresa siempre queda como owner, y owner siempre exige
  // MFA — no hace falta resolveDestination() aquí, el destino es fijo.
  redirect("/mfa/enroll?redirectTo=/app");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
