// lib/email/sample-data.ts
// Datos de ejemplo para la vista previa del editor. Para los 3 tipos de
// alerta hay DOS variantes (proveedor / organización) porque
// {{documentoDestinatario}} resuelve distinto según quién recibe el correo
// — el admin necesita ver ambas lecturas de la misma plantilla, no solo
// una (ver sección 3 del spec).
import type { EmailType } from "./blocks";

const ALERT_SAMPLE_BASE = { documentTypeName: "Certificación bancaria", expiryDate: "15 de agosto de 2026", daysUntil: "15" };

export function getSamplePreviewSets(emailType: EmailType): { label: string; variables: Record<string, string> }[] {
  switch (emailType) {
    case "invite_supplier":
      return [{ label: "Vista previa", variables: { organizationName: "Acme S.A.S.", inviteUrl: "https://ejemplo.com/invite?token=demo" } }];
    case "invite_org_admin":
      return [
        {
          label: "Vista previa",
          variables: { organizationName: "Acme S.A.S.", role: "admin", inviteUrl: "https://ejemplo.com/org-invite?token=demo" },
        },
      ];
    case "alert_expiring":
    case "alert_expired":
    case "alert_missing":
      return [
        {
          label: "Como proveedor",
          variables: {
            ...ALERT_SAMPLE_BASE,
            documentoDestinatario: `tu documento ${ALERT_SAMPLE_BASE.documentTypeName}`,
            portalUrl: "https://ejemplo.com/portal",
          },
        },
        {
          label: "Como organización",
          variables: {
            ...ALERT_SAMPLE_BASE,
            documentoDestinatario: `el documento ${ALERT_SAMPLE_BASE.documentTypeName} del proveedor Acme S.A.S.`,
            portalUrl: "https://ejemplo.com/app",
          },
        },
      ];
  }
}
