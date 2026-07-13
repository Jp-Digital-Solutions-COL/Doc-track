// Plazos de Ley 1581: consulta = 10 días calendario, reclamo (rectificación o
// supresión) = 15 días hábiles en la norma, pero para no requerir un
// calendario de festivos aquí se usan días calendario como aproximación
// conservadora hacia el titular (misma fecha o antes de la real) —
// ponytail: ajustar a días hábiles si se necesita el plazo exacto.
const DEADLINE_DAYS: Record<"consulta" | "rectificacion" | "supresion", number> = {
  consulta: 10,
  rectificacion: 15,
  supresion: 15,
};

export function calculateDataSubjectRequestDueDate(requestType: keyof typeof DEADLINE_DAYS, submittedAt: Date): string {
  const due = new Date(submittedAt);
  due.setDate(due.getDate() + DEADLINE_DAYS[requestType]);
  return due.toISOString().slice(0, 10);
}
