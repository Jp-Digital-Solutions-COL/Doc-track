import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateDataSubjectRequestDueDate } from "./data-subject-deadline.ts";

test("consulta vence en 10 días", () => {
  assert.equal(calculateDataSubjectRequestDueDate("consulta", new Date("2026-01-01T00:00:00Z")), "2026-01-11");
});

test("rectificacion vence en 15 días", () => {
  assert.equal(calculateDataSubjectRequestDueDate("rectificacion", new Date("2026-01-01T00:00:00Z")), "2026-01-16");
});

test("supresion vence en 15 días", () => {
  assert.equal(calculateDataSubjectRequestDueDate("supresion", new Date("2026-01-01T00:00:00Z")), "2026-01-16");
});

test("cruza de mes correctamente", () => {
  assert.equal(calculateDataSubjectRequestDueDate("consulta", new Date("2026-01-25T00:00:00Z")), "2026-02-04");
});
