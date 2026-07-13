"use client";

import { useState } from "react";
import { deleteOrganization } from "@/lib/actions/superadmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteOrgConfirm({ organizationId, nit }: { organizationId: string; nit: string }) {
  const [confirmNit, setConfirmNit] = useState("");

  return (
    <details>
      <summary className="cursor-pointer text-sm text-destructive">Eliminar organización</summary>
      <form action={deleteOrganization} className="mt-2 space-y-2">
        <input type="hidden" name="organizationId" value={organizationId} />
        <p className="text-xs text-muted-foreground">
          Esto borra la organización y TODO lo asociado (miembros, proveedores, documentos, invitaciones) de forma
          permanente. Para confirmar, escribe el NIT exacto: <strong>{nit}</strong>
        </p>
        <div className="space-y-1">
          <Label htmlFor="confirmNit" className="text-xs">
            NIT
          </Label>
          <Input
            id="confirmNit"
            name="confirmNit"
            value={confirmNit}
            onChange={(e) => setConfirmNit(e.target.value)}
            className="text-xs"
          />
        </div>
        <Button type="submit" variant="destructive" size="sm" className="w-full" disabled={confirmNit !== nit}>
          Confirmar eliminación
        </Button>
      </form>
    </details>
  );
}
