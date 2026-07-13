"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToastManager } from "@/components/ui/toast";

// Puente entre el patrón existente de redirect(`...?saved=1`) de las Server
// Actions y el sistema de toasts — no cambia ninguna action, solo traduce
// las banderas que ya venían usando a un mensaje flotante en vez de texto
// fijo en la página.
const FLASH_MESSAGES: Record<string, { title: string; type?: string }> = {
  saved: { title: "Cambios guardados" },
  uploaded: { title: "Documento subido" },
  invited: { title: "Invitación enviada" },
  reviewed: { title: "Revisión registrada" },
  erased: { title: "Datos personales anonimizados" },
};

export function FlashToastBridge() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const toastManager = useToastManager();
  const rawParams = searchParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(rawParams);
    const error = params.get("error");
    const flashKeys = Object.keys(FLASH_MESSAGES).filter((key) => params.get(key));
    if (!error && flashKeys.length === 0) return;

    if (error) {
      toastManager.add({ title: error, type: "error" });
    }
    for (const key of flashKeys) {
      toastManager.add(FLASH_MESSAGES[key]);
    }

    params.delete("error");
    flashKeys.forEach((key) => params.delete(key));
    const qs = params.toString();
    // Un pequeño delay evita competir con la navegación que el propio
    // redirect() del Server Action todavía está asentando — llamar a
    // router.replace() en el mismo tick interrumpe esa transición y deja
    // la página en blanco un instante.
    const timer = setTimeout(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawParams]);

  return null;
}
