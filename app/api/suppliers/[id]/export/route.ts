import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { logAudit } from "@/lib/actions/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { decryptField } from "@/lib/security/field-encryption";

// Exportación de datos de un proveedor (portabilidad, Ley 1581). Solo
// owner/admin de la org dueña del proveedor — descifra los números de
// identificación porque la portabilidad es exactamente el caso "es
// estrictamente necesario" que justifica el descifrado (CLAUDE.md regla 5),
// y queda auditado como cualquier otro acceso a datos sensibles.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: supplierId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new NextResponse("No autorizado.", { status: 401 });

    const membership = await getCurrentMembership(supabase, user.id);
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return new NextResponse("No autorizado.", { status: 403 });
    }

    const { success } = await checkRateLimit("download", `user:${user.id}`);
    if (!success) {
      return new NextResponse("Demasiadas solicitudes. Intenta de nuevo en un minuto.", { status: 429 });
    }

    const { data: supplier } = await supabase
      .from("suppliers")
      .select(
        "id, legal_name, nit, category, status, primary_contact_email, legal_rep_full_name, legal_rep_id_number_enc, beneficial_owner_full_name, beneficial_owner_id_number_enc, created_at, personal_data_erased_at"
      )
      .eq("id", supplierId)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();

    if (!supplier) return new NextResponse("Proveedor no encontrado.", { status: 404 });

    const { data: requirements } = await supabase
      .from("supplier_requirements")
      .select("is_mandatory, document_types(name)")
      .eq("supplier_id", supplierId);

    const { data: documents } = await supabase
      .from("documents")
      .select(
        "id, status, issue_date, expiry_date, size_bytes, mime_type, created_at, document_types(name), document_versions(version_no, created_at)"
      )
      .eq("supplier_id", supplierId);

    const { data: invitations } = await supabase
      .from("invitations")
      .select("email, expires_at, used_at, created_at")
      .eq("supplier_id", supplierId);

    let legalRepIdNumber: string | null = null;
    let beneficialOwnerIdNumber: string | null = null;
    try {
      if (supplier.legal_rep_id_number_enc) legalRepIdNumber = decryptField(supplier.legal_rep_id_number_enc);
      if (supplier.beneficial_owner_id_number_enc) {
        beneficialOwnerIdNumber = decryptField(supplier.beneficial_owner_id_number_enc);
      }
    } catch (err) {
      console.error("export decryptField failed", { supplierId, name: (err as Error).name });
    }

    const payload = {
      exported_at: new Date().toISOString(),
      supplier: {
        id: supplier.id,
        legal_name: supplier.legal_name,
        nit: supplier.nit,
        category: supplier.category,
        status: supplier.status,
        primary_contact_email: supplier.primary_contact_email,
        legal_rep_full_name: supplier.legal_rep_full_name,
        legal_rep_id_number: legalRepIdNumber,
        beneficial_owner_full_name: supplier.beneficial_owner_full_name,
        beneficial_owner_id_number: beneficialOwnerIdNumber,
        created_at: supplier.created_at,
        personal_data_erased_at: supplier.personal_data_erased_at,
      },
      requirements: (requirements ?? []).map((r) => ({
        document_type: (r.document_types as unknown as { name: string } | null)?.name ?? null,
        is_mandatory: r.is_mandatory,
      })),
      documents: (documents ?? []).map((d) => ({
        id: d.id,
        document_type: (d.document_types as unknown as { name: string } | null)?.name ?? null,
        status: d.status,
        issue_date: d.issue_date,
        expiry_date: d.expiry_date,
        size_bytes: d.size_bytes,
        mime_type: d.mime_type,
        created_at: d.created_at,
        versions: d.document_versions,
      })),
      invitations: invitations ?? [],
    };

    await logAudit(supabase, {
      organizationId: membership.organizationId,
      actorId: user.id,
      action: "supplier.data_export",
      entityType: "supplier",
      entityId: supplierId,
    });

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="export-${supplierId}.json"`,
      },
    });
  } catch (err) {
    console.error("GET /api/suppliers/[id]/export failed", { name: (err as Error).name });
    return new NextResponse("No se pudo procesar la solicitud.", { status: 500 });
  }
}
