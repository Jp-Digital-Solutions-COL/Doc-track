"use client";

import { useId, useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_BYTES = 15 * 1024 * 1024;

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  function acceptFile(next: File | undefined) {
    if (!next) return;
    if (next.size > MAX_BYTES) {
      setError("El archivo supera el máximo de 15MB.");
      setFile(null);
      return;
    }
    setError(null);
    setFile(next);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={inputId}
        name="file"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        required
        className="sr-only"
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />

      {file ? (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
          <FileText className="size-8 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Quitar archivo"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped && inputRef.current) {
              const transfer = new DataTransfer();
              transfer.items.add(dropped);
              inputRef.current.files = transfer.files;
            }
            acceptFile(dropped);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-input hover:border-primary/50 hover:bg-muted/30"
          )}
        >
          <UploadCloud className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">Arrastra tu archivo aquí o haz clic para seleccionar</p>
          <p className="text-xs text-muted-foreground">PDF, JPG o PNG — máx. 15MB</p>
        </label>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
