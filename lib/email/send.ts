import "server-only";
import { Resend } from "resend";

// Envío genérico compartido por invitaciones y alertas — un solo lugar con
// el fallback de dev (sin RESEND_API_KEY, se imprime en consola en vez de
// enviar) para no duplicar esa lógica en cada tipo de correo.
export async function sendEmail(params: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV !== "development") {
      throw new Error("RESEND_API_KEY no está configurada.");
    }
    // ponytail: solo en dev, sin cuenta de Resend configurada, no hay forma
    // de "recibir" el correo — se imprime para poder probar el flujo
    // localmente. Nunca ocurre en producción: ahí RESEND_API_KEY es
    // obligatoria y esta rama nunca se alcanza. Los links (href="...") se
    // extraen aparte porque son lo único que realmente hace falta para
    // seguir el flujo a mano — el resto del HTML no importa en consola.
    const links = [...params.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    console.log(
      `\n[dev] Email para ${params.to}: ${params.subject}` +
        (links.length ? `\n  Link: ${links.join("\n  Link: ")}` : "") +
        "\n"
    );
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    throw new Error(`No se pudo enviar el correo: ${error.message}`);
  }
}
