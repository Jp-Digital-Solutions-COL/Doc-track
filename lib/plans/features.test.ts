import { test } from "node:test";
import assert from "node:assert/strict";
import { hasFeature } from "./features.ts";

test("plan avanzado tiene reglas de alerta dinámicas", () => {
  assert.equal(hasFeature("avanzado", "dynamic_alert_rules"), true);
});

test("plan estandar NO tiene reglas de alerta dinámicas", () => {
  assert.equal(hasFeature("estandar", "dynamic_alert_rules"), false);
});

test("ocr_validation está apagado para todos los planes (módulo enchufable, aún sin implementar)", () => {
  assert.equal(hasFeature("estandar", "ocr_validation"), false);
  assert.equal(hasFeature("avanzado", "ocr_validation"), false);
});

test("estandar no tiene estados personalizables", () => {
  assert.equal(hasFeature("estandar", "custom_statuses"), false);
});
