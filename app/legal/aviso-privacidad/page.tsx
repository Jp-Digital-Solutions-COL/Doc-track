import Link from "next/link";
import { CURRENT_POLICY_VERSION } from "@/lib/legal/policy";

// PLANTILLA — este texto NO es asesoría legal. Debe ser revisado y
// completado por un abogado antes de lanzar a producción.
export default function PrivacyNoticePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8 text-sm leading-relaxed">
      <h1 className="text-xl font-semibold">Aviso de Privacidad</h1>
      <p className="text-xs text-muted-foreground">
        Versión {CURRENT_POLICY_VERSION} — [FECHA DE ÚLTIMA ACTUALIZACIÓN]
      </p>
      <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
        Plantilla de referencia conforme a la Ley 1581 de 2012 (Colombia). Debe ser completada y validada por un
        abogado antes de publicarse en producción.
      </p>

      <h2 className="font-semibold">Responsable</h2>
      <p>[RAZÓN SOCIAL DE LA EMPRESA], NIT [NIT], domicilio en [DIRECCIÓN].</p>

      <h2 className="font-semibold">Tratamiento y finalidad</h2>
      <p>
        Sus datos serán tratados conforme a nuestra{" "}
        <Link href="/legal/politica-tratamiento-datos" className="underline">
          Política de Tratamiento de Datos
        </Link>
        , con la finalidad de [FINALIDAD RESUMIDA].
      </p>

      <h2 className="font-semibold">Derechos que puede ejercer</h2>
      <p>
        Conocer, actualizar, rectificar y suprimir sus datos, así como revocar la autorización otorgada, a través del{" "}
        <Link href="/legal/solicitud-titular" className="underline">
          formulario de solicitud de derechos del titular
        </Link>
        .
      </p>

      <h2 className="font-semibold">Área o persona responsable de atender solicitudes</h2>
      <p>[NOMBRE / ÁREA], correo [CORREO DE CONTACTO], teléfono [TELÉFONO].</p>
    </div>
  );
}
