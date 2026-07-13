"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { getOrganizationPlan } from "@/lib/plans/organization-plan";
import { hasFeature } from "@/lib/plans/features";
import { logAudit } from "@/lib/actions/audit";
import { MAX_ALERT_THRESHOLD_DAYS } from "@/lib/documents/expiry-alerts";

const ADMIN_ROLES = ["owner", "admin"] as const;

// Reglas dinámicas de alerta (Fase 10.1) — solo plan "avanzado". El check de
// plan se hace AQUÍ, en el server, no solo escondiendo el formulario en la
// UI: aunque alguien arme el POST a mano, una org "estandar" no puede guardar
// umbrales (gating de aplicación, no reemplaza RLS — CLAUDE.md regla 5).
export async function updateAlertThresholds(formData: FormData) {
  const raw = String(formData.get("thresholds") ?? "").trim();

  function fail(message: string): never {
    redirect(`/app/plan?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership || !ADMIN_ROLES.includes(membership.role as (typeof ADMIN_ROLES)[number])) {
    fail("Solo owner/admin pueden configurar alertas.");
  }

  const plan = await getOrganizationPlan(supabase, membership.organizationId);
  if (!hasFeature(plan, "dynamic_alert_rules")) {
    fail("Las alertas personalizadas son una función del plan avanzado.");
  }

  const thresholds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);

  const isValid =
    thresholds.length > 0 &&
    thresholds.every((n) => Number.isInteger(n) && n > 0 && n <= MAX_ALERT_THRESHOLD_DAYS) &&
    new Set(thresholds).size === thresholds.length;

  if (!isValid) {
    fail(`Ingresa días enteros positivos (máx. ${MAX_ALERT_THRESHOLD_DAYS}), separados por coma, sin repetir.`);
  }

  const sorted = [...thresholds].sort((a, b) => b - a);

  const { error } = await supabase
    .from("organizations")
    .update({ alert_threshold_days: sorted })
    .eq("id", membership.organizationId);

  if (error) fail("No se pudo guardar la configuración.");

  await logAudit(supabase, {
    organizationId: membership.organizationId,
    actorId: user.id,
    action: "organization.alert_thresholds_update",
    entityType: "organization",
    entityId: membership.organizationId,
  });

  redirect("/app/plan?saved=1");
}
