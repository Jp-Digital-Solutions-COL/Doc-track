"use client";

import { Button } from "@/components/ui/button";

// A propósito NUNCA se renderiza `error.message` ni `error.stack` — Next.js
// ya los redacta en producción (verificado: solo llega un `digest` opaco),
// pero esta página tampoco debe depender de eso. Un mensaje genérico fijo,
// nada más.
export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Algo salió mal</h1>
      <p className="text-sm text-muted-foreground">
        Ocurrió un error inesperado. Intenta de nuevo — si persiste, contacta a soporte.
      </p>
      <Button onClick={() => reset()}>Reintentar</Button>
    </div>
  );
}
