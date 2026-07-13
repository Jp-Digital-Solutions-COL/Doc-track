// Traducción a lenguaje natural de los valores crudos que guarda la BD
// (status/action) — para que las pantallas nunca muestren un valor interno
// tal cual (p.ej. "en_revision" o "organization.provision_invite_accept").
// Si aparece un valor sin mapear, se muestra el crudo — nunca se rompe la UI
// por un valor nuevo que todavía no se agregó acá.

import { Circle, Clock, CheckCircle2, XCircle, AlertTriangle, type LucideIcon } from "lucide-react";

export const SUPPLIER_STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  activo: "Activo",
  rechazado: "Rechazado",
  vencido: "Vencido",
};

export const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  cargado: "Cargado",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  vencido: "Vencido",
};

export const DATA_SUBJECT_REQUEST_STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  resuelta: "Resuelta",
  rechazada: "Rechazada",
};

export const DATA_SUBJECT_REQUEST_TYPE_LABEL: Record<string, string> = {
  consulta: "Consulta",
  rectificacion: "Rectificación",
  supresion: "Supresión",
};

export const ORGANIZATION_STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  blocked: "Bloqueada",
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "supplier.create": "Proveedor creado",
  "supplier.update": "Proveedor actualizado",
  "supplier_requirements.update": "Requisitos del proveedor actualizados",
  "supplier.identity.update": "Identificación KYC actualizada",
  "supplier.identity.reveal_legal_rep": "Cédula del representante legal consultada",
  "supplier.identity.reveal_beneficial_owner": "Cédula del beneficiario final consultada",
  "supplier.data_export": "Datos del proveedor exportados",
  "supplier.personal_data_erase": "Datos personales del proveedor borrados",
  "document_type.create": "Tipo de documento creado",
  "document_type.update": "Tipo de documento actualizado",
  "document_type.delete": "Tipo de documento eliminado",
  upload: "Documento subido",
  reupload: "Documento resubido",
  download: "Documento descargado",
  "document.approve": "Documento aprobado",
  "document.reject": "Documento rechazado",
  "document.expire": "Documento marcado como vencido",
  "invitation.create": "Invitación de proveedor enviada",
  "invitation.accept": "Invitación de proveedor aceptada",
  "data_subject_request.update_status": "Solicitud de titular actualizada",
  "organization.alert_thresholds_update": "Umbrales de alerta actualizados",
  "organization.update": "Organización actualizada",
  "organization.block": "Organización bloqueada",
  "organization.unblock": "Organización reactivada",
  "organization.delete": "Organización eliminada",
  "organization.invite_admin": "Administrador invitado",
  "organization.resend_invite": "Invitación reenviada",
  "organization.provision_invite": "Organización creada e invitación enviada",
  "organization.provision_invite_accept": "Invitación de organización aceptada",
};

function label(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

export const humanizeSupplierStatus = (v: string) => label(SUPPLIER_STATUS_LABEL, v);
export const humanizeDocumentStatus = (v: string) => label(DOCUMENT_STATUS_LABEL, v);
export const humanizeDataSubjectRequestStatus = (v: string) => label(DATA_SUBJECT_REQUEST_STATUS_LABEL, v);
export const humanizeDataSubjectRequestType = (v: string) => label(DATA_SUBJECT_REQUEST_TYPE_LABEL, v);
export const humanizeOrganizationStatus = (v: string) => label(ORGANIZATION_STATUS_LABEL, v);
export const humanizeAuditAction = (v: string) => label(AUDIT_ACTION_LABEL, v);

// Variante de <Badge> según el estado — mismo criterio semántico en toda la
// app: verde = resuelto/vigente, ámbar = en curso, rojo = rechazado/vencido,
// gris = todavía no arrancó.
type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

export function supplierStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "activo":
      return "success";
    case "en_revision":
      return "warning";
    case "rechazado":
    case "vencido":
      return "destructive";
    default:
      return "secondary";
  }
}

export function supplierStatusIcon(status: string): LucideIcon {
  switch (status) {
    case "activo":
      return CheckCircle2;
    case "en_revision":
      return Clock;
    case "rechazado":
      return XCircle;
    case "vencido":
      return AlertTriangle;
    default:
      return Circle;
  }
}

export function documentStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "aprobado":
      return "success";
    case "cargado":
      return "warning";
    case "rechazado":
    case "vencido":
      return "destructive";
    default:
      return "secondary";
  }
}

export function dataSubjectRequestStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "resuelta":
      return "success";
    case "en_proceso":
      return "warning";
    case "rechazada":
      return "destructive";
    default:
      return "secondary";
  }
}
