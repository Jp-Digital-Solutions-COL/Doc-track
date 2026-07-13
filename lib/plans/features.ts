// Catálogo de features por plan (Fase 10.1). Puro app-level gating: NO
// reemplaza RLS — cada acción/ruta que consulte hasFeature() sigue
// revalidando organization_id como siempre (CLAUDE.md regla 5).
export const PLANS = ["estandar", "avanzado"] as const;
export type Plan = (typeof PLANS)[number];

export const FEATURES = {
  // Alertas con umbrales de días configurables por la org (ver
  // organizations.alert_threshold_days y app/api/cron/alerts). En "estandar"
  // se ignora cualquier valor guardado y se usan los umbrales fijos.
  dynamic_alert_rules: ["avanzado"],
  // Estados de proveedor/documento personalizables por org. Declarada para
  // el gating pero AÚN NO IMPLEMENTADA — el motor de estados sigue siendo
  // fijo (lib/documents/supplier-status.ts). Construir cuando se pida.
  custom_statuses: ["avanzado"],
  // Validación por contenido (OCR). Módulo enchufable — ver
  // lib/plans/ocr.ts. Ningún plan lo tiene activo todavía (Fase 10.2 diseña
  // la implementación real antes de prenderlo).
  ocr_validation: [],
} as const satisfies Record<string, readonly Plan[]>;

export type Feature = keyof typeof FEATURES;

export function hasFeature(plan: Plan, feature: Feature): boolean {
  return (FEATURES[feature] as readonly Plan[]).includes(plan);
}
