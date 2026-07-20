// lib/email/default-templates.ts
// Traducción a bloques del HTML que hoy está hardcodeado en resend.ts/
// alerts.ts — usada como fallback de render (org sin fila personalizada) y
// como punto de partida al abrir el editor por primera vez.
//
// Las 2 invitaciones quedan con el mismo texto que hoy (solo pierden el
// <strong> de invite_org_admin: los bloques de texto son planos, formato
// enriquecido está fuera de alcance — ver spec). Las 3 alertas SÍ cambian
// de redacción: hoy la audiencia "supplier" recibe una frase de acción que
// "org" no recibe (p.ej. "Renuévalo cargando una versión nueva"), y el
// modelo de una sola plantilla por tipo de alerta no puede mantener esa
// asimetría. La redacción de acá es neutral y aplica igual a ambas
// audiencias (ver "Nota de diseño" en el plan).
import type { EmailBlock, EmailType } from "./blocks.ts";

// Omit<Union, K> no distribuye sobre uniones discriminadas (colapsa a las
// keys compartidas por todos los miembros) — este wrapper fuerza la
// distribución para que cada variante conserve sus campos propios.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

const SUBJECTS: Record<EmailType, string> = {
  invite_supplier: "Invitación de {{organizationName}} — Gestión Documental",
  invite_org_admin: "Invitación como {{role}} de {{organizationName}} — Gestión Documental",
  alert_expiring: "{{documentoDestinatario}} vence en {{daysUntil}} días",
  alert_expired: "{{documentoDestinatario}} venció",
  alert_missing: "Documento pendiente: {{documentoDestinatario}}",
};

const BLOCKS: Record<EmailType, DistributiveOmit<EmailBlock, "id">[]> = {
  invite_supplier: [
    { type: "text", text: "{{organizationName}} te invitó a cargar tus documentos como proveedor." },
    { type: "button", label: "Aceptar invitación", hrefVar: "inviteUrl" },
    { type: "text", text: "Este enlace expira en 72 horas y solo puede usarse una vez." },
  ],
  invite_org_admin: [
    { type: "text", text: "Fuiste invitado a administrar {{organizationName}} como {{role}} en Gestión Documental." },
    { type: "button", label: "Aceptar invitación", hrefVar: "inviteUrl" },
    { type: "text", text: "Este enlace expira en 72 horas y solo puede usarse una vez." },
  ],
  alert_expiring: [
    {
      type: "text",
      text: "{{documentoDestinatario}} vence el {{expiryDate}} (en {{daysUntil}} días). Recuerda mantenerlo vigente.",
    },
  ],
  alert_expired: [
    { type: "text", text: "{{documentoDestinatario}} venció el {{expiryDate}}. Es importante actualizarlo lo antes posible." },
  ],
  alert_missing: [
    { type: "text", text: "{{documentoDestinatario}} todavía no ha sido cargado. Es un documento obligatorio." },
  ],
};

export function defaultSubjectFor(emailType: EmailType): string {
  return SUBJECTS[emailType];
}

// ids generados acá (no en el editor): la plantilla predeterminada debe ser
// determinística para que el fallback de render no varíe entre llamadas.
export function defaultBlocksFor(emailType: EmailType): EmailBlock[] {
  return BLOCKS[emailType].map((block, index) => ({ ...block, id: `default-${index}` }) as EmailBlock);
}

export function resolveEmailContent(
  emailType: EmailType,
  override: { subject: string; blocks: EmailBlock[] } | null
): { subject: string; blocks: EmailBlock[] } {
  return override ?? { subject: defaultSubjectFor(emailType), blocks: defaultBlocksFor(emailType) };
}
