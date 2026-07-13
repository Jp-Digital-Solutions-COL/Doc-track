import Link from "next/link";
import { acceptOrgAdminInvitation, checkOrgAdminInvitationForDisplay } from "@/lib/actions/superadmin";
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

export default async function OrgInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  const check = token ? await checkOrgAdminInvitationForDisplay(token) : { valid: false as const };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Invitación de administrador</CardTitle>
          {check.valid ? (
            <CardDescription>
              {check.email} — {check.role} de {check.organizationName}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

          {!check.valid ? (
            <p className="text-sm text-muted-foreground">
              Este enlace no es válido o ya expiró. Pide al superadmin que te reinvite.
            </p>
          ) : check.userExists ? (
            <form action={acceptOrgAdminInvitation} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <p className="text-sm text-muted-foreground">
                Ya tienes una cuenta con este correo. Continúa para vincular tu acceso como {check.role}.
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
            <form action={acceptOrgAdminInvitation} className="space-y-4">
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
            <Link href="/login" className="underline">
              Ya tengo acceso, iniciar sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
