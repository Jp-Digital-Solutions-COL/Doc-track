// lib/email/render-blocks.ts
// Renderer puro de bloques a HTML de correo — sin acceso a red/DB, sin
// "server-only" (a diferencia del resto de lib/email/*, este módulo debe
// poder importarse también desde el client component del editor para
// generar el preview en vivo sin ida y vuelta al servidor).
import { brandButtonHtml } from "./template.ts";
import type { EmailBlock } from "./blocks.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Sustitución de texto plano — nunca interpreta HTML. Un token sin valor
// (undefined/"") se reemplaza por cadena vacía y se loguea, nunca lanza:
// un dato faltante en un solo correo no debe tumbar el envío completo.
export function substituteVariables(text: string, variables: Record<string, string | undefined>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined || value === "") {
      console.warn("email variable sin valor", { name });
      return "";
    }
    return value;
  });
}

export function renderBlocks(
  blocks: EmailBlock[],
  variables: Record<string, string | undefined>,
  brandColor: string | null
): string {
  return blocks
    .map((block) => {
      if (block.type === "text") {
        const substituted = substituteVariables(block.text, variables);
        return `<p>${escapeHtml(substituted).replace(/\n/g, "<br />")}</p>`;
      }
      if (block.type === "image") {
        return `<img src="${block.url}" alt="${escapeHtml(block.alt)}" style="display:block;max-width:100%;margin:12px 0;" />`;
      }
      if (block.type === "button") {
        const href = variables[block.hrefVar];
        // Nunca se emite <a href="">: un botón sin destino resuelto se omite.
        if (!href) return "";
        return `<p>${brandButtonHtml({ href, label: block.label, brandColor })}</p>`;
      }
      return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />`;
    })
    .filter((html) => html !== "")
    .join("\n");
}
