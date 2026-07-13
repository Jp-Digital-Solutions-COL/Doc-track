import Link from "next/link";
import { signup } from "@/lib/actions/auth";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandLogo className="mx-auto mb-2 h-10 w-auto" />
          <CardTitle>Crea tu empresa</CardTitle>
          <CardDescription>
            Registra tu organización — quedarás como propietario (owner).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Nombre de la empresa</Label>
              <Input id="companyName" name="companyName" required autoComplete="organization" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nit">NIT</Label>
              <Input id="nit" name="nit" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <PasswordInput id="password" name="password" required minLength={6} autoComplete="new-password" />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="acceptedPolicy" name="acceptedPolicy" required />
              <Label htmlFor="acceptedPolicy" className="text-xs font-normal text-muted-foreground">
                Acepto la{" "}
                <Link href="/legal/politica-tratamiento-datos" target="_blank" className="underline">
                  Política de Tratamiento de Datos
                </Link>{" "}
                y el{" "}
                <Link href="/legal/aviso-privacidad" target="_blank" className="underline">
                  Aviso de Privacidad
                </Link>
                .
              </Label>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full">
              Crear cuenta
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="underline">
              Inicia sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
