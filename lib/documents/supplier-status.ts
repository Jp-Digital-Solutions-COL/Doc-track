export type DocumentStatus = "cargado" | "aprobado" | "rechazado" | "vencido";
export type SupplierStatus = "pendiente" | "en_revision" | "activo" | "rechazado" | "vencido";

export type RequirementInput = {
  documentTypeId: string;
  isMandatory: boolean;
};

export type DocumentInput = {
  documentTypeId: string;
  status: DocumentStatus;
  expiryDate: string | null; // ISO date (YYYY-MM-DD) o null si no aplica
};

// Función pura: sin I/O, sin fechas implícitas (recibe `today` explícito
// para que los tests sean deterministas). Prioridad de evaluación —de más a
// menos urgente— cuando varias condiciones aplican a la vez:
//
//   1. rechazado   — algún documento MANDATORIO fue rechazado por un revisor.
//   2. vencido     — algún documento MANDATORIO aprobado ya pasó su expiry_date
//                    (o el propio documento quedó marcado 'vencido').
//   3. pendiente   — algún requisito MANDATORIO no tiene documento cargado.
//   4. en_revision — algún documento MANDATORIO está cargado sin revisar aún.
//   5. activo      — todos los documentos MANDATORIOS están aprobados y vigentes.
//
// Nota: el enum de `suppliers.status` incluye 'rechazado', pero las reglas
// del encargo no dicen qué pasa cuando un revisor rechaza un documento
// mandatorio — se propone aquí que ESE caso mande al proveedor a
// 'rechazado' (más urgente que "pendiente de subir"), en vez de tratarlo
// como si el documento nunca se hubiera subido.
export function calculateSupplierStatus(
  requirements: RequirementInput[],
  documents: DocumentInput[],
  today: Date = new Date()
): SupplierStatus {
  const mandatoryTypeIds = requirements.filter((r) => r.isMandatory).map((r) => r.documentTypeId);

  // Sin checklist mandatorio configurado, no hay nada que verificar todavía
  // — no es "activo" por defecto (vacuamente), es que aún falta configurar.
  if (mandatoryTypeIds.length === 0) return "pendiente";

  const documentByType = new Map(documents.map((d) => [d.documentTypeId, d]));
  const mandatoryDocs = mandatoryTypeIds.map((typeId) => documentByType.get(typeId));

  if (mandatoryDocs.some((d) => d?.status === "rechazado")) {
    return "rechazado";
  }

  const isExpired = (d: DocumentInput) =>
    d.status === "vencido" || (d.status === "aprobado" && d.expiryDate !== null && d.expiryDate < isoDate(today));

  if (mandatoryDocs.some((d) => d && isExpired(d))) {
    return "vencido";
  }

  if (mandatoryDocs.some((d) => !d)) {
    return "pendiente";
  }

  if (mandatoryDocs.some((d) => d!.status === "cargado")) {
    return "en_revision";
  }

  return "activo";
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
