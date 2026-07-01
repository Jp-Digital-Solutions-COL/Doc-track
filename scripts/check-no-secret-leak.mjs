#!/usr/bin/env node
// Falla si el nombre de la variable SUPABASE_SERVICE_ROLE_KEY aparece en un
// archivo "use client", o si el nombre (o su valor real, cuando está
// disponible en el entorno) aparece en el bundle que Next.js sirve al
// navegador (.next, sin cache). Correr DESPUÉS de `next build`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN_NAME = "SUPABASE_SERVICE_ROLE";
const secretValue = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function walk(dir, exclude = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (exclude.includes(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exclude));
    else out.push(full);
  }
  return out;
}

let failed = false;

// 1. Ningún componente cliente debe referenciar el nombre de la env var.
const sourceFiles = [...walk("app"), ...walk("components")].filter((f) =>
  /\.(t|j)sx?$/.test(f)
);

for (const file of sourceFiles) {
  const content = readFileSync(file, "utf8");
  const isClientFile = /^\s*["']use client["']/m.test(content);
  if (isClientFile && content.includes(FORBIDDEN_NAME)) {
    console.error(`✗ ${file}: archivo "use client" referencia ${FORBIDDEN_NAME}`);
    failed = true;
  }
}

// 2. El bundle CLIENTE (.next/static) es lo único que llega al navegador.
const clientFiles = walk(join(".next", "static"));
// El resto del build (server): el NOMBRE puede aparecer (runtime), pero el
// VALOR real nunca debe quedar incrustado.
const serverFiles = walk(".next", ["cache", "static"]);

if (clientFiles.length === 0 && serverFiles.length === 0) {
  console.error("✗ No existe .next — corre `npm run build` antes de este check.");
  process.exit(1);
}

for (const file of clientFiles) {
  const content = readFileSync(file, "utf8");
  if (content.includes(FORBIDDEN_NAME)) {
    console.error(`✗ ${file}: el bundle CLIENTE contiene la cadena "${FORBIDDEN_NAME}"`);
    failed = true;
  }
  if (secretValue && content.includes(secretValue)) {
    console.error(`✗ ${file}: el bundle CLIENTE contiene el valor real del service_role`);
    failed = true;
  }
}

for (const file of serverFiles) {
  const content = readFileSync(file, "utf8");
  if (secretValue && content.includes(secretValue)) {
    console.error(`✗ ${file}: el valor real del service_role quedó incrustado en el build del server (debe leerse de process.env en runtime)`);
    failed = true;
  }
}
