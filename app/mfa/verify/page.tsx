import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaVerifyForm } from "@/components/mfa/verify-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function MfaVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");

  // Sin factor verificado no hay nada que retar — el middleware ya evita
  // llegar aquí en ese caso, pero se revalida por si acaso (defensa en
  // profundidad, CLAUDE.md regla 5).
  if (!factor) {
    redirect("/app");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Verificación en dos pasos</CardTitle>
          <CardDescription>Ingresa el código de tu app autenticadora.</CardDescription>
        </CardHeader>
        <CardContent>
          <MfaVerifyForm factorId={factor.id} redirectTo={redirectTo ?? "/app"} />
        </CardContent>
      </Card>
    </div>
  );
}
