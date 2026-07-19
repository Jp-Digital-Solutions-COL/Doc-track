// lib/branding/derive-palette.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidHexColor,
  contrastingTextColor,
  derivePalette,
  DEFAULT_BRAND_COLOR,
} from "./derive-palette.ts";

test("isValidHexColor acepta hex de 6 dígitos, con o sin mayúsculas", () => {
  assert.equal(isValidHexColor("#006adc"), true);
  assert.equal(isValidHexColor("#FFFFFF"), true);
});

test("isValidHexColor rechaza formatos inválidos", () => {
  assert.equal(isValidHexColor("006adc"), false); // sin #
  assert.equal(isValidHexColor("#fff"), false); // shorthand no soportado
  assert.equal(isValidHexColor("#gggggg"), false); // no es hex
  assert.equal(isValidHexColor("<script>alert(1)</script>"), false);
  assert.equal(isValidHexColor(""), false);
});

test("contrastingTextColor elige negro sobre un color muy claro", () => {
  assert.equal(contrastingTextColor("#ffe600"), "#000000");
});

test("contrastingTextColor elige blanco sobre un color muy oscuro", () => {
  assert.equal(contrastingTextColor("#0a0a0a"), "#ffffff");
});

test("contrastingTextColor elige blanco sobre el azul de marca de Doc-Track", () => {
  assert.equal(contrastingTextColor(DEFAULT_BRAND_COLOR), "#ffffff");
});

test("derivePalette usa el mismo hex para --primary y --sidebar-primary, y deriva el texto", () => {
  const palette = derivePalette("#006adc");
  assert.equal(palette["--primary"], "#006adc");
  assert.equal(palette["--sidebar-primary"], "#006adc");
  assert.equal(palette["--primary-foreground"], "#ffffff");
  assert.equal(palette["--sidebar-primary-foreground"], "#ffffff");
  assert.match(palette["--accent"], /color-mix/);
  assert.match(palette["--ring"], /color-mix/);
});

test("derivePalette expone --sidebar-accent/--sidebar-accent-foreground con el mismo valor que --accent/--accent-foreground", () => {
  const palette = derivePalette("#006adc");
  assert.equal(palette["--sidebar-accent"], palette["--accent"]);
  assert.equal(palette["--sidebar-accent-foreground"], palette["--accent-foreground"]);
});

test("derivePalette oscurece --accent-foreground con color-mix en vez de usar el hex crudo, incluso para colores claros", () => {
  const palette = derivePalette("#ffe600");
  assert.notEqual(palette["--accent-foreground"], "#ffe600");
  assert.equal(palette["--accent-foreground"], "color-mix(in srgb, #ffe600 60%, black)");
});
