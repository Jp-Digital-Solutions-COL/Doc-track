"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";

export function DangerZone({
  action,
  supplierId,
  retentionYears,
}: {
  action: (formData: FormData) => void;
  supplierId: string;
  retentionYears: number;
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-5 shrink-0 text-destructive" />
        <div className="flex-1">
          <p className="text-sm font-medium text-destructive">Zona de riesgo</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Anonimiza el correo de contacto y los datos del representante legal/beneficiario final. Los documentos
            fuera del plazo de retención legal ({retentionYears} años) se borran junto con sus archivos; los que aún
            estén dentro del plazo se conservan. Esta acción no se puede deshacer.
          </p>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button type="button" variant="destructive" size="sm" className="mt-3">
                  Borrar datos personales
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogTitle>¿Borrar datos personales de este proveedor?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción anonimiza el correo de contacto, el representante legal y el beneficiario final, y borra
                los documentos que ya salieron del plazo de retención legal ({retentionYears} años). No se puede
                deshacer.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogClose
                  render={
                    <Button type="button" variant="outline">
                      Cancelar
                    </Button>
                  }
                />
                <form action={action}>
                  <input type="hidden" name="supplierId" value={supplierId} />
                  <Button type="submit" variant="destructive">
                    Sí, borrar definitivamente
                  </Button>
                </form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
