import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { logAudit } from "@/lib/actions/audit";
import { slugifyFilename } from "@/lib/documents/filename";
import { serveSignedDownload } from "@/lib/documents/serve-download";
import { checkRateLimit } from "@/lib/security/rate-limit";

// Descarga la versión VIGENTE (documents.storage_path siempre apunta a la
// última). Para una versión histórica puntual, ver
// /api/documents/versions/[versionId]/download.
//
// Nunca se generan signed URLs por adelantado en un listado — esta ruta es
// el ÚNICO lugar donde se crea una, y solo al pedir la descarga puntual.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Red de seguridad: cualquier excepción no prevista (p.ej. un fetch() que
  // falla a nivel de red) cae aquí en vez de dejar que Next.js sirva su
  // página de error genérica — que en Route Handlers no redacta stacks tan
  // agresivamente como en Server Actions/RSC.
  try {
    const { id: documentId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse("No autorizado.", { status: 401 });
    }

    // El middleware ya limita por IP en todo /api/documents; esto además
    // limita por usuario autenticado.
    const { success: withinDownloadLimit } = await checkRateLimit("download", `user:${user.id}`);
    if (!withinDownloadLimit) {
      return new NextResponse("Demasiadas descargas. Intenta de nuevo en un minuto.", { status: 429 });
    }

    // La lectura ya está acotada por RLS (is_member_of del lado empresa,
    // is_supplier_user_of del lado proveedor) — si la fila no aparece, este
    // usuario no tiene por qué saber si existe o no (mismo 404 en ambos casos).
    const { data: document } = await supabase
      .from("documents")
      .select("id, organization_id, supplier_id, storage_path, mime_type, document_types(name)")
      .eq("id", documentId)
      .maybeSingle();

    if (!document) {
      return new NextResponse("Documento no encontrado.", { status: 404 });
    }

    const typeName = (document.document_types as unknown as { name: string } | null)?.name ?? "documento";
    const ext = document.storage_path.split(".").pop() ?? "bin";
    const filename = slugifyFilename(typeName, ext);

    const response = await serveSignedDownload(supabase, {
      storagePath: document.storage_path,
      mimeType: document.mime_type,
      filename,
    });

    if (response.status !== 200) return response;

    const membership = await getCurrentMembership(supabase, user.id);
    await logAudit(supabase, {
      organizationId: document.organization_id,
      actorId: user.id,
      actorType: membership ? "user" : "supplier",
      action: "download",
      entityType: "document",
      entityId: document.id,
    });

    return response;
  } catch (err) {
    console.error("GET /api/documents/[id]/download failed", { name: (err as Error).name });
    return new NextResponse("No se pudo procesar la solicitud.", { status: 500 });
  }
}
