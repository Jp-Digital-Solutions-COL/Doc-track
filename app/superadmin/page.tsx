import Link from "next/link";
import { Building2 } from "lucide-react";
import { listOrganizations } from "@/lib/actions/superadmin";
import { humanizeOrganizationStatus } from "@/lib/labels";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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

export default async function SuperadminPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
  const organizations = await listOrganizations();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <Link href="/app" className="text-sm text-muted-foreground hover:underline">
        ← Volver al dashboard
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Organizaciones</h1>
        <Link href="/superadmin/organizations/new">
          <Button>Crear organización</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Todas las empresas creadas en la plataforma.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleted ? <p className="text-sm text-muted-foreground">Organización eliminada.</p> : null}
          {organizations.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Todavía no hay organizaciones"
              description="Creá la primera empresa e invitá a su owner por correo."
              actionHref="/superadmin/organizations/new"
              actionLabel="Crear organización"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>NIT</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Miembros</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((org) => {
                  const memberCount = (org.organization_members as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
                  return (
                    <TableRow key={org.id}>
                      <TableCell className="text-xs">
                        <Link href={`/superadmin/organizations/${org.id}`} className="hover:underline">
                          {org.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{org.nit}</TableCell>
                      <TableCell className="text-xs">{org.plan}</TableCell>
                      <TableCell className="text-xs">{memberCount}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={org.status === "active" ? "success" : "destructive"}>
                          {humanizeOrganizationStatus(org.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
