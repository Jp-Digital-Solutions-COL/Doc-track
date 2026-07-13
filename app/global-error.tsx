"use client";

// Solo se dispara si el error ocurre en el layout raíz mismo (rarísimo) —
// por eso debe traer su propio <html>/<body>. Mismo principio que error.tsx:
// jamás mostrar error.message/stack, solo texto fijo.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "2rem", textAlign: "center" }}>
          <h1>Algo salió mal</h1>
          <p>Ocurrió un error inesperado. Intenta de nuevo — si persiste, contacta a soporte.</p>
          <button onClick={() => reset()}>Reintentar</button>
        </div>
      </body>
    </html>
  );
}
