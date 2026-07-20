import "server-only";
import { sendEmail } from "@/lib/email/send";
import { renderEmailHtml } from "@/lib/email/template";
import { renderBlocks, substituteVariables } from "@/lib/email/render-blocks";
import { resolveEmailContent } from "@/lib/email/default-templates";
import type { EmailBlock } from "@/lib/email/blocks";

type Branding = { logoUrl: string | null; brandColor: string | null };
type TemplateOverride = { subject: string; blocks: EmailBlock[] } | null;

export async function sendInvitationEmail(params: {
  to: string;
  inviteUrl: string;
  organizationName: string;
  branding: Branding;
  templateOverride: TemplateOverride;
}) {
  const { subject, blocks } = resolveEmailContent("invite_supplier", params.templateOverride);
  const variables = { organizationName: params.organizationName, inviteUrl: params.inviteUrl };

  await sendEmail({
    to: params.to,
    // .replace(...) evita que una variable con salto de línea inyecte un
    // header de correo adicional en el subject.
    subject: substituteVariables(subject, variables).replace(/[\r\n]/g, " "),
    html: renderEmailHtml({
      logoUrl: params.branding.logoUrl,
      bodyHtml: renderBlocks(blocks, variables, params.branding.brandColor),
    }),
  });
}

export async function sendOrgAdminInvitationEmail(params: {
  to: string;
  inviteUrl: string;
  organizationName: string;
  role: "owner" | "admin";
  branding: Branding;
  templateOverride: TemplateOverride;
}) {
  const { subject, blocks } = resolveEmailContent("invite_org_admin", params.templateOverride);
  const variables = { organizationName: params.organizationName, role: params.role, inviteUrl: params.inviteUrl };

  await sendEmail({
    to: params.to,
    subject: substituteVariables(subject, variables).replace(/[\r\n]/g, " "),
    html: renderEmailHtml({
      logoUrl: params.branding.logoUrl,
      bodyHtml: renderBlocks(blocks, variables, params.branding.brandColor),
    }),
  });
}
