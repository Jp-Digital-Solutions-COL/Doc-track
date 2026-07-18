import "server-only";
import { sendEmail } from "@/lib/email/send";
import { renderEmailHtml } from "@/lib/email/template";

export type AlertKind = "expiring" | "expired" | "missing";
export type Audience = "supplier" | "org";

type AlertParams = {
  supplierName: string;
  documentTypeName: string;
  daysUntil?: number; // solo para "expiring"
  expiryDate?: string; // "expiring" | "expired"
};

function buildAlertEmail(kind: AlertKind, audience: Audience, p: AlertParams): { subject: string; html: string } {
  const who = audience === "supplier" ? "tu" : `de ${p.supplierName}`;
  const subjectSupplier = {
    expiring: `Tu documento "${p.documentTypeName}" vence en ${p.daysUntil} días`,
    expired: `Tu documento "${p.documentTypeName}" venció`,
    missing: `Falta cargar "${p.documentTypeName}"`,
  }[kind];
  const subjectOrg = {
    expiring: `${p.supplierName}: "${p.documentTypeName}" vence en ${p.daysUntil} días`,
    expired: `${p.supplierName}: "${p.documentTypeName}" venció`,
    missing: `${p.supplierName}: falta "${p.documentTypeName}"`,
  }[kind];

  const bodySupplier = {
    expiring: `<p>${who} documento <strong>${p.documentTypeName}</strong> vence el ${p.expiryDate} (en ${p.daysUntil} días). Renuévalo cargando una versión nueva.</p>`,
    expired: `<p>${who} documento <strong>${p.documentTypeName}</strong> venció el ${p.expiryDate}. Carga una versión vigente lo antes posible.</p>`,
    missing: `<p>Todavía no has cargado <strong>${p.documentTypeName}</strong>, un documento obligatorio. Súbelo desde tu portal.</p>`,
  }[kind];
  const bodyOrg = {
    expiring: `<p>El documento <strong>${p.documentTypeName}</strong> ${who} vence el ${p.expiryDate} (en ${p.daysUntil} días).</p>`,
    expired: `<p>El documento <strong>${p.documentTypeName}</strong> ${who} venció el ${p.expiryDate}.</p>`,
    missing: `<p>${p.supplierName} aún no ha cargado <strong>${p.documentTypeName}</strong>, un documento obligatorio.</p>`,
  }[kind];

  return {
    subject: audience === "supplier" ? subjectSupplier : subjectOrg,
    html: audience === "supplier" ? bodySupplier : bodyOrg,
  };
}

export async function sendAlertEmail(
  to: string,
  kind: AlertKind,
  audience: Audience,
  params: AlertParams,
  branding: { logoUrl: string | null; brandColor: string | null }
) {
  const { subject, html } = buildAlertEmail(kind, audience, params);
  await sendEmail({ to, subject, html: renderEmailHtml({ logoUrl: branding.logoUrl, bodyHtml: html }) });
}
