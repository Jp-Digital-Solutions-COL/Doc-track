import type { SupabaseClient } from "@supabase/supabase-js";

// Una fila por organización por día — % de proveedores en estado 'activo'
// sobre el total. Upsert (no insert): si el cron corre dos veces el mismo
// día, la segunda corrida solo actualiza el número con el estado más
// reciente en vez de duplicar la fila (unique(organization_id, snapshot_date)).
export async function writeComplianceSnapshots(admin: SupabaseClient, todayIso: string) {
  const { data: suppliers } = await admin.from("suppliers").select("organization_id, status");

  const byOrg = new Map<string, { total: number; active: number }>();
  for (const s of suppliers ?? []) {
    const entry = byOrg.get(s.organization_id) ?? { total: 0, active: 0 };
    entry.total += 1;
    if (s.status === "activo") entry.active += 1;
    byOrg.set(s.organization_id, entry);
  }

  const rows = [...byOrg.entries()].map(([organizationId, { total, active }]) => ({
    organization_id: organizationId,
    snapshot_date: todayIso,
    compliance_pct: total > 0 ? Math.round((active / total) * 10000) / 100 : 0,
    total_suppliers: total,
    active_suppliers: active,
  }));

  if (rows.length === 0) return 0;

  const { error } = await admin.from("compliance_snapshots").upsert(rows, { onConflict: "organization_id,snapshot_date" });
  if (error) {
    console.error("compliance_snapshots upsert failed", { code: error.code });
    return 0;
  }
  return rows.length;
}
