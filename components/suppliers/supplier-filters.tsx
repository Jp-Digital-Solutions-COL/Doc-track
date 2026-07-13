"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SUPPLIER_STATUS_LABEL } from "@/lib/labels";

const STATUSES = ["pendiente", "en_revision", "activo", "rechazado", "vencido"] as const;

export function SupplierFilters({ initialQ, initialStatus }: { initialQ: string; initialStatus: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);
  const [, startTransition] = useTransition();

  // Filtra mientras escribís, sin botón "Filtrar" — con un debounce corto
  // para no navegar en cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const query = params.toString();
      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname);
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status]);

  const hasFilters = Boolean(q || status);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Input
        placeholder="Buscar por razón social o NIT"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-xs"
      />
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
      >
        <option value="">Todos los estados</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {SUPPLIER_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            setStatus("");
            router.push(pathname);
          }}
        >
          Limpiar filtros
        </Button>
      ) : null}
    </div>
  );
}
