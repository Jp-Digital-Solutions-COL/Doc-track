import type { SupabaseClient } from "@supabase/supabase-js";

// Solo IDs y nombres de evento — nunca PII, nombres de archivo ni contenido
// (CLAUDE.md regla 6). `action` y `entityType` son constantes de código,
// nunca texto libre de un formulario.
export async function logAudit(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    // null solo cuando actorType='system' (un cron, no una persona) — el
    // esquema de audit_logs anticipa esto explícitamente (columna nullable).
    actorId: string | null;
    actorType?: "user" | "supplier" | "system";
    action: string;
    entityType: string;
    entityId?: string;
  }
) {
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: params.organizationId,
    actor_id: params.actorId,
    actor_type: params.actorType ?? "user",
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
  });

  if (error) {
    // Un log de auditoría que falla en silencio es peor que no tener el
    // helper — se deja rastro (solo IDs/código, nunca PII) para que no pase
    // desapercibido como pasó con la subida del proveedor.
    console.error("audit_logs insert failed", { action: params.action, entityType: params.entityType, code: error.code });
  }
}
