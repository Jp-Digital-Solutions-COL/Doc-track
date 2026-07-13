// Límites de longitud para campos de texto libre — se validan aquí (mensaje
// claro al usuario) y además a nivel de BD vía CHECK constraints (ver
// migración add_text_length_constraints), por si algo llega a saltarse la
// Server Action (llamada directa a la API REST, por ejemplo).
export const TEXT_LIMITS = {
  companyName: 200,
  nit: 30,
  category: 100,
  email: 254,
  documentTypeName: 150,
  documentTypeDescription: 1000,
  reviewNotes: 2000,
  idNumber: 20,
} as const;

export function exceedsLimit(value: string, max: number) {
  return value.length > max;
}
