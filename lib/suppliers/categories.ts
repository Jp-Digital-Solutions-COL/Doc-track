// Lista fija de categorías para mantener el dato consistente y filtrable —
// el campo en BD sigue siendo texto libre (sin constraint), así que un valor
// ya guardado que no esté en esta lista simplemente no se puede seleccionar
// de nuevo pero no rompe nada.
export const SUPPLIER_CATEGORIES = [
  "Servicios profesionales",
  "Tecnología",
  "Construcción y obra civil",
  "Logística y transporte",
  "Consultoría",
  "Suministros y materiales",
  "Alimentos y bebidas",
  "Salud",
  "Financiero",
  "Otra",
] as const;
