import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions/auth";
import { uploadDocument } from "@/lib/actions/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BrandStyle } from "@/components/brand-style";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; uploaded?: string }>;
}) {
  const { error, uploaded } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // El middleware ya protege /portal/*; esto revalida en el server de todos
  // modos (defensa en profundidad, CLAUDE.md regla 5).
  if (!user) redirect("/login");

  const { data: access } = await supabase
    .from("supplier_users")
    .select("supplier_id, suppliers(legal_name, status, organizations(name, logo_url, brand_color))")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!access) redirect("/login");

  const supplierRow = access.suppliers as unknown as {
    legal_name: string;
    status: string;
    organizations: { name: string; logo_url: string | null; brand_color: string | null } | null;
  } | null;
  const supplierName = supplierRow?.legal_name ?? "tu empresa";
  const org = supplierRow?.organizations ?? null;

  const [{ data: requirements }, { data: documents }] = await Promise.all([
    supabase
      .from("supplier_requirements")
      .select("document_type_id, is_mandatory, document_types(name)")
      .eq("supplier_id", access.supplier_id),
    supabase
      .from("documents")
      .select("id, document_type_id, status")
      .eq("supplier_id", access.supplier_id),
  ]);

  const documentByType = new Map((documents ?? []).map((d) => [d.document_type_id, d]));

  return (
    <div className="mx-auto max-w-2xl p-8">
      <BrandStyle brandColor={org?.brand_color ?? null} />
      <div className="mb-6 flex items-center gap-2">
        <Image
          src={org?.logo_url ?? "/doc-track-logo.png"}
          alt={org?.name ?? "Doc-Track"}
          width={28}
          height={28}
          className="size-7 shrink-0"
        />
        <p className="text-sm font-medium text-muted-foreground">{org?.name ?? "Doc-Track"}</p>
      </div>
      <h1 className="text-2xl font-semibold">{supplierName}</h1>
      <p className="text-muted-foreground">Sesión iniciada como {user.email}.</p>

      <div className="mt-6 space-y-2">
        <h2 className="text-lg font-medium">Documentos requeridos</h2>
        {(requirements ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            La empresa aún no configuró qué documentos necesita de ti.
          </p>
        ) : (
          <ul className="space-y-2">
            {(requirements ?? []).map((r) => {
              const typeName =
                (r.document_types as unknown as { name: string } | null)?.name ?? "Documento";
              const document = documentByType.get(r.document_type_id);
              const status = document?.status ?? "pendiente";
              return (
                <li key={r.document_type_id} className="flex items-center justify-between border-b pb-2">
                  <span>
                    {document ? (
                      <a href={`/api/documents/${document.id}/download`} className="underline">
                        {typeName}
                      </a>
                    ) : (
                      typeName
                    )}
                    {r.is_mandatory ? <span className="ml-1 text-xs text-muted-foreground">(obligatorio)</span> : null}
                  </span>
                  <Badge variant={status === "aprobado" ? "default" : "secondary"}>{status}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {(requirements ?? []).length > 0 ? (
        <div className="mt-6 space-y-3 border-t pt-6">
          <h2 className="text-lg font-medium">Subir documento</h2>
          <form action={uploadDocument} className="space-y-3">
            <input type="hidden" name="supplierId" value={access.supplier_id} />
            <input type="hidden" name="returnTo" value="/portal" />
            <div className="space-y-2">
              <Label htmlFor="documentTypeId">Tipo de documento</Label>
              <select
                id="documentTypeId"
                name="documentTypeId"
                required
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                {(requirements ?? []).map((r) => (
                  <option key={r.document_type_id} value={r.document_type_id}>
                    {(r.document_types as unknown as { name: string } | null)?.name ?? "Documento"}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="issueDate">Fecha de expedición</Label>
                <Input id="issueDate" name="issueDate" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiryDate">Fecha de vencimiento</Label>
                <Input id="expiryDate" name="expiryDate" type="date" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">Archivo (PDF, JPG o PNG — máx. 15MB)</Label>
              <Input id="file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {uploaded ? <p className="text-sm text-muted-foreground">Documento subido.</p> : null}
            <Button type="submit" className="w-full">
              Subir documento
            </Button>
          </form>
        </div>
      ) : null}

      <form action={logout} className="mt-6">
        <Button type="submit" variant="outline">
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}
