// lib/email/template-schema.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBlocksSchema } from "./template-schema.ts";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const ASSET_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"}/storage/v1/object/public/email-assets/${ORG_ID}/img.png`;
const OTHER_ORG_ASSET_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"}/storage/v1/object/public/email-assets/22222222-2222-2222-2222-222222222222/img.png`;
const TRAVERSAL_ASSET_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"}/storage/v1/object/public/email-assets/${ORG_ID}/../22222222-2222-2222-2222-222222222222/secret.png`;

test("acepta una plantilla válida con variables permitidas", () => {
  const schema = buildBlocksSchema("invite_supplier", ORG_ID);
  const result = schema.safeParse({
    subject: "Invitación de {{organizationName}}",
    blocks: [
      { id: "1", type: "text", text: "{{organizationName}} te invitó." },
      { id: "2", type: "button", label: "Aceptar", hrefVar: "inviteUrl" },
    ],
  });
  assert.equal(result.success, true);
});

test("rechaza un token de variable no permitido para el tipo", () => {
  const schema = buildBlocksSchema("invite_supplier", ORG_ID);
  const result = schema.safeParse({
    subject: "Hola",
    blocks: [{ id: "1", type: "text", text: "{{destinatarioSecreto}}" }],
  });
  assert.equal(result.success, false);
});

test("rechaza un hrefVar de botón distinto al permitido para el tipo", () => {
  const schema = buildBlocksSchema("invite_supplier", ORG_ID);
  const result = schema.safeParse({
    subject: "Hola",
    blocks: [{ id: "1", type: "button", label: "x", hrefVar: "portalUrl" }],
  });
  assert.equal(result.success, false);
});

test("rechaza una imagen que no pertenece al bucket/prefijo de la organización", () => {
  const schema = buildBlocksSchema("invite_supplier", ORG_ID);
  const result = schema.safeParse({
    subject: "Hola",
    blocks: [{ id: "1", type: "image", url: OTHER_ORG_ASSET_URL, alt: "x" }],
  });
  assert.equal(result.success, false);
});

test("rechaza una imagen con path traversal (..) hacia el prefijo de otra organización", () => {
  const schema = buildBlocksSchema("invite_supplier", ORG_ID);
  const result = schema.safeParse({
    subject: "Hola",
    blocks: [{ id: "1", type: "image", url: TRAVERSAL_ASSET_URL, alt: "x" }],
  });
  assert.equal(result.success, false);
});

test("acepta una imagen que sí pertenece al prefijo de la organización", () => {
  const schema = buildBlocksSchema("invite_supplier", ORG_ID);
  const result = schema.safeParse({
    subject: "Hola",
    blocks: [{ id: "1", type: "image", url: ASSET_URL, alt: "x" }],
  });
  assert.equal(result.success, true);
});

test("rechaza más de 20 bloques", () => {
  const schema = buildBlocksSchema("alert_missing", ORG_ID);
  const blocks = Array.from({ length: 21 }, (_, i) => ({ id: String(i), type: "divider" as const }));
  const result = schema.safeParse({ subject: "Hola", blocks });
  assert.equal(result.success, false);
});

test("rechaza un bloque de texto de más de 2000 caracteres", () => {
  const schema = buildBlocksSchema("alert_missing", ORG_ID);
  const result = schema.safeParse({ subject: "Hola", blocks: [{ id: "1", type: "text", text: "a".repeat(2001) }] });
  assert.equal(result.success, false);
});

test("rechaza un subject de más de 200 caracteres", () => {
  const schema = buildBlocksSchema("alert_missing", ORG_ID);
  const result = schema.safeParse({ subject: "a".repeat(201), blocks: [{ id: "1", type: "divider" }] });
  assert.equal(result.success, false);
});
