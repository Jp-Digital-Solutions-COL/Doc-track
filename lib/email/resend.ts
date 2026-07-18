import "server-only";
import { sendEmail } from "@/lib/email/send";
import { renderEmailHtml, brandButtonHtml } from "@/lib/email/template";

type Branding = { logoUrl: string | null; brandColor: string | null };

export async function sendInvitationEmail(params: {
  to: string;
  inviteUrl: string;
  organizationName: string;
  branding: Branding;
}) {
  await sendEmail({
    to: params.to,
    subject: `Invitación de ${params.organizationName} — Gestión Documental`,
    html: renderEmailHtml({
      logoUrl: params.branding.logoUrl,
      bodyHtml: `
        <p>${params.organizationName} te invitó a cargar tus documentos como proveedor.</p>
        <p>${brandButtonHtml({ href: params.inviteUrl, label: "Aceptar invitación", brandColor: params.branding.brandColor })}</p>
        <p>Este enlace expira en 72 horas y solo puede usarse una vez.</p>
      `,
    }),
  });
}

export async function sendOrgAdminInvitationEmail(params: {
  to: string;
  inviteUrl: string;
  organizationName: string;
  role: "owner" | "admin";
  branding: Branding;
}) {
  await sendEmail({
    to: params.to,
    subject: `Invitación como ${params.role} de ${params.organizationName} — Gestión Documental`,
    html: renderEmailHtml({
      logoUrl: params.branding.logoUrl,
      bodyHtml: `
        <p>Fuiste invitado a administrar <strong>${params.organizationName}</strong> como ${params.role} en Gestión Documental.</p>
        <p>${brandButtonHtml({ href: params.inviteUrl, label: "Aceptar invitación", brandColor: params.branding.brandColor })}</p>
        <p>Este enlace expira en 72 horas y solo puede usarse una vez.</p>
      `,
    }),
  });
}
