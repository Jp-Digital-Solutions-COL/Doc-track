// lib/email/render-blocks.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { substituteVariables, renderBlocks } from "./render-blocks.ts";
import type { EmailBlock } from "./blocks.ts";

test("substituteVariables reemplaza un token conocido", () => {
  assert.equal(substituteVariables("Hola {{nombre}}", { nombre: "Ana" }), "Hola Ana");
});

test("substituteVariables reemplaza por vacío un token sin valor, sin lanzar", () => {
  assert.equal(substituteVariables("Hola {{nombre}}", {}), "Hola ");
});

test("renderBlocks escapa HTML en el texto del bloque y en el valor sustituido", () => {
  const blocks: EmailBlock[] = [{ id: "1", type: "text", text: "<b>{{nombre}}</b>" }];
  const html = renderBlocks(blocks, { nombre: "<script>1</script>" }, null);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /&lt;script&gt;/);
});

test("renderBlocks renderiza un bloque de imagen con url y alt", () => {
  const blocks: EmailBlock[] = [{ id: "1", type: "image", url: "https://example.com/a.png", alt: "Logo" }];
  const html = renderBlocks(blocks, {}, null);
  assert.match(html, /<img src="https:\/\/example\.com\/a\.png" alt="Logo"/);
});

test("renderBlocks escapa HTML en la url de imagen — evita romper el atributo src", () => {
  const blocks: EmailBlock[] = [
    {
      id: "1",
      type: "image",
      url: 'https://example.com/x.png"><script>alert(1)</script>',
      alt: "Logo",
    },
  ];
  const html = renderBlocks(blocks, {}, null);
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /">/);
});

test("renderBlocks renderiza una plantilla personalizada completa (texto + imagen + botón + separador)", () => {
  const blocks: EmailBlock[] = [
    { id: "1", type: "text", text: "Hola {{organizationName}}" },
    { id: "2", type: "image", url: "https://example.com/logo.png", alt: "Logo" },
    { id: "3", type: "divider" },
    { id: "4", type: "button", label: "Ir al portal", hrefVar: "portalUrl" },
  ];
  const html = renderBlocks(
    blocks,
    { organizationName: "Acme", portalUrl: "https://example.com/portal" },
    "#00ff00"
  );
  assert.match(html, /Hola Acme/);
  assert.match(html, /<img src="https:\/\/example\.com\/logo\.png" alt="Logo"/);
  assert.match(html, /<hr/);
  assert.match(html, /href="https:\/\/example\.com\/portal"/);
  assert.match(html, />Ir al portal<\/a>/);
});

test("renderBlocks renderiza un bloque de botón con el href resuelto", () => {
  const blocks: EmailBlock[] = [{ id: "1", type: "button", label: "Aceptar", hrefVar: "inviteUrl" }];
  const html = renderBlocks(blocks, { inviteUrl: "https://example.com/x" }, "#ff0000");
  assert.match(html, /href="https:\/\/example\.com\/x"/);
  assert.match(html, /background:#ff0000/);
  assert.match(html, />Aceptar<\/a>/);
});

test("renderBlocks omite un bloque de botón cuyo hrefVar no resuelve — nunca href vacío", () => {
  const blocks: EmailBlock[] = [{ id: "1", type: "button", label: "Aceptar", hrefVar: "inviteUrl" }];
  const html = renderBlocks(blocks, {}, null);
  assert.doesNotMatch(html, /<a /);
  assert.doesNotMatch(html, /href=""/);
});

test("renderBlocks escapa HTML en el label del botón", () => {
  const blocks: EmailBlock[] = [{ id: "1", type: "button", label: "<b>X</b>", hrefVar: "inviteUrl" }];
  const html = renderBlocks(blocks, { inviteUrl: "https://example.com/x" }, null);
  assert.match(html, /&lt;b&gt;/);
  assert.doesNotMatch(html, /<b>/);
});

test("renderBlocks renderiza un separador", () => {
  const blocks: EmailBlock[] = [{ id: "1", type: "divider" }];
  const html = renderBlocks(blocks, {}, null);
  assert.match(html, /<hr/);
});

test("renderBlocks preserva el orden de los bloques", () => {
  const blocks: EmailBlock[] = [
    { id: "1", type: "text", text: "Primero" },
    { id: "2", type: "divider" },
    { id: "3", type: "text", text: "Segundo" },
  ];
  const html = renderBlocks(blocks, {}, null);
  assert.ok(html.indexOf("Primero") < html.indexOf("<hr") && html.indexOf("<hr") < html.indexOf("Segundo"));
});
