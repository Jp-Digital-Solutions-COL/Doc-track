// lib/email/template-schema.ts
// Validación server-side independiente del formulario: saveEmailTemplate
// puede invocarse directamente (sin pasar por el editor), así que el
// formulario nunca es el único punto de validación (ver sección 2 del
// spec). zod es la herramienta correcta para un array anidado de variantes
// por "type" sin reinventar un validador a mano.
import { z } from "zod";
import { ALLOWED_VARIABLES_BY_TYPE, BUTTON_HREF_VAR_BY_TYPE, BLOCK_LIMITS, type EmailType } from "./blocks.ts";

function containsOnlyAllowedTokens(text: string, allowed: string[]): boolean {
  const tokens = [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  return tokens.every((t) => allowed.includes(t));
}

export function buildBlocksSchema(emailType: EmailType, organizationId: string) {
  const allowedVariables = ALLOWED_VARIABLES_BY_TYPE[emailType];
  const allowedHrefVar = BUTTON_HREF_VAR_BY_TYPE[emailType];
  // Mismo formato de URL pública que devuelve supabase.storage.getPublicUrl()
  // — ver uploadEmailImage() en lib/actions/email-templates.ts.
  const expectedAssetPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"}/storage/v1/object/public/email-assets/${organizationId}/`;

  const textBlock = z.object({
    id: z.string(),
    type: z.literal("text"),
    text: z
      .string()
      .min(1)
      .max(BLOCK_LIMITS.maxTextLength)
      .refine((t) => containsOnlyAllowedTokens(t, allowedVariables), "Variable no permitida para este tipo de correo."),
  });

  const imageBlock = z.object({
    id: z.string(),
    type: z.literal("image"),
    url: z.string().refine((u) => {
      // Parse-then-compare on the normalized pathname, not a raw substring
      // match on the unparsed string: a raw .startsWith() is bypassable via
      // "../" path traversal (the string starts with our prefix but a URL
      // consumer resolves it into a different org's folder).
      let parsed: URL;
      try {
        parsed = new URL(u);
      } catch {
        return false;
      }
      const expected = new URL(expectedAssetPrefix);
      return parsed.origin === expected.origin && parsed.pathname.startsWith(expected.pathname);
    }, "La imagen debe pertenecer a esta organización."),
    alt: z.string().max(BLOCK_LIMITS.maxAltLength),
  });

  const buttonBlock = z.object({
    id: z.string(),
    type: z.literal("button"),
    label: z.string().min(1).max(BLOCK_LIMITS.maxButtonLabelLength),
    hrefVar: z.literal(allowedHrefVar),
  });

  const dividerBlock = z.object({ id: z.string(), type: z.literal("divider") });

  return z.object({
    subject: z
      .string()
      .min(1)
      .max(BLOCK_LIMITS.maxSubjectLength)
      .refine((t) => containsOnlyAllowedTokens(t, allowedVariables), "Variable no permitida en el asunto."),
    blocks: z
      .array(z.discriminatedUnion("type", [textBlock, imageBlock, buttonBlock, dividerBlock]))
      .min(1)
      .max(BLOCK_LIMITS.maxBlocks),
  });
}
