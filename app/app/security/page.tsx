import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { userRequiresMfa } from "@/lib/auth/mfa";
import { MfaUnenrollButton } from "@/components/mfa/unenroll-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SecurityPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [{ data: factors }, requiresMfa] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    userRequiresMfa(supabase, user.id),
  ]);

  const activeFactor = factors?.totp.find((f) => f.status === "verified");

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-2xl font-semibold">Seguridad</h1>
      <Card>
        <CardHeader>
          <CardTitle>Verificación en dos pasos</CardTitle>
          <CardDescription>
            {requiresMfa
              ? "Tu rol (owner/admin) requiere un segundo factor de autenticación activo."
              : "Opcional: añade una app autenticadora como segundo factor."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeFactor ? (
            <div className="space-y-4">
              <p className="text-sm">
                Estado: <Badge variant="success">Activada</Badge>
              </p>
              {requiresMfa ? (
                <p className="text-sm text-muted-foreground">
                  Si la desactivas, deberás volver a configurarla en tu próximo inicio de sesión
                  — tu rol la exige.
                </p>
              ) : null}
              <MfaUnenrollButton factorId={activeFactor.id} />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm">
                Estado: <Badge variant="secondary">Desactivada</Badge>
              </p>
              <Link href="/mfa/enroll?redirectTo=/app/security" className={cn(buttonVariants())}>
                Activar
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
