import type { SupabaseClient } from "@supabase/supabase-js";

// admin.auth.admin.listUsers({ filter }) NO filtra de verdad en esta versión
// de GoTrue (verificado empíricamente con varios usuarios existentes: el
// filtro no tiene efecto). Se usa en su lugar get_user_id_by_email(), una
// función SQL que consulta auth.users directamente (ver migración
// 20260705162527_create_get_user_id_by_email.sql). Compartido por todos los
// flujos de invitación (proveedores y, ahora, organizaciones).
export async function findUserIdByEmail(admin: SupabaseClient, email: string) {
  const { data } = await admin.rpc("get_user_id_by_email", { lookup_email: email });
  return (data as string | null) ?? null;
}
