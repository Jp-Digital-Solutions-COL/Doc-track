import "server-only";
import { sendEmail } from "@/lib/email/send";
import { renderEmailHtml } from "@/lib/email/template";
import { renderBlocks, substituteVariables } from "@/lib/email/render-blocks";
import { resolveEmailContent } from "@/lib/email/default-templates";
import type { EmailBlock, EmailType } from "@/lib/email/blocks";

export type AlertKind = "expiring" | "expired" | "missing";
export type Audience = "supplier" | "org";

type AlertParams = {
  supplierName: string;
  documentTypeName: string;
  daysUntil?: number; // solo para "expiring"
  expiryDate?: string; // "expiring" | "expired"
};

// Frase "sujeto + documento" según quién recibe el correo — reemplaza los
// mapas subjectSupplier/subjectOrg y bodySupplier/bodyOrg que existían acá
// antes de esta tarea. "del", nunca "de el" (ver sección 3 del spec).
function buildDocumentoDestinatario(audience: Audience, params: AlertParams): string {
  return audience === "supplier"
    ? `tu documento ${params.documentTypeName}`
    : `el documento ${params.documentTypeName} del proveedor ${params.supplierName}`;
}

function buildPortalUrl(audience: Audience): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  // El proveedor gestiona sus documentos en /portal; el personal de la
  // organización, en /app — mismo botón, distinto destino según quién lo ve.
  return audience === "supplier" ? `${appUrl}/portal` : `${appUrl}/app`;
}

export async function sendAlertEmail(
  to: string,
  kind: AlertKind,
  audience: Audience,
  params: AlertParams,
  branding: { logoUrl: string | null; brandColor: string | null },
  templateOverride: { subject: string; blocks: EmailBlock[] } | null
) {
  const emailType: EmailType = `alert_${kind}`;
  const { subject, blocks } = resolveEmailContent(emailType, templateOverride);

  const variables: Record<string, string | undefined> = {
    documentoDestinatario: buildDocumentoDestinatario(audience, params),
    documentTypeName: params.documentTypeName,
    expiryDate: params.expiryDate,
    daysUntil: params.daysUntil !== undefined ? String(params.daysUntil) : undefined,
    portalUrl: buildPortalUrl(audience),
  };

  await sendEmail({
    to,
    subject: substituteVariables(subject, variables).replace(/[\r\n]/g, " "),
    html: renderEmailHtml({
      logoUrl: branding.logoUrl,
      bodyHtml: renderBlocks(blocks, variables, branding.brandColor),
    }),
  });
}
