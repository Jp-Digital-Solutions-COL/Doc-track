import type { SupabaseClient } from "@supabase/supabase-js";
import { hasFeature, type Plan } from "@/lib/plans/features";

export type ExpiringDocumentAlert = {
  documentId: string;
  organizationId: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string | null;
  documentTypeName: string;
  expiryDate: string;
  daysUntil: number;
};

export type ExpiredDocumentAlert = {
  documentId: string;
  organizationId: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string | null;
  documentTypeName: string;
  expiryDate: string;
};

export type MissingDocumentAlert = {
  organizationId: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string | null;
  documentTypeId: string;
  documentTypeName: string;
};

// Umbrales fijos del plan "estandar" — y también el fallback para "avanzado"
// cuando la org no configuró los suyos. lib/actions/plan.ts valida que un
// umbral personalizado nunca supere MAX_ALERT_THRESHOLD_DAYS, así la consulta
// de abajo puede acotar el rango de fechas sin tener que conocer de antemano
// los umbrales de cada org.
export const DEFAULT_ALERT_THRESHOLD_DAYS = [30, 15, 5] as const;
export const MAX_ALERT_THRESHOLD_DAYS = 60;

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Documentos aprobados cuyo expiry_date cae EXACTAMENTE en uno de los
// checkpoints de umbral — no "en los próximos N días". El checkpoint exacto
// evita mandar el aviso repetidamente mientras el plazo se acorta; cada
// umbral se cruza una sola vez.
//
// El umbral es por-org: "avanzado" puede tener el suyo propio
// (organizations.alert_threshold_days — reglas dinámicas, Fase 10.1); en
// "estandar", o si "avanzado" no configuró nada, se usa el fijo. Esto es
// gating de APLICACIÓN — se revalida el plan aquí mismo, no solo al guardar
// el umbral (CLAUDE.md regla 5: defensa en profundidad, por si una org baja
// de plan y le queda un valor guardado de cuando era "avanzado").
export async function findExpiringDocuments(supabase: SupabaseClient, today: Date): Promise<ExpiringDocumentAlert[]> {
  const rangeEnd = isoDate(addDays(today, MAX_ALERT_THRESHOLD_DAYS));
  const rangeStart = isoDate(today);

  const { data } = await supabase
    .from("documents")
    .select(
      "id, organization_id, supplier_id, expiry_date, document_types(name), suppliers(legal_name, primary_contact_email), organizations(plan, alert_threshold_days)"
    )
    .eq("status", "aprobado")
    .gte("expiry_date", rangeStart)
    .lte("expiry_date", rangeEnd);

  const todayMs = new Date(rangeStart).getTime();

  const alerts: ExpiringDocumentAlert[] = [];

  for (const d of data ?? []) {
    const supplier = d.suppliers as unknown as { legal_name: string; primary_contact_email: string | null } | null;
    const documentType = d.document_types as unknown as { name: string } | null;
    const org = d.organizations as unknown as { plan: Plan; alert_threshold_days: number[] | null } | null;

    const thresholds =
      org && hasFeature(org.plan, "dynamic_alert_rules") && org.alert_threshold_days?.length
        ? org.alert_threshold_days
        : DEFAULT_ALERT_THRESHOLD_DAYS;

    const daysUntil = Math.round((new Date(d.expiry_date as string).getTime() - todayMs) / (1000 * 60 * 60 * 24));
    if (!(thresholds as readonly number[]).includes(daysUntil)) continue;

    alerts.push({
      documentId: d.id,
      organizationId: d.organization_id,
      supplierId: d.supplier_id,
      supplierName: supplier?.legal_name ?? "proveedor",
      supplierEmail: supplier?.primary_contact_email ?? null,
      documentTypeName: documentType?.name ?? "documento",
      expiryDate: d.expiry_date as string,
      daysUntil,
    });
  }

  return alerts;
}

// Aprobados cuyo expiry_date ya pasó — el job además los pasa a
// status='vencido' (ver route.ts) para que la UI deje de mostrarlos como
// "aprobado".
export async function findNewlyExpiredDocuments(supabase: SupabaseClient, today: Date): Promise<ExpiredDocumentAlert[]> {
  const { data } = await supabase
    .from("documents")
    .select("id, organization_id, supplier_id, expiry_date, document_types(name), suppliers(legal_name, primary_contact_email)")
    .eq("status", "aprobado")
    .lt("expiry_date", isoDate(today));

  return (data ?? []).map((d) => {
    const supplier = d.suppliers as unknown as { legal_name: string; primary_contact_email: string | null } | null;
    const documentType = d.document_types as unknown as { name: string } | null;
    return {
      documentId: d.id,
      organizationId: d.organization_id,
      supplierId: d.supplier_id,
      supplierName: supplier?.legal_name ?? "proveedor",
      supplierEmail: supplier?.primary_contact_email ?? null,
      documentTypeName: documentType?.name ?? "documento",
      expiryDate: d.expiry_date as string,
    };
  });
}

// Requisitos mandatorios sin ninguna fila en documents — diferencia de
// conjuntos en JS en vez de un anti-join SQL: para el volumen esperado
// (cientos/miles de requisitos) es simple, correcto y suficientemente
// rápido. Si esto se vuelve un cuello de botella real, el reemplazo es un
// LEFT JOIN ... WHERE documents.id IS NULL vía una función RPC.
export async function findMissingMandatoryDocuments(supabase: SupabaseClient): Promise<MissingDocumentAlert[]> {
  const [{ data: requirements }, { data: documents }] = await Promise.all([
    supabase
      .from("supplier_requirements")
      .select("organization_id, supplier_id, document_type_id, is_mandatory, document_types(name), suppliers(legal_name, primary_contact_email)")
      .eq("is_mandatory", true),
    supabase.from("documents").select("supplier_id, document_type_id"),
  ]);

  const existing = new Set((documents ?? []).map((d) => `${d.supplier_id}:${d.document_type_id}`));

  return (requirements ?? [])
    .filter((r) => !existing.has(`${r.supplier_id}:${r.document_type_id}`))
    .map((r) => {
      const supplier = r.suppliers as unknown as { legal_name: string; primary_contact_email: string | null } | null;
      const documentType = r.document_types as unknown as { name: string } | null;
      return {
        organizationId: r.organization_id,
        supplierId: r.supplier_id,
        supplierName: supplier?.legal_name ?? "proveedor",
        supplierEmail: supplier?.primary_contact_email ?? null,
        documentTypeId: r.document_type_id,
        documentTypeName: documentType?.name ?? "documento",
      };
    });
}

// Contactos internos (owner/admin/reviewer activos) de una organización —
// "la empresa" a la que también hay que avisarle.
export async function getOrgRecipientEmails(supabase: SupabaseClient, organizationId: string): Promise<string[]> {
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  const emails = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data } = await supabase.auth.admin.getUserById(m.user_id);
      return data.user?.email ?? null;
    })
  );

  return emails.filter((e): e is string => Boolean(e));
}
