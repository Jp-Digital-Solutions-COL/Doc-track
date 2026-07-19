// lib/email/default-templates.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSubjectFor, defaultBlocksFor, resolveEmailContent } from "./default-templates.ts";
import { EMAIL_TYPES } from "./blocks.ts";

test("cada tipo de correo tiene subject y al menos un bloque por defecto", () => {
  for (const type of EMAIL_TYPES) {
    assert.ok(defaultSubjectFor(type).length > 0, `${type} subject vacío`);
    assert.ok(defaultBlocksFor(type).length > 0, `${type} sin bloques`);
  }
});

test("invite_supplier incluye un botón con hrefVar inviteUrl", () => {
  const blocks = defaultBlocksFor("invite_supplier");
  const button = blocks.find((b) => b.type === "button");
  assert.ok(button);
  assert.equal((button as { hrefVar: string }).hrefVar, "inviteUrl");
});

test("las 3 alertas usan {{documentoDestinatario}} en el cuerpo", () => {
  for (const type of ["alert_expiring", "alert_expired", "alert_missing"] as const) {
    const blocks = defaultBlocksFor(type);
    const hasToken = blocks.some((b) => b.type === "text" && b.text.includes("{{documentoDestinatario}}"));
    assert.ok(hasToken, `${type} no usa documentoDestinatario`);
  }
});

test("resolveEmailContent usa el override cuando existe", () => {
  const override = { subject: "Custom", blocks: [{ id: "x", type: "text" as const, text: "hola" }] };
  assert.deepEqual(resolveEmailContent("invite_supplier", override), override);
});

test("resolveEmailContent cae a la plantilla predeterminada cuando override es null", () => {
  const result = resolveEmailContent("invite_supplier", null);
  assert.equal(result.subject, defaultSubjectFor("invite_supplier"));
  assert.deepEqual(result.blocks, defaultBlocksFor("invite_supplier"));
});
