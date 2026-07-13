import "server-only";
import { sendEmail } from "@/lib/email/send";

export async function sendInvitationEmail(params: {
  to: string;
  inviteUrl: string;
  organizationName: string;
}) {
  await sendEmail({
    to: params.to,
    subject: `Invitación de ${params.organizationName} — Gestión Documental`,
    html: `
      <p>${params.organizationName} te invitó a cargar tus documentos como proveedor.</p>
      <p><a href="${params.inviteUrl}">Aceptar invitación</a></p>
      <p>Este enlace expira en 72 horas y solo puede usarse una vez.</p>
    `,
  });
}

export async function sendOrgAdminInvitationEmail(params: {
  to: string;
  inviteUrl: string;
  organizationName: string;
  role: "owner" | "admin";
}) {
  await sendEmail({
    to: params.to,
    subject: `Invitación como ${params.role} de ${params.organizationName} — Gestión Documental`,
    html: `
      <p>Fuiste invitado a administrar <strong>${params.organizationName}</strong> como ${params.role} en Gestión Documental.</p>
      <p><a href="${params.inviteUrl}">Aceptar invitación</a></p>
      <p>Este enlace expira en 72 horas y solo puede usarse una vez.</p>
    `,
  });
}
