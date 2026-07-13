import { redirect } from "next/navigation";

// Herramienta interna B2B, sin landing pública todavía — la raíz solo manda
// a /login (si ya hay sesión, el propio middleware la rebota a /app).
export default function Home() {
  redirect("/login");
}
