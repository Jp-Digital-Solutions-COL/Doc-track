// lib/email/blocks.ts
// Tipos y constantes del editor visual de correos, compartidos entre el
// renderer (server y client — ver render-blocks.ts), el validador
// (template-schema.ts) y la UI (email-template-editor.tsx). Sin
// "server-only": debe poder importarse desde un client component para
// el preview en vivo, igual que lib/email/template.ts.

export const EMAIL_TYPES = [
  "invite_supplier",
  "invite_org_admin",
  "alert_expiring",
  "alert_expired",
  "alert_missing",
] as const;

export type EmailType = (typeof EMAIL_TYPES)[number];

export type EmailBlock =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image"; url: string; alt: string }
  | { id: string; type: "button"; label: string; hrefVar: string }
  | { id: string; type: "divider" };

// Cada tipo de correo tiene exactamente una variable de botón — el CTA
// nunca apunta a una URL libre (ver sección 2 del spec).
export const BUTTON_HREF_VAR_BY_TYPE: Record<EmailType, string> = {
  invite_supplier: "inviteUrl",
  invite_org_admin: "inviteUrl",
  alert_expiring: "portalUrl",
  alert_expired: "portalUrl",
  alert_missing: "portalUrl",
};

// Variables insertables en texto/subject por tipo de correo — cualquier
// token {{...}} fuera de esta lista se rechaza al guardar (sección 3).
// inviteUrl/portalUrl NO están acá: solo son alcanzables vía botón, nunca
// como texto libre.
export const ALLOWED_VARIABLES_BY_TYPE: Record<EmailType, string[]> = {
  invite_supplier: ["organizationName"],
  invite_org_admin: ["organizationName", "role"],
  alert_expiring: ["documentoDestinatario", "documentTypeName", "expiryDate", "daysUntil"],
  alert_expired: ["documentoDestinatario", "documentTypeName", "expiryDate"],
  alert_missing: ["documentoDestinatario", "documentTypeName"],
};

export const BLOCK_LIMITS = {
  maxBlocks: 20,
  maxTextLength: 2000,
  maxSubjectLength: 200,
  maxButtonLabelLength: 200,
  maxAltLength: 200,
} as const;

export const EMAIL_TYPE_LABEL: Record<EmailType, string> = {
  invite_supplier: "Invitación a proveedor",
  invite_org_admin: "Invitación a administrador",
  alert_expiring: "Alerta: documento por vencer",
  alert_expired: "Alerta: documento vencido",
  alert_missing: "Alerta: documento faltante",
};
