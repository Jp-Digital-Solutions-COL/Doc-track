import { test } from "node:test";
import assert from "node:assert/strict";
import { renderEmailHtml, brandButtonHtml } from "./template.ts";

test("renderEmailHtml incluye el logo cuando se pasa logoUrl", () => {
  const html = renderEmailHtml({ logoUrl: "https://example.com/logo.png", bodyHtml: "<p>hola</p>" });
  assert.match(html, /<img src="https:\/\/example\.com\/logo\.png"/);
  assert.match(html, /<p>hola<\/p>/);
});

test("renderEmailHtml no incluye <img> cuando logoUrl es null", () => {
  const html = renderEmailHtml({ logoUrl: null, bodyHtml: "<p>hola</p>" });
  assert.doesNotMatch(html, /<img/);
});

test("brandButtonHtml usa el color de marca dado como fondo del botón", () => {
  const html = brandButtonHtml({ href: "https://example.com", label: "Aceptar", brandColor: "#ff0000" });
  assert.match(html, /background:#ff0000/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, />Aceptar<\/a>/);
});

test("brandButtonHtml cae al azul de Doc-Track cuando brandColor es null", () => {
  const html = brandButtonHtml({ href: "https://example.com", label: "Aceptar", brandColor: null });
  assert.match(html, /background:#006adc/);
});

test("brandButtonHtml elige texto blanco o negro según el contraste del color", () => {
  const onDark = brandButtonHtml({ href: "#", label: "x", brandColor: "#0a0a0a" });
  assert.match(onDark, /color:#ffffff/);
  const onLight = brandButtonHtml({ href: "#", label: "x", brandColor: "#ffe600" });
  assert.match(onLight, /color:#000000/);
});
