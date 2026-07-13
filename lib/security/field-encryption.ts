import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cifrado app-level de campos ultra-sensibles (nº de cédula del
// representante legal / beneficiario final). La clave NUNCA vive en la BD:
// solo en variables de entorno del server (locales en .env.local, de
// producción como secret de Cloudflare). AES-256-GCM vía node:crypto —
// requiere el flag nodejs_compat activado (ver wrangler.jsonc) — nada que
// instalar, nada que enviar a Postgres como parámetro de una función SQL
// (evita que la clave o el dato en claro terminen en
// pg_stat_statements/logs de query).
//
// Formato versionado para poder rotar la clave sin perder acceso a datos
// viejos: "v<version>.<iv_b64>.<authTag_b64>.<ciphertext_b64>".
//
// FIELD_ENCRYPTION_KEYS="1:<base64 32 bytes>,2:<base64 32 bytes>"
// FIELD_ENCRYPTION_ACTIVE_VERSION="2"   <- versión usada para NUEVOS cifrados

let keysByVersion: Map<string, Buffer> | null = null;

function loadKeys(): Map<string, Buffer> {
  if (keysByVersion) return keysByVersion;

  const raw = process.env.FIELD_ENCRYPTION_KEYS ?? "";
  const map = new Map<string, Buffer>();
  for (const entry of raw.split(",").map((e) => e.trim()).filter(Boolean)) {
    const [version, base64Key] = entry.split(":");
    const key = Buffer.from(base64Key ?? "", "base64");
    if (!version || key.length !== 32) {
      throw new Error(`FIELD_ENCRYPTION_KEYS: entrada inválida para versión "${version}" (se esperaban 32 bytes en base64)`);
    }
    map.set(version, key);
  }
  keysByVersion = map;
  return map;
}

function getKey(version: string): Buffer {
  const key = loadKeys().get(version);
  if (!key) throw new Error(`No hay clave de cifrado configurada para la versión "${version}"`);
  return key;
}

function getActiveVersion(): string {
  const version = process.env.FIELD_ENCRYPTION_ACTIVE_VERSION;
  if (!version) throw new Error("Falta FIELD_ENCRYPTION_ACTIVE_VERSION");
  return version;
}

export function encryptField(plaintext: string): string {
  const version = getActiveVersion();
  const key = getKey(version);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v${version}.${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptField(stored: string): string {
  const match = /^v([^.]+)\.([^.]+)\.([^.]+)\.([^.]+)$/.exec(stored);
  if (!match) throw new Error("Formato de valor cifrado inválido");
  const [, version, ivB64, authTagB64, ciphertextB64] = match;

  const key = getKey(version);
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
