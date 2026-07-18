import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getOrganizationDetail,
  updateOrganization,
  setOrganizationStatus,
  inviteAdminToOrganization,
  resendOrgAdminInvitation,
} from "@/lib/actions/superadmin";
import { DeleteOrgConfirm } from "@/components/superadmin/delete-org-confirm";
import { humanizeOrganizationStatus } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function OrganizationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; invited?: string }>;
}) {
  const { id } = await params;
  const { error, saved, invited } = await searchParams;

  const detail = await getOrganizationDetail(id);
  if (!detail) notFound();

  const { organization, members, invitations } = detail;
  const isBlocked = organization.status === "blocked";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <Link href="/superadmin" className="text-sm text-muted-foreground hover:underline">
        ← Organizaciones
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{organization.name}</CardTitle>
            <Badge variant={isBlocked ? "destructive" : "success"}>{humanizeOrganizationStatus(organization.status)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={updateOrganization} className="space-y-4">
            <input type="hidden" name="organizationId" value={organization.id} />
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" defaultValue={organization.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nit">NIT</Label>
              <Input id="nit" name="nit" defaultValue={organization.nit} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan">Plan</Label>
              <select
                id="plan"
                name="plan"
                defaultValue={organization.plan}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                <option value="estandar">Estandar</option>
                <option value="avanzado">Avanzado</option>
              </select>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {saved ? <p className="text-sm text-muted-foreground">Guardado.</p> : null}
            <Button type="submit" variant="outline" className="w-full">
              Guardar cambios
            </Button>
          </form>

          <form action={setOrganizationStatus}>
            <input type="hidden" name="organizationId" value={organization.id} />
            <input type="hidden" name="status" value={isBlocked ? "active" : "blocked"} />
            <Button type="submit" variant={isBlocked ? "default" : "destructive"} className="w-full">
              {isBlocked ? "Reactivar organización" : "Bloquear organización"}
            </Button>
          </form>

          <DeleteOrgConfirm organizationId={organization.id} nit={organization.nit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Miembros</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell className="text-xs">{m.email}</TableCell>
                  <TableCell className="text-xs">{m.role}</TableCell>
                  <TableCell className="text-xs">{m.status}</TableCell>
                </TableRow>
              ))}
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Sin miembros todavía.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitar administrador</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={inviteAdminToOrganization} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="organizationId" value={organization.id} />
            <div className="space-y-1">
              <Label htmlFor="email" className="text-xs">
                Correo
              </Label>
              <Input id="email" name="email" type="email" required className="w-56" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="role" className="text-xs">
                Rol
              </Label>
              <select
                id="role"
                name="role"
                defaultValue="admin"
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button type="submit" variant="outline">
              Invitar
            </Button>
          </form>
          {invited ? <p className="text-sm text-muted-foreground">Invitación enviada.</p> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Reenviar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => {
                const expired = new Date(inv.expires_at) <= new Date();
                const state = inv.used_at
                  ? "aceptada"
                  : inv.revoked_at
                    ? "reemplazada"
                    : expired
                      ? "expirada"
                      : "pendiente";
                const canResend = state === "pendiente" || state === "expirada";
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="text-xs">{inv.email}</TableCell>
                    <TableCell className="text-xs">{inv.role}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={state === "aceptada" ? "default" : state === "expirada" ? "destructive" : "secondary"}>
                        {state}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {canResend ? (
                        <form action={resendOrgAdminInvitation}>
                          <input type="hidden" name="invitationId" value={inv.id} />
                          <input type="hidden" name="organizationId" value={organization.id} />
                          <Button type="submit" variant="outline" size="sm">
                            Reenviar correo
                          </Button>
                        </form>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
              {invitations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Sin invitaciones todavía.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
