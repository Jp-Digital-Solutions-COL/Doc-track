"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revealSupplierIdentity } from "@/lib/actions/supplier-identity";

export function RevealIdentityButton({
  supplierId,
  field,
}: {
  supplierId: string;
  field: "legal_rep" | "beneficial_owner";
}) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (value) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <code>{value}</code>
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setValue(null)}
        >
          Ocultar
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await revealSupplierIdentity(supplierId, field);
            if ("error" in result) setError(result.error);
            else setValue(result.idNumber);
          })
        }
      >
        {pending ? "Descifrando..." : "Ver número"}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
