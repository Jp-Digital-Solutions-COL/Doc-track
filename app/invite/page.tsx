import Link from "next/link";
import { acceptInvitation, checkInvitationForDisplay } from "@/lib/actions/invitations";
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

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  const check = token ? await checkInvitationForDisplay(token) : { valid: false as const };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Invitación de proveedor</CardTitle>
          {check.valid ? <CardDescription>{check.email}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

          {!check.valid ? (
            <p className="text-sm text-muted-foreground">
              Este enlace no es válido o ya expiró. Pide a la empresa que te reinvite.
            </p>
          ) : check.userExists ? (
            <form action={acceptInvitation} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <p className="text-sm text-muted-foreground">
                Ya tienes una cuenta con este correo. Continúa para vincular tu acceso como proveedor.
              </p>
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
              <Button type="submit" className="w-full">
                Vincular acceso
              </Button>
            </form>
          ) : (
            <form action={acceptInvitation} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div className="space-y-2">
                <Label htmlFor="password">Crea una contraseña</Label>
                <PasswordInput id="password" name="password" minLength={6} required autoFocus />
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
              <Button type="submit" className="w-full">
                Aceptar invitación
              </Button>
            </form>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/portal/login" className="underline">
              Ya tengo acceso, iniciar sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
