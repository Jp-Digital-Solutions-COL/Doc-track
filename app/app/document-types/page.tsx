import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { deleteDocumentType } from "@/lib/actions/document-types";
import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function DocumentTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("id, name, description, requires_expiry, default_validity_days, default_validity_month, default_validity_day")
    .eq("organization_id", membership.organizationId)
    .order("name");

  function formatValidity(dt: NonNullable<typeof documentTypes>[number]) {
    if (dt.default_validity_days) return `${dt.default_validity_days} días`;
    if (dt.default_validity_month && dt.default_validity_day) {
      return `${String(dt.default_validity_day).padStart(2, "0")}/${String(dt.default_validity_month).padStart(2, "0")} cada año`;
    }
    return "—";
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Tipos de documento</h1>
        <Link href="/app/document-types/new" className={cn(buttonVariants())}>
          Nuevo tipo
        </Link>
      </div>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {(documentTypes ?? []).length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Todavía no hay tipos de documento"
          description="Definí qué documentos le vas a pedir a tus proveedores (RUT, Cámara de Comercio, certificaciones...) antes de poder asignárselos."
          actionHref="/app/document-types/new"
          actionLabel="Nuevo tipo"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(documentTypes ?? []).map((dt) => (
              <TableRow key={dt.id}>
                <TableCell>
                  <Link href={`/app/document-types/${dt.id}`} className="hover:underline">
                    {dt.name}
                  </Link>
                </TableCell>
                <TableCell>{dt.requires_expiry ? "Sí" : "No"}</TableCell>
                <TableCell>{formatValidity(dt)}</TableCell>
                <TableCell className="text-right">
                  <form action={deleteDocumentType}>
                    <input type="hidden" name="id" value={dt.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Eliminar
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
