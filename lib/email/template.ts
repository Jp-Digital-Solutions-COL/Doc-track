// Sin "import 'server-only'": ese guard rompe bajo el test runner de Node
// (node --experimental-strip-types), que este módulo debe poder correr
// directamente. sendInvitationEmail/sendOrgAdminInvitationEmail/sendAlertEmail
// (los únicos llamadores) ya tienen su propio "server-only", así que el
// límite server-only sigue existiendo en la práctica.
import { contrastingTextColor, DEFAULT_BRAND_COLOR } from "../branding/derive-palette.ts";

// Los clientes de correo no soportan color-mix() ni variables CSS, así que
// acá el color final se resuelve en JS (a diferencia de BrandStyle, que usa
// CSS nativo para /app y /portal) y se escribe como hex inline.
export function brandButtonHtml(params: { href: string; label: string; brandColor: string | null }): string {
  const color = params.brandColor ?? DEFAULT_BRAND_COLOR;
  const textColor = contrastingTextColor(color);
  return `<a href="${params.href}" style="display:inline-block;padding:10px 20px;background:${color};color:${textColor};text-decoration:none;border-radius:6px;font-weight:600;">${params.label}</a>`;
}

// Sin logoUrl no se muestra NINGÚN logo (ni el de Doc-Track) — mostrar el
// logo de Doc-Track en el correo de una organización sin marca propia daría
// la falsa impresión de que el correo viene de Doc-Track y no de esa
// organización.
export function renderEmailHtml(params: { logoUrl: string | null; bodyHtml: string }): string {
  const logoBlock = params.logoUrl
    ? `<img src="${params.logoUrl}" alt="" height="40" style="display:block;margin-bottom:16px;" />`
    : "";
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">${logoBlock}<div style="color:#111827;font-size:14px;line-height:1.6;">${params.bodyHtml}</div></div>`;
}
