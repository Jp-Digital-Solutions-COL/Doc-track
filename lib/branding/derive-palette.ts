// Deriva variables CSS y color de texto legible a partir de UN solo color de
// marca (hex) — evita que el superadmin tenga que elegir una paleta entera
// y termine con combinaciones de bajo contraste. Los tonos derivados
// (fondos suaves, hover) usan color-mix() nativo de CSS, sin dependencias.

export const DEFAULT_BRAND_COLOR = "#006adc"; // azul de marca de Doc-Track (ver app/globals.css)

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Luminancia relativa WCAG — https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Compara el contraste del color contra blanco y negro (fórmula de
// contraste WCAG) y devuelve el que dé mejor legibilidad — más confiable
// que un umbral fijo de luminancia, que falla en colores intermedios.
export function contrastingTextColor(hex: string): "#ffffff" | "#000000" {
  const luminance = relativeLuminance(hex);
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  return contrastWithWhite >= contrastWithBlack ? "#ffffff" : "#000000";
}

export type BrandCssVars = {
  "--primary": string;
  "--primary-foreground": string;
  "--ring": string;
  "--sidebar-primary": string;
  "--sidebar-primary-foreground": string;
  "--accent": string;
  "--accent-foreground": string;
  "--sidebar-accent": string;
  "--sidebar-accent-foreground": string;
};

export function derivePalette(hex: string): BrandCssVars {
  const foreground = contrastingTextColor(hex);
  return {
    "--primary": hex,
    "--primary-foreground": foreground,
    "--ring": `color-mix(in srgb, ${hex} 45%, transparent)`,
    "--sidebar-primary": hex,
    "--sidebar-primary-foreground": foreground,
    "--accent": `color-mix(in srgb, ${hex} 15%, white)`,
    "--accent-foreground": hex,
    "--sidebar-accent": `color-mix(in srgb, ${hex} 15%, white)`,
    "--sidebar-accent-foreground": hex,
  };
}
