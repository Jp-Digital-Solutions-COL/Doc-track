import Link from "next/link";
import { Mail } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandLogo className="mx-auto mb-2 h-9 w-auto" />
          <CardTitle>Recuperar acceso</CardTitle>
          <CardDescription>El restablecimiento de contraseña por correo aún no está disponible.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
            <Mail className="size-5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Escríbenos a soporte para verificar tu identidad y restablecer tu contraseña de forma manual.
            </p>
          </div>
          <Link href="/login" className="block text-center text-sm text-primary hover:underline">
            Volver a iniciar sesión
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
