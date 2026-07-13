// Vigencia fija por mes/día (ej. "vence cada 1 de enero"), alterna a
// default_validity_days. Ver migración add_fixed_date_validity_to_document_types.

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Próxima fecha con ese mes/día en o después de fromIso. Si el día no existe
// en ese año (29 feb en año no bisiesto), se recorta al último día del mes.
export function nextFixedDateOnOrAfter(fromIso: string, month: number, day: number): string {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const year = from.getUTCFullYear();

  const build = (y: number) => new Date(Date.UTC(y, month - 1, Math.min(day, daysInMonth(y, month))));

  const candidate = build(year);
  const result = candidate >= from ? candidate : build(year + 1);
  return result.toISOString().slice(0, 10);
}
