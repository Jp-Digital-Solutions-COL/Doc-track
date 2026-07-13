import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateSupplierStatus, type DocumentInput, type RequirementInput } from "./supplier-status.ts";

const today = new Date("2026-06-15T00:00:00Z");

const req = (documentTypeId: string, isMandatory = true): RequirementInput => ({ documentTypeId, isMandatory });
const doc = (documentTypeId: string, status: DocumentInput["status"], expiryDate: string | null = null): DocumentInput => ({
  documentTypeId,
  status,
  expiryDate,
});

test("sin requisitos mandatorios -> pendiente (nada configurado aún)", () => {
  assert.equal(calculateSupplierStatus([], [], today), "pendiente");
  assert.equal(calculateSupplierStatus([req("A", false)], [], today), "pendiente");
});

test("falta un documento mandatorio -> pendiente", () => {
  const requirements = [req("A"), req("B")];
  const documents = [doc("A", "aprobado")]; // falta B
  assert.equal(calculateSupplierStatus(requirements, documents, today), "pendiente");
});

test("documento mandatorio cargado sin revisar -> en_revision", () => {
  const requirements = [req("A")];
  const documents = [doc("A", "cargado")];
  assert.equal(calculateSupplierStatus(requirements, documents, today), "en_revision");
});

test("todos los mandatorios aprobados y vigentes -> activo", () => {
  const requirements = [req("A"), req("B")];
  const documents = [doc("A", "aprobado", "2027-01-01"), doc("B", "aprobado", null)];
  assert.equal(calculateSupplierStatus(requirements, documents, today), "activo");
});

test("mandatorio aprobado pero con expiry_date pasado -> vencido", () => {
  const requirements = [req("A")];
  const documents = [doc("A", "aprobado", "2026-01-01")]; // antes de `today`
  assert.equal(calculateSupplierStatus(requirements, documents, today), "vencido");
});

test("documento marcado directamente como 'vencido' -> vencido", () => {
  const requirements = [req("A")];
  const documents = [doc("A", "vencido", "2026-01-01")];
  assert.equal(calculateSupplierStatus(requirements, documents, today), "vencido");
});

test("mandatorio rechazado -> rechazado (prioridad sobre pendiente)", () => {
  const requirements = [req("A"), req("B")];
  const documents = [doc("A", "rechazado")]; // B tampoco existe, pero rechazado manda
  assert.equal(calculateSupplierStatus(requirements, documents, today), "rechazado");
});

test("rechazado tiene prioridad incluso si otro mandatorio está vencido", () => {
  const requirements = [req("A"), req("B")];
  const documents = [doc("A", "rechazado"), doc("B", "aprobado", "2020-01-01")];
  assert.equal(calculateSupplierStatus(requirements, documents, today), "rechazado");
});

test("vencido tiene prioridad sobre pendiente y en_revision", () => {
  const requirements = [req("A"), req("B"), req("C")];
  const documents = [
    doc("A", "aprobado", "2020-01-01"), // vencido
    // B falta (pendiente)
    doc("C", "cargado"), // en_revision
  ];
  assert.equal(calculateSupplierStatus(requirements, documents, today), "vencido");
});

test("pendiente tiene prioridad sobre en_revision", () => {
  const requirements = [req("A"), req("B")];
  const documents = [doc("B", "cargado")]; // A falta
  assert.equal(calculateSupplierStatus(requirements, documents, today), "pendiente");
});

test("documentos no mandatorios nunca afectan el resultado", () => {
  const requirements = [req("A"), req("B", false)];
  const documents = [doc("A", "aprobado", null), doc("B", "rechazado")]; // B no es mandatorio
  assert.equal(calculateSupplierStatus(requirements, documents, today), "activo");
});

test("documento aprobado sin expiry_date (no requiere vencimiento) no vence nunca", () => {
  const requirements = [req("A")];
  const documents = [doc("A", "aprobado", null)];
  assert.equal(calculateSupplierStatus(requirements, documents, today), "activo");
});
