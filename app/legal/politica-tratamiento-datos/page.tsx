import { CURRENT_POLICY_VERSION } from "@/lib/legal/policy";

// PLANTILLA — este texto NO es asesoría legal. Debe ser revisado y
// completado por un abogado antes de lanzar a producción. Los placeholders
// [ENTRE CORCHETES] son los puntos que faltan llenar con datos reales de la
// empresa (razón social, NIT, domicilio, canal de atención, etc).
export default function DataProcessingPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8 text-sm leading-relaxed">
      <h1 className="text-xl font-semibold">Política de Tratamiento de Datos Personales</h1>
      <p className="text-xs text-muted-foreground">
        Versión {CURRENT_POLICY_VERSION} — [FECHA DE ÚLTIMA ACTUALIZACIÓN]
      </p>
      <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
        Plantilla de referencia conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013 (Colombia). Debe ser
        completada y validada por un abogado antes de publicarse en producción.
      </p>

      <h2 className="font-semibold">1. Responsable del tratamiento</h2>
      <p>
        [RAZÓN SOCIAL DE LA EMPRESA], identificada con NIT [NIT], con domicilio en [DIRECCIÓN], correo de contacto
        [CORREO DE CONTACTO PARA TEMAS DE DATOS PERSONALES], en calidad de Responsable del Tratamiento de Datos
        Personales.
      </p>

      <h2 className="font-semibold">2. Finalidad del tratamiento</h2>
      <p>
        Los datos personales recolectados a través de esta plataforma (incluyendo, sin limitarse a, datos de
        identificación del representante legal y del beneficiario final de los proveedores) serán tratados con las
        siguientes finalidades: [DESCRIBIR FINALIDADES ESPECÍFICAS — gestión documental de proveedores, verificación
        de cumplimiento contractual, prevención de lavado de activos y financiación del terrorismo (SAGRILAFT),
        comunicaciones relacionadas con el servicio].
      </p>

      <h2 className="font-semibold">3. Derechos del titular</h2>
      <p>
        De acuerdo con la Ley 1581 de 2012, usted tiene derecho a conocer, actualizar, rectificar y suprimir sus
        datos personales, así como a revocar la autorización otorgada. Puede ejercer estos derechos a través de
        [CANAL DE CONTACTO — ver formulario de solicitud disponible en esta plataforma].
      </p>

      <h2 className="font-semibold">4. Transferencia y transmisión de datos</h2>
      <p>
        [DESCRIBIR SI HAY TRANSFERENCIA INTERNACIONAL DE DATOS — p.ej. si la infraestructura de almacenamiento está
        fuera de Colombia, indicar el país y el mecanismo de protección aplicable].
      </p>

      <h2 className="font-semibold">5. Seguridad de la información</h2>
      <p>
        [DESCRIBIR MEDIDAS TÉCNICAS Y ORGANIZATIVAS — cifrado en tránsito y en reposo, control de acceso basado en
        roles, registro de auditoría, etc].
      </p>

      <h2 className="font-semibold">6. Vigencia</h2>
      <p>
        Esta política rige a partir de [FECHA] y permanecerá vigente mientras subsista la finalidad del tratamiento
        y/o exista una obligación legal o contractual de conservar los datos.
      </p>
    </div>
  );
}
