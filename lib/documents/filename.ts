// Nombre de archivo amigable para el Content-Disposition — nunca el nombre
// original que subió el usuario (no se guarda en ningún lado), solo el
// nombre del tipo de documento + la extensión real detectada por magic bytes.
export function slugifyFilename(name: string, ext: string) {
  const slug =
    name
      .normalize("NFD")
      .replace(new RegExp("[̀-ͯ]", "g"), "") // quita acentos (marcas diacríticas combinantes)
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "documento";

  return `${slug}.${ext}`;
}
