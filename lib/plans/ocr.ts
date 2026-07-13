// Módulo enchufable de validación por contenido (OCR) — al aprobar un
// documento, verificar que el contenido corresponde (p.ej. el RUT contiene
// el NIT esperado). Fase 10.2 diseña la implementación real (qué servicio de
// OCR, costo, privacidad de procesar el archivo). Hasta entonces este flag
// se queda en false para todos los planes — ver lib/plans/features.ts.
export const OCR_VALIDATION_ENABLED = false;
