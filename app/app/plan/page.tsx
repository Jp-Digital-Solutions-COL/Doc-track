import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { hasFeature, type Feature } from "@/lib/plans/features";
import { DEFAULT_ALERT_THRESHOLD_DAYS } from "@/lib/documents/expiry-alerts";
import { updateAlertThresholds } from "@/lib/actions/plan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FEATURE_LABEL: Record<Feature, string> = {
  dynamic_alert_rules: "Alertas con umbrales personalizados",
  custom_statuses: "Estados personalizables (próximamente)",
  ocr_validation: "Validación de documentos por OCR (próximamente)",
};

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  if (!["owner", "admin"].includes(membership.role)) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <p className="text-sm text-muted-foreground">Solo owner/admin pueden ver el plan de la organización.</p>
      </div>
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("plan, alert_threshold_days")
    .eq("id", membership.organizationId)
    .single();

  const plan = org?.plan ?? "estandar";
  const isAvanzado = hasFeature(plan, "dynamic_alert_rules");
  const currentThresholds = org?.alert_threshold_days?.length
    ? org.alert_threshold_days
    : [...DEFAULT_ALERT_THRESHOLD_DAYS];

  return (
    <div className="mx-auto max-w-lg space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Plan</h1>

      <Card>
        <CardHeader>
          <CardTitle>Plan de la organización</CardTitle>
          <CardDescription>
            Plan actual: <Badge variant={isAvanzado ? "default" : "secondary"}>{plan}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(Object.keys(FEATURE_LABEL) as Feature[]).map((feature) => (
            <div key={feature} className="flex items-center justify-between border-b pb-2 text-sm">
              <span>{FEATURE_LABEL[feature]}</span>
              <Badge variant={hasFeature(plan, feature) ? "default" : "outline"}>
                {hasFeature(plan, feature) ? "Disponible" : "Plan avanzado"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Umbrales de alerta de vencimiento</CardTitle>
          <CardDescription>
            Días antes del vencimiento en los que se envía una alerta. Plan estandar: fijo en{" "}
            {DEFAULT_ALERT_THRESHOLD_DAYS.join(", ")} días.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isAvanzado ? (
            <form action={updateAlertThresholds} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="thresholds">Días (separados por coma)</Label>
                <Input id="thresholds" name="thresholds" defaultValue={currentThresholds.join(", ")} required />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {saved ? <p className="text-sm text-muted-foreground">Guardado.</p> : null}
              <Button type="submit" variant="outline" className="w-full">
                Guardar umbrales
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Actualiza al plan avanzado para personalizar estos umbrales.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
