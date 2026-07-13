// Versión vigente de la Política de Tratamiento de Datos / Aviso de
// Privacidad (ver app/legal/*). Subir este número cuando el abogado publique
// un cambio material — cada consent_records.policy_version queda fija al
// valor vigente en el momento de la aceptación, así que versiones viejas
// siguen siendo un registro histórico válido, nunca se reescriben.
export const CURRENT_POLICY_VERSION = "1.0";

export const CONSENT_PURPOSE = {
  org_owner:
    "Gestión documental de proveedores: administrar el registro de la empresa, sus proveedores, documentos de cumplimiento y las comunicaciones asociadas al servicio.",
  supplier_contact:
    "Verificación y gestión de documentos de cumplimiento como proveedor de la empresa contratante, incluyendo datos del representante legal y beneficiario final cuando aplique.",
} as const;
