import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const SIGNED_URL_TTL_SECONDS = 60;

// Genera la signed URL y la consume aquí mismo — nunca llega al navegador.
// Reenvía solo los bytes con el Content-Disposition que controlamos, no el
// que Storage pondría por defecto. Compartido entre "descargar la versión
// vigente" y "descargar una versión histórica puntual".
export async function serveSignedDownload(
  supabase: SupabaseClient,
  params: { storagePath: string; mimeType: string; filename: string }
) {
  const { data: signed, error: signError } = await supabase.storage
    .from("documentos")
    .createSignedUrl(params.storagePath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    return new NextResponse("No se pudo generar la descarga.", { status: 500 });
  }

  const fileResponse = await fetch(signed.signedUrl);
  if (!fileResponse.ok || !fileResponse.body) {
    return new NextResponse("No se pudo descargar el documento.", { status: 502 });
  }

  return new NextResponse(fileResponse.body, {
    status: 200,
    headers: {
      "Content-Type": params.mimeType,
      "Content-Disposition": `attachment; filename="${params.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
