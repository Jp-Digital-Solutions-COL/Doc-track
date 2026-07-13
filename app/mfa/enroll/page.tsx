import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { userRequiresMfa } from "@/lib/auth/mfa";
import { MfaEnrollForm } from "@/components/mfa/enroll-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function MfaEnrollPage({
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

  const requiresMfa = await userRequiresMfa(supabase, user.id);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Activa la verificación en dos pasos</CardTitle>
          <CardDescription>
            {requiresMfa
              ? "Tu rol (owner/admin) requiere un segundo factor de autenticación (TOTP)."
              : "Añade una capa extra de seguridad a tu cuenta con una app autenticadora."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MfaEnrollForm redirectTo={redirectTo ?? "/app"} />
        </CardContent>
      </Card>
    </div>
  );
}
