import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { updateSupplier } from "@/lib/actions/suppliers";
import { updateSupplierRequirements } from "@/lib/actions/supplier-requirements";
import { updateSupplierIdentity } from "@/lib/actions/supplier-identity";
import { createInvitation } from "@/lib/actions/invitations";
import { uploadDocument } from "@/lib/actions/documents";
import { reviewDocument } from "@/lib/actions/review";
import { eraseSupplierPersonalData } from "@/lib/actions/supplier-erasure";
import { DOCUMENT_RETENTION_YEARS } from "@/lib/legal/retention";
import { SUPPLIER_CATEGORIES } from "@/lib/suppliers/categories";
import { RevealIdentityButton } from "@/components/suppliers/reveal-identity-button";
import { DocumentDropzone } from "@/components/suppliers/document-dropzone";
import { DangerZone } from "@/components/suppliers/danger-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  SUPPLIER_STATUS_LABEL,
  humanizeDocumentStatus,
  documentStatusVariant,
  supplierStatusVariant,
  supplierStatusIcon,
} from "@/lib/labels";

const STATUSES = Object.keys(SUPPLIER_STATUS_LABEL);
const EXPIRY_SOON_DAYS = 15;

export default async function EditSupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    invited?: string;
    uploaded?: string;
    reviewed?: string;
    erased?: string;
    retained?: string;
  }>;
}) {
  const { id } = await params;
  const { error, invited, uploaded, reviewed, erased, retained } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  const { data: supplier } = await supabase
    .from("suppliers")
    .select(
      "id, legal_name, nit, category, status, primary_contact_email, legal_rep_full_name, legal_rep_id_number_enc, beneficial_owner_full_name, beneficial_owner_id_number_enc, personal_data_erased_at"
    )
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (!supplier) notFound();

  // El ciphertext se usa solo aquí, server-side, para saber si YA hay un
  // valor guardado — nunca se pasa el ciphertext en sí a un client component
  // ni se descifra al renderizar la página (regla 5: descifrar solo cuando
  // es estrictamente necesario, es decir, cuando alguien pide verlo).
  const hasLegalRepId = Boolean(supplier.legal_rep_id_number_enc);
  const hasBeneficialOwnerId = Boolean(supplier.beneficial_owner_id_number_enc);

  const [{ data: documentTypes }, { data: requirements }] = await Promise.all([
    supabase
      .from("document_types")
      .select("id, name")
      .eq("organization_id", membership.organizationId)
      .order("name"),
    supabase
      .from("supplier_requirements")
      .select("document_type_id, is_mandatory")
      .eq("supplier_id", id),
  ]);

  const requirementByType = new Map((requirements ?? []).map((r) => [r.document_type_id, r.is_mandatory]));

  const { data: invitations } = await supabase
    .from("invitations")
    .select("id, email, expires_at, used_at, created_at")
    .eq("supplier_id", id)
    .order("created_at", { ascending: false });

  const { data: documents } = await supabase
    .from("documents")
    .select("id, status, size_bytes, expiry_date, review_notes, created_at, document_types(name)")
    .eq("supplier_id", id)
    .order("created_at", { ascending: false });

  const documentIds = (documents ?? []).map((d) => d.id);
  type DocumentVersionRow = { id: string; document_id: string; version_no: number; created_at: string };
  let versions: DocumentVersionRow[] = [];
  if (documentIds.length > 0) {
    const { data } = await supabase
      .from("document_versions")
      .select("id, document_id, version_no, created_at")
      .in("document_id", documentIds)
      .order("version_no", { ascending: false });
    versions = data ?? [];
  }

  const versionsByDocument = new Map<string, DocumentVersionRow[]>();
  for (const v of versions ?? []) {
    const list = versionsByDocument.get(v.document_id) ?? [];
    list.push(v);
    versionsByDocument.set(v.document_id, list);
  }

  // No hay un flag "tab" propio en las Server Actions de esta página (no vale
  // la pena tocar seis actions solo por esto) — se infiere de las banderas de
  // éxito que ya existían, sin ambigüedad para uploaded/reviewed/invited/erased.
  const defaultTab = uploaded || reviewed ? "documentos" : invited || erased ? "acceso" : "info";

  const returnTo = `/app/suppliers/${supplier.id}`;
  const StatusIcon = supplierStatusIcon(supplier.status);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <Link href="/app/suppliers" className="text-sm text-muted-foreground hover:underline">
        ← Proveedores
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">
            {supplier.legal_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-heading text-xl font-semibold">{supplier.legal_name}</h1>
            <p className="text-sm text-muted-foreground">NIT {supplier.nit}</p>
          </div>
        </div>
        <Badge variant={supplierStatusVariant(supplier.status)} className="gap-1.5 px-3 py-1 text-sm">
          <StatusIcon className="size-3.5" />
          {SUPPLIER_STATUS_LABEL[supplier.status]}
        </Badge>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="info">Información general</TabsTrigger>
          <TabsTrigger value="kyc">KYC</TabsTrigger>
          <TabsTrigger value="requisitos">Requisitos documentales</TabsTrigger>
          <TabsTrigger value="documentos">Documentos cargados</TabsTrigger>
          <TabsTrigger value="acceso">Acceso y privacidad</TabsTrigger>
          <TabsIndicator />
        </TabsList>

        {/* ============ Información general ============ */}
        <TabsPanel value="info">
          <form action={updateSupplier} className="max-w-2xl space-y-4">
            <input type="hidden" name="supplierId" value={supplier.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="legal_name">
                  Razón social <span className="text-destructive">*</span>
                </Label>
                <Input id="legal_name" name="legal_name" defaultValue={supplier.legal_name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nit">
                  NIT <span className="text-destructive">*</span>
                </Label>
                <Input id="nit" name="nit" defaultValue={supplier.nit} placeholder="900123456-7" required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Categoría</Label>
                <select
                  id="category"
                  name="category"
                  defaultValue={supplier.category ?? ""}
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                >
                  <option value="">Sin categoría</option>
                  {SUPPLIER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="primary_contact_email">Correo de contacto</Label>
                <Input
                  id="primary_contact_email"
                  name="primary_contact_email"
                  type="email"
                  defaultValue={supplier.primary_contact_email ?? ""}
                />
              </div>
            </div>
            <div className="space-y-2 sm:max-w-[calc(50%-0.5rem)]">
              <Label htmlFor="status">Estado</Label>
              <select
                id="status"
                name="status"
                defaultValue={supplier.status}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {SUPPLIER_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit">Guardar cambios</Button>
          </form>
        </TabsPanel>

        {/* ============ KYC ============ */}
        <TabsPanel value="kyc">
          <form action={updateSupplierIdentity} className="max-w-2xl space-y-6">
            <input type="hidden" name="supplierId" value={supplier.id} />
            <input type="hidden" name="returnTo" value={returnTo} />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Representante legal</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="legalRepName">Nombre completo</Label>
                  <Input id="legalRepName" name="legalRepName" defaultValue={supplier.legal_rep_full_name ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="legalRepIdNumber">Cédula</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="legalRepIdNumber"
                      name="legalRepIdNumber"
                      type="password"
                      autoComplete="off"
                      placeholder={hasLegalRepId ? "•••• (dejar en blanco para no cambiar)" : "Sin registrar"}
                    />
                    {hasLegalRepId ? <RevealIdentityButton supplierId={supplier.id} field="legal_rep" /> : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t pt-6">
              <h3 className="text-sm font-medium text-muted-foreground">Beneficiario final</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="beneficialOwnerName">Nombre completo</Label>
                  <Input
                    id="beneficialOwnerName"
                    name="beneficialOwnerName"
                    defaultValue={supplier.beneficial_owner_full_name ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="beneficialOwnerIdNumber">Cédula</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="beneficialOwnerIdNumber"
                      name="beneficialOwnerIdNumber"
                      type="password"
                      autoComplete="off"
                      placeholder={hasBeneficialOwnerId ? "•••• (dejar en blanco para no cambiar)" : "Sin registrar"}
                    />
                    {hasBeneficialOwnerId ? (
                      <RevealIdentityButton supplierId={supplier.id} field="beneficial_owner" />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit">Guardar identificación</Button>
          </form>
        </TabsPanel>

        {/* ============ Requisitos documentales ============ */}
        <TabsPanel value="requisitos">
          {(documentTypes ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay tipos de documento configurados.{" "}
              <Link href="/app/document-types" className="underline">
                Crear uno
              </Link>
              .
            </p>
          ) : (
            <form action={updateSupplierRequirements} className="max-w-2xl space-y-4">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead className="text-center">Requerido</TableHead>
                    <TableHead className="text-center">Obligatorio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(documentTypes ?? []).map((dt) => {
                    const current = requirementByType.get(dt.id);
                    return (
                      <TableRow key={dt.id}>
                        <TableCell className="font-medium whitespace-normal">{dt.name}</TableCell>
                        <TableCell className="text-center">
                          <Switch name="required" value={dt.id} defaultChecked={current !== undefined} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch name="mandatory" value={dt.id} defaultChecked={current === true} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit">Guardar requisitos</Button>
            </form>
          )}
        </TabsPanel>

        {/* ============ Documentos cargados ============ */}
        <TabsPanel value="documentos">
          <div className="max-w-2xl space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Subir documento</h3>
            <form action={uploadDocument} className="space-y-3">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <div className="space-y-2">
                <Label htmlFor="documentTypeId">Tipo de documento</Label>
                <select
                  id="documentTypeId"
                  name="documentTypeId"
                  required
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                >
                  {(documentTypes ?? []).map((dt) => (
                    <option key={dt.id} value={dt.id}>
                      {dt.name}
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
              <DocumentDropzone />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit">Subir documento</Button>
            </form>
          </div>

          <div className="mt-8">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">Documentos del proveedor</h3>
            {(documents ?? []).length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead>Tamaño</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(documents ?? []).map((d) => {
                    const typeName = (d.document_types as unknown as { name: string } | null)?.name ?? "Documento";
                    const docVersions = versionsByDocument.get(d.id) ?? [];
                    const daysUntilExpiry = d.expiry_date
                      ? Math.ceil((new Date(`${d.expiry_date}T00:00:00Z`).getTime() - Date.now()) / 86_400_000)
                      : null;
                    const expiringSoon =
                      d.status === "aprobado" && daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= EXPIRY_SOON_DAYS;

                    return (
                      <TableRow key={d.id}>
                        <TableCell className="whitespace-normal">
                          <a href={`/api/documents/${d.id}/download`} className="font-medium hover:underline">
                            {typeName}
                          </a>
                          {docVersions.length > 1 ? (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-xs text-muted-foreground">
                                Historial ({docVersions.length} versiones)
                              </summary>
                              <ul className="mt-1 space-y-1 pl-3 text-xs text-muted-foreground">
                                {docVersions.map((v) => (
                                  <li key={v.id} className="flex items-center justify-between gap-2">
                                    <span>
                                      v{v.version_no} — {new Date(v.created_at).toLocaleDateString("es-CO")}
                                    </span>
                                    <a href={`/api/documents/versions/${v.id}/download`} className="underline">
                                      Descargar
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{Math.round(d.size_bytes / 1024)} KB</TableCell>
                        <TableCell className={expiringSoon ? "font-medium text-warning" : undefined}>
                          {d.expiry_date ? new Date(`${d.expiry_date}T00:00:00Z`).toLocaleDateString("es-CO") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={documentStatusVariant(d.status)}>{humanizeDocumentStatus(d.status)}</Badge>
                          {d.status !== "cargado" && d.review_notes ? (
                            <p className="mt-1 text-xs text-muted-foreground">Nota: {d.review_notes}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {d.status === "cargado" ? (
                            <div className="flex items-center justify-end gap-2">
                              <form action={reviewDocument}>
                                <input type="hidden" name="documentId" value={d.id} />
                                <input type="hidden" name="decision" value="aprobado" />
                                <input type="hidden" name="returnTo" value={returnTo} />
                                <Button type="submit" size="sm">
                                  Aprobar
                                </Button>
                              </form>
                              <details className="relative">
                                <summary className="cursor-pointer list-none">
                                  <span className="inline-flex h-7 items-center rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted">
                                    Rechazar
                                  </span>
                                </summary>
                                <form
                                  action={reviewDocument}
                                  className="absolute top-full right-0 z-10 mt-1 w-56 space-y-2 rounded-lg border bg-popover p-3 shadow-md"
                                >
                                  <input type="hidden" name="documentId" value={d.id} />
                                  <input type="hidden" name="decision" value="rechazado" />
                                  <input type="hidden" name="returnTo" value={returnTo} />
                                  <Input name="notes" placeholder="Motivo del rechazo" required className="text-xs" />
                                  <Button type="submit" variant="destructive" size="sm" className="w-full">
                                    Confirmar rechazo
                                  </Button>
                                </form>
                              </details>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Sin documentos cargados todavía.</p>
            )}
          </div>
        </TabsPanel>

        {/* ============ Acceso y privacidad ============ */}
        <TabsPanel value="acceso">
          <div className="max-w-2xl space-y-8">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Acceso del proveedor</h3>
              <form action={createInvitation} className="flex gap-2">
                <input type="hidden" name="supplierId" value={supplier.id} />
                <Input name="email" type="email" placeholder="correo@proveedor.com" required />
                <Button type="submit" variant="outline">
                  Invitar
                </Button>
              </form>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              {(invitations ?? []).length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {(invitations ?? []).map((inv) => {
                    const expired = new Date(inv.expires_at) <= new Date();
                    const state = inv.used_at ? "Usada" : expired ? "Expirada" : "Pendiente";
                    const variant = inv.used_at ? "success" : expired ? "destructive" : "secondary";
                    return (
                      <li key={inv.id} className="flex items-center justify-between border-b pb-1">
                        <span>{inv.email}</span>
                        <Badge variant={variant}>{state}</Badge>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            <div className="space-y-3 border-t pt-6">
              <h3 className="text-sm font-medium text-muted-foreground">Cumplimiento de datos (Ley 1581)</h3>
              <div>
                <a href={`/api/suppliers/${supplier.id}/export`} className="text-sm text-primary hover:underline">
                  Exportar datos del proveedor (portabilidad)
                </a>
                <p className="text-xs text-muted-foreground">
                  Descarga un JSON con los datos del proveedor, sus requisitos, documentos e invitaciones.
                </p>
              </div>
            </div>

            <div className="border-t pt-6">
              {supplier.personal_data_erased_at ? (
                <p className="text-sm text-muted-foreground">
                  Datos personales anonimizados el{" "}
                  {new Date(supplier.personal_data_erased_at).toLocaleDateString("es-CO")}.
                  {retained && retained !== "0"
                    ? ` ${retained} documento(s) se conservaron por estar dentro del plazo de retención legal (${DOCUMENT_RETENTION_YEARS} años).`
                    : null}
                </p>
              ) : (
                <DangerZone
                  action={eraseSupplierPersonalData}
                  supplierId={supplier.id}
                  retentionYears={DOCUMENT_RETENTION_YEARS}
                />
              )}
            </div>
          </div>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
