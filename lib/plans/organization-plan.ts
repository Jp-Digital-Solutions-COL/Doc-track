import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan } from "@/lib/plans/features";

export async function getOrganizationPlan(supabase: SupabaseClient, organizationId: string): Promise<Plan> {
  const { data } = await supabase.from("organizations").select("plan").eq("id", organizationId).maybeSingle();
  return (data?.plan as Plan | undefined) ?? "estandar";
}
