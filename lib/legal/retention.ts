// Años de retención obligatoria de documentos de cumplimiento (soporte
// contable/tributario, contractual, SAGRILAFT). PLACEHOLDER — confirmar con
// el asesor legal/contable el plazo real aplicable por tipo de documento
// (en Colombia, los soportes contables suelen exigir 5-10 años según el
// Código de Comercio y normas tributarias). Mientras tanto se usa un único
// plazo conservador para TODOS los documentos.
export const DOCUMENT_RETENTION_YEARS = 5;

export function isWithinRetentionWindow(createdAt: string, now: Date = new Date()): boolean {
  const retainUntil = new Date(createdAt);
  retainUntil.setFullYear(retainUntil.getFullYear() + DOCUMENT_RETENTION_YEARS);
  return retainUntil > now;
}
