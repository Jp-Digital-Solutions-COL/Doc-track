import Link from "next/link";
import { createOrganizationAndInviteAdmin } from "@/lib/actions/superadmin";
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

export default async function NewOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-8">
      <Link href="/superadmin" className="text-sm text-muted-foreground hover:underline">
        ← Volver
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Crear organización</CardTitle>
          <CardDescription>
            Crea la empresa y envía una invitación por correo para que su primer owner/admin active su acceso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createOrganizationAndInviteAdmin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Nombre de la empresa</Label>
              <Input id="companyName" name="companyName" required autoComplete="organization" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nit">NIT</Label>
              <Input id="nit" name="nit" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo del administrador</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rol</Label>
              <select
                id="role"
                name="role"
                defaultValue="owner"
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full">
              Crear e invitar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
