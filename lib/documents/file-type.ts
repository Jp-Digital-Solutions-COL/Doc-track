// Detección de tipo real por magic bytes — nunca por extensión ni por el
// Content-Type que mande el navegador (CLAUDE.md regla 7). Solo cubre los
// 3 formatos permitidos por el bucket (pdf, jpg, png); cualquier otra cosa
// es null y se rechaza.

export type DetectedFile = { mime: "application/pdf" | "image/jpeg" | "image/png"; ext: "pdf" | "jpg" | "png" };

function startsWith(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

export function detectFileType(bytes: Uint8Array): DetectedFile | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    // %PDF-
    return { mime: "application/pdf", ext: "pdf" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", ext: "png" };
  }
  return null;
}
