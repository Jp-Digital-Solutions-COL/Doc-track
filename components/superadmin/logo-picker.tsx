"use client";

import Image from "next/image";
import { useId, useState } from "react";

export function LogoPicker({ currentLogoUrl }: { currentLogoUrl: string | null }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl);
  const inputId = useId();

  return (
    <div className="flex items-center gap-3">
      {previewUrl ? (
        <Image
          src={previewUrl}
          alt="Logo"
          width={48}
          height={48}
          className="size-12 shrink-0 rounded-lg border border-border object-contain"
        />
      ) : (
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
          Sin logo
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor={inputId} className="text-sm font-medium">
          Logo (PNG o JPG, máx. 2MB)
        </label>
        <input
          id={inputId}
          name="logo"
          type="file"
          accept=".png,.jpg,.jpeg"
          className="block text-sm text-muted-foreground"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPreviewUrl(URL.createObjectURL(file));
          }}
        />
      </div>
    </div>
  );
}
