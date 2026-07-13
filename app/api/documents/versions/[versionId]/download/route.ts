import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { logAudit } from "@/lib/actions/audit";
import { slugifyFilename } from "@/lib/documents/filename";
import { serveSignedDownload } from "@/lib/documents/serve-download";
import { checkRateLimit } from "@/lib/security/rate-limit";

// Descarga una versión HISTÓRICA puntual (no necesariamente la vigente) —
// para eso está /api/documents/[id]/download. Mismo patrón de seguridad:
// RLS ya acota qué versiones puede leer este usuario (document_versions
// tiene sus propias policies is_member_of/is_supplier_user_of).
export async function GET(_request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const { versionId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse("No autorizado.", { status: 401 });
    }

    const { success: withinDownloadLimit } = await checkRateLimit("download", `user:${user.id}`);
    if (!withinDownloadLimit) {
      return new NextResponse("Demasiadas descargas. Intenta de nuevo en un minuto.", { status: 429 });
    }

    const { data: version } = await supabase
      .from("document_versions")
      .select("id, organization_id, version_no, storage_path, documents(mime_type, document_types(name))")
      .eq("id", versionId)
      .maybeSingle();

    if (!version) {
      return new NextResponse("Versión no encontrada.", { status: 404 });
    }

    const document = version.documents as unknown as {
      mime_type: string;
      document_types: { name: string } | null;
    } | null;

    const typeName = document?.document_types?.name ?? "documento";
    const ext = version.storage_path.split(".").pop() ?? "bin";
    const filename = slugifyFilename(`${typeName}_v${version.version_no}`, ext);

    const response = await serveSignedDownload(supabase, {
      storagePath: version.storage_path,
      mimeType: document?.mime_type ?? "application/octet-stream",
      filename,
    });

    if (response.status !== 200) return response;

    const membership = await getCurrentMembership(supabase, user.id);
    await logAudit(supabase, {
      organizationId: version.organization_id,
      actorId: user.id,
      actorType: membership ? "user" : "supplier",
      action: "download",
      entityType: "document_version",
      entityId: version.id,
    });

    return response;
  } catch (err) {
    console.error("GET /api/documents/versions/[versionId]/download failed", { name: (err as Error).name });
    return new NextResponse("No se pudo procesar la solicitud.", { status: 500 });
  }
}
