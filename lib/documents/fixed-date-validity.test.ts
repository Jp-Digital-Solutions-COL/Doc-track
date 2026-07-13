import { test } from "node:test";
import assert from "node:assert/strict";
import { nextFixedDateOnOrAfter } from "./fixed-date-validity.ts";

test("fecha objetivo más adelante en el mismo año -> ese año", () => {
  assert.equal(nextFixedDateOnOrAfter("2026-03-01", 4, 30), "2026-04-30");
});

test("fecha objetivo ya pasó este año -> próximo año", () => {
  assert.equal(nextFixedDateOnOrAfter("2026-05-01", 1, 1), "2027-01-01");
});

test("fecha objetivo es exactamente hoy -> hoy mismo (no salta un año)", () => {
  assert.equal(nextFixedDateOnOrAfter("2026-01-01", 1, 1), "2026-01-01");
});

test("29 de febrero se recorta a 28 en año no bisiesto", () => {
  assert.equal(nextFixedDateOnOrAfter("2026-01-01", 2, 29), "2026-02-28");
});

test("29 de febrero se respeta en año bisiesto", () => {
  assert.equal(nextFixedDateOnOrAfter("2028-01-01", 2, 29), "2028-02-29");
});
