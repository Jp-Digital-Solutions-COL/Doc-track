import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.FIELD_ENCRYPTION_KEYS = `1:${randomBytes(32).toString("base64")},2:${randomBytes(32).toString("base64")}`;
process.env.FIELD_ENCRYPTION_ACTIVE_VERSION = "2";

const { encryptField, decryptField } = await import("./field-encryption.ts");

test("cifra y descifra un valor de vuelta al original", () => {
  const ciphertext = encryptField("1234567890");
  assert.equal(decryptField(ciphertext), "1234567890");
});

test("dos cifrados del mismo valor producen ciphertexts distintos (IV aleatorio)", () => {
  assert.notEqual(encryptField("1234567890"), encryptField("1234567890"));
});

test("usa la versión activa de la clave para cifrar", () => {
  assert.match(encryptField("x"), /^v2\./);
});

test("puede descifrar un valor cifrado con una versión de clave anterior (soporta rotación)", () => {
  process.env.FIELD_ENCRYPTION_ACTIVE_VERSION = "1";
  const oldCiphertext = encryptField("999");
  process.env.FIELD_ENCRYPTION_ACTIVE_VERSION = "2";
  assert.equal(decryptField(oldCiphertext), "999");
});

test("rechaza un ciphertext corrupto (auth tag no coincide)", () => {
  const ciphertext = encryptField("secreto");
  const tampered = ciphertext.slice(0, -4) + "abcd";
  assert.throws(() => decryptField(tampered));
});
