"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PLACEHOLDER_YEAR = 2024; // bisiesto, para poder representar 29 feb; el año se descarta al guardar

function toDateInputValue(month: number, day: number) {
  return `${PLACEHOLDER_YEAR}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function ValidityFields({
  defaultDays,
  defaultMonth,
  defaultDay,
}: {
  defaultDays?: number | null;
  defaultMonth?: number | null;
  defaultDay?: number | null;
}) {
  const [mode, setMode] = useState<"days" | "fixed_date">(defaultMonth && defaultDay ? "fixed_date" : "days");

  return (
    <div className="space-y-2">
      <Label>Vigencia por defecto</Label>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="validity_mode"
            value="days"
            checked={mode === "days"}
            onChange={() => setMode("days")}
          />
          Días desde expedición
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="validity_mode"
            value="fixed_date"
            checked={mode === "fixed_date"}
            onChange={() => setMode("fixed_date")}
          />
          Fecha fija cada año
        </label>
      </div>

      {mode === "days" ? (
        <>
          <Input
            key="days"
            name="default_validity_days"
            type="number"
            min={1}
            placeholder="Ej. 30"
            defaultValue={defaultDays ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            Si marcaste vencimiento y el proveedor no indica una fecha, se calcula sumando estos días a la fecha de
            expedición.
          </p>
        </>
      ) : (
        <>
          <Input
            key="fixed_date"
            name="default_validity_fixed_date"
            type="date"
            defaultValue={defaultMonth && defaultDay ? toDateInputValue(defaultMonth, defaultDay) : undefined}
          />
          <p className="text-xs text-muted-foreground">
            Solo se usan el mes y el día — el año que elijas no importa. Ej. cada 1 de enero, cada 30 de abril. Si el
            proveedor no indica una fecha, se usa la próxima ocurrencia de esta fecha después de la expedición.
          </p>
        </>
      )}
    </div>
  );
}
