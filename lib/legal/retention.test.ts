import { test } from "node:test";
import assert from "node:assert/strict";
import { isWithinRetentionWindow } from "./retention.ts";

const now = new Date("2026-01-01T00:00:00Z");

test("documento reciente sigue dentro de la ventana de retención", () => {
  assert.equal(isWithinRetentionWindow("2025-01-01T00:00:00Z", now), true);
});

test("documento más viejo que el plazo de retención ya no está protegido", () => {
  assert.equal(isWithinRetentionWindow("2018-01-01T00:00:00Z", now), false);
});

test("documento justo en el borde del plazo (5 años) todavía está protegido", () => {
  assert.equal(isWithinRetentionWindow("2021-06-01T00:00:00Z", now), true);
});
