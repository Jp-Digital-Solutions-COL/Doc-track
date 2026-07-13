import { login } from "@/lib/actions/auth";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; linked?: string }>;
}) {
  const { error, linked } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandLogo className="mx-auto mb-2 h-10 w-auto" />
          <CardTitle>Portal de proveedores</CardTitle>
          <CardDescription>Accede para ver y gestionar tus documentos.</CardDescription>
        </CardHeader>
        <CardContent>
          {linked ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Tu acceso quedó vinculado. Inicia sesión con tu contraseña habitual.
            </p>
          ) : null}
          <form action={login} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <PasswordInput id="password" name="password" required autoComplete="current-password" />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
