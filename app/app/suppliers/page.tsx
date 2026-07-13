import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { SupplierFilters } from "@/components/suppliers/supplier-filters";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SUPPLIER_STATUS_LABEL, humanizeSupplierStatus, supplierStatusVariant } from "@/lib/labels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUSES = Object.keys(SUPPLIER_STATUS_LABEL);

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  let query = supabase
    .from("suppliers")
    .select("id, legal_name, nit, category, status, primary_contact_email")
    .eq("organization_id", membership.organizationId)
    .order("legal_name");

  if (q) {
    query = query.or(`legal_name.ilike.%${q}%,nit.ilike.%${q}%`);
  }
  if (status && STATUSES.includes(status)) {
    query = query.eq("status", status);
  }

  const { data: suppliers } = await query;
  const hasFilter = Boolean(q || status);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Proveedores</h1>
        <Link href="/app/suppliers/new" className={cn(buttonVariants())}>
          Nuevo proveedor
        </Link>
      </div>

      <SupplierFilters initialQ={q ?? ""} initialStatus={status ?? ""} />

      {(suppliers ?? []).length === 0 ? (
        <EmptyState
          icon={Users}
          title={hasFilter ? "Sin resultados para este filtro" : "Todavía no hay proveedores"}
          description={
            hasFilter
              ? "Probá con otro término de búsqueda o limpiá los filtros."
              : "Registrá tu primer proveedor para empezar a pedirle documentos de cumplimiento."
          }
          actionHref={hasFilter ? undefined : "/app/suppliers/new"}
          actionLabel={hasFilter ? undefined : "Nuevo proveedor"}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Razón social</TableHead>
              <TableHead>NIT</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(suppliers ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/app/suppliers/${s.id}`} className="hover:underline">
                    {s.legal_name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{s.nit}</TableCell>
                <TableCell>{s.category ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={supplierStatusVariant(s.status)}>{humanizeSupplierStatus(s.status)}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
