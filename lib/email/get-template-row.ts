// lib/email/get-template-row.ts
// Un solo lugar para "¿esta organización personalizó este tipo de correo?"
// — usado por la Server Action del editor, por los emisores de invitación/
// alerta, y por el cron de alertas (con su propio cache por corrida). Acepta
// cualquier SupabaseClient (con o sin sesión, admin o no): el caller decide
// si la lectura debe pasar por RLS o no, igual que logAudit().
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailBlock, EmailType } from "./blocks.ts";

export async function getOrgEmailTemplate(
  client: SupabaseClient,
  organizationId: string,
  emailType: EmailType
): Promise<{ subject: string; blocks: EmailBlock[] } | null> {
  const { data } = await client
    .from("organization_email_templates")
    .select("subject, blocks")
    .eq("organization_id", organizationId)
    .eq("email_type", emailType)
    .maybeSingle();

  if (!data) return null;
  return { subject: data.subject, blocks: data.blocks as EmailBlock[] };
}
