// Test de aislamiento multi-tenant end-to-end.
//
// El setup (crear orgs/usuarios/datos) usa el cliente service_role porque
// crear una organización y su primer miembro es, por diseño, una operación
// que RLS no permite hacer al cliente (ver migración de organizations). Pero
// la parte que IMPORTA — leer e insertar como un usuario real — usa
// EXCLUSIVAMENTE el cliente con anon key + sesión autenticada, igual que el
// navegador, para que las políticas RLS realmente se ejecuten.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error(
    "✗ Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY en el entorno."
  );
  process.exit(1);
}

const isLocal = URL.includes("127.0.0.1") || URL.includes("localhost");
if (!isLocal && process.env.ALLOW_REMOTE_RLS_TEST !== "true") {
  console.error(
    `✗ NEXT_PUBLIC_SUPABASE_URL (${URL}) no parece local. Este script crea y ` +
      "borra datos reales — para correrlo contra un proyecto remoto, exporta " +
      "ALLOW_REMOTE_RLS_TEST=true explícitamente."
  );
  process.exit(1);
}

const admin = createClient(URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const run = randomUUID().slice(0, 8);
const PASSWORD = randomUUID();

type Ctx = {
  orgA: { id: string };
  orgB: { id: string };
  userA: { id: string; email: string };
};

const results: { name: string; pass: boolean; detail?: string }[] = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function setup(): Promise<Ctx> {
  console.log("[setup] creando 2 orgs + 1 usuario + 1 supplier + 1 document por org (service_role)...");

  const { data: orgA, error: orgAErr } = await admin
    .from("organizations")
    .insert({ name: `RLS Test Org A ${run}`, nit: `RLS-TEST-A-${run}` })
    .select()
    .single();
  if (orgAErr) throw orgAErr;

  const { data: orgB, error: orgBErr } = await admin
    .from("organizations")
    .insert({ name: `RLS Test Org B ${run}`, nit: `RLS-TEST-B-${run}` })
    .select()
    .single();
  if (orgBErr) throw orgBErr;

  const emailA = `rls-test-a-${run}@example.test`;
  const { data: userAData, error: userAErr } = await admin.auth.admin.createUser({
    email: emailA,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userAErr) throw userAErr;
  const userA = userAData.user;

  const { error: memberErr } = await admin.from("organization_members").insert({
    organization_id: orgA.id,
    user_id: userA.id,
    role: "owner",
    status: "active",
  });
  if (memberErr) throw memberErr;

  const { data: docTypeA, error: docTypeAErr } = await admin
    .from("document_types")
    .insert({ organization_id: orgA.id, name: `Tipo A ${run}` })
    .select()
    .single();
  if (docTypeAErr) throw docTypeAErr;

  const { data: docTypeB, error: docTypeBErr } = await admin
    .from("document_types")
    .insert({ organization_id: orgB.id, name: `Tipo B ${run}` })
    .select()
    .single();
  if (docTypeBErr) throw docTypeBErr;

  const { data: supplierA, error: supplierAErr } = await admin
    .from("suppliers")
    .insert({ organization_id: orgA.id, legal_name: `Proveedor A ${run}`, nit: `SUP-A-${run}` })
    .select()
    .single();
  if (supplierAErr) throw supplierAErr;

  const { data: supplierB, error: supplierBErr } = await admin
    .from("suppliers")
    .insert({ organization_id: orgB.id, legal_name: `Proveedor B ${run}`, nit: `SUP-B-${run}` })
    .select()
    .single();
  if (supplierBErr) throw supplierBErr;

  const { error: documentAErr } = await admin.from("documents").insert({
    organization_id: orgA.id,
    supplier_id: supplierA.id,
    document_type_id: docTypeA.id,
    storage_path: `orgA/${run}/doc.pdf`,
    file_hash: "a".repeat(64),
    mime_type: "application/pdf",
    size_bytes: 1024,
  });
  if (documentAErr) throw documentAErr;

  const { error: documentBErr } = await admin.from("documents").insert({
    organization_id: orgB.id,
    supplier_id: supplierB.id,
    document_type_id: docTypeB.id,
    storage_path: `orgB/${run}/doc.pdf`,
    file_hash: "b".repeat(64),
    mime_type: "application/pdf",
    size_bytes: 2048,
  });
  if (documentBErr) throw documentBErr;

  console.log("[setup] listo.\n");

  return { orgA, orgB, userA: { id: userA.id, email: emailA } };
}

async function cleanup(ctx: Ctx | null) {
  if (!ctx) return;
  console.log("\n[cleanup] borrando datos de prueba...");
  // ON DELETE CASCADE se encarga de members/suppliers/document_types/documents.
  await admin.from("organizations").delete().in("id", [ctx.orgA.id, ctx.orgB.id]);
  await admin.auth.admin.deleteUser(ctx.userA.id);
  console.log("[cleanup] listo.");
}

async function main() {
  let ctx: Ctx | null = null;
  try {
    ctx = await setup();

    // Cliente con ANON KEY (nunca service_role), autenticado como el usuario
    // real de Org A — mismo comportamiento que tendría el navegador.
    const asUserA = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: signInErr } = await asUserA.auth.signInWithPassword({
      email: ctx.userA.email,
      password: PASSWORD,
    });
    if (signInErr) throw signInErr;

    console.log(`[test] autenticado como usuario de Org A (${ctx.userA.email})\n`);

    // --- 3. Lectura cross-tenant: debe devolver 0 filas ---
    const { data: suppliersFromB, error: suppliersReadErr } = await asUserA
      .from("suppliers")
      .select("id")
      .eq("organization_id", ctx.orgB.id);
    check(
      "Org A NO ve suppliers de Org B",
      !suppliersReadErr && (suppliersFromB?.length ?? -1) === 0,
      suppliersReadErr ? suppliersReadErr.message : `filas devueltas: ${suppliersFromB?.length}`
    );

    const { data: documentsFromB, error: documentsReadErr } = await asUserA
      .from("documents")
      .select("id")
      .eq("organization_id", ctx.orgB.id);
    check(
      "Org A NO ve documents de Org B",
      !documentsReadErr && (documentsFromB?.length ?? -1) === 0,
      documentsReadErr ? documentsReadErr.message : `filas devueltas: ${documentsFromB?.length}`
    );

    // Control positivo: si esto fallara, los "0 filas" de arriba no
    // probarían aislamiento — probarían que el usuario no ve NADA (otro bug).
    const { data: suppliersFromA } = await asUserA
      .from("suppliers")
      .select("id")
      .eq("organization_id", ctx.orgA.id);
    check("Org A SÍ ve su propio supplier (control positivo)", (suppliersFromA?.length ?? 0) === 1);

    // --- 4. Insert cross-tenant: debe ser rechazado por RLS ---
    const { data: insertData, error: insertErr } = await asUserA
      .from("suppliers")
      .insert({ organization_id: ctx.orgB.id, legal_name: "Proveedor intruso", nit: `HACK-${run}` })
      .select();
    check(
      "INSERT de Org A hacia Org B es rechazado por RLS",
      !!insertErr && (insertData?.length ?? 0) === 0,
      insertErr ? insertErr.message : "el insert NO fue rechazado — esto es una fuga"
    );

    // Doble verificación con el cliente admin: ninguna fila quedó insertada.
    const { data: leaked } = await admin.from("suppliers").select("id").eq("nit", `HACK-${run}`);
    check("Ninguna fila quedó insertada en la BD tras el intento bloqueado", (leaked?.length ?? 0) === 0);
  } finally {
    await cleanup(ctx);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks OK`);
  if (failed.length > 0) {
    console.error(`\n✗ FALLÓ el test de aislamiento multi-tenant (${failed.length} check(s)).`);
    process.exit(1);
  }
  console.log("\n✓ Aislamiento multi-tenant verificado: 0 fugas.");
}

main().catch((err) => {
  console.error("\n✗ Error inesperado corriendo el test:", err);
  process.exit(1);
});
