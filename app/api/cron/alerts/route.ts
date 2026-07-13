import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findExpiringDocuments,
  findNewlyExpiredDocuments,
  findMissingMandatoryDocuments,
  getOrgRecipientEmails,
} from "@/lib/documents/expiry-alerts";
import { recalculateSupplierStatus } from "@/lib/documents/recalculate-supplier-status";
import { writeComplianceSnapshots } from "@/lib/documents/compliance-snapshot";
import { sendAlertEmail, type AlertKind, type Audience } from "@/lib/email/alerts";
import { logAudit } from "@/lib/actions/audit";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Inserta la fila de notifications con dedupe_key ANTES de enviar — si ya
// existe (unique violation), no se manda de nuevo hoy. El insert-primero
// evita la carrera de "reviso si existe" + "inserto" en dos pasos separados.
async function notifyOnce(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    type: string;
    recipient: string;
    supplierId: string;
    documentTypeId?: string;
    today: string;
    send: () => Promise<void>;
  }
): Promise<"sent" | "duplicate" | "insert_failed" | "send_failed"> {
  const dedupeKey = `${params.type}:${params.recipient}:${params.supplierId}:${params.documentTypeId ?? ""}:${params.today}`;

  const { data: inserted, error } = await admin
    .from("notifications")
    .insert({
      organization_id: params.organizationId,
      type: params.type,
      channel: "email",
      recipient: params.recipient,
      payload: { supplier_id: params.supplierId, document_type_id: params.documentTypeId ?? null },
      status: "pending",
      dedupe_key: dedupeKey,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return error?.code === "23505" ? "duplicate" : "insert_failed";
  }

  try {
    await params.send();
    await admin.from("notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", inserted.id);
    return "sent";
  } catch {
    await admin.from("notifications").update({ status: "failed" }).eq("id", inserted.id);
    return "send_failed";
  }
}

async function notifyBoth(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    supplierId: string;
    supplierEmail: string | null;
    documentTypeId?: string;
    kind: AlertKind;
    typeSuffix: string;
    today: string;
    alertParams: Parameters<typeof sendAlertEmail>[3];
  }
) {
  const results: ("sent" | "duplicate" | "insert_failed" | "send_failed")[] = [];

  if (params.supplierEmail) {
    results.push(
      await notifyOnce(admin, {
        organizationId: params.organizationId,
        type: `${params.typeSuffix}:supplier`,
        recipient: params.supplierEmail,
        supplierId: params.supplierId,
        documentTypeId: params.documentTypeId,
        today: params.today,
        send: () => sendAlertEmail(params.supplierEmail!, params.kind, "supplier", params.alertParams),
      })
    );
  }

  const orgEmails = await getOrgRecipientEmails(admin, params.organizationId);
  for (const email of orgEmails) {
    results.push(
      await notifyOnce(admin, {
        organizationId: params.organizationId,
        type: `${params.typeSuffix}:org`,
        recipient: email,
        supplierId: params.supplierId,
        documentTypeId: params.documentTypeId,
        today: params.today,
        send: () => sendAlertEmail(email, params.kind, "org" as Audience, params.alertParams),
      })
    );
  }

  return results;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("No autorizado.", { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const today = new Date();
    const todayIso = isoDate(today);

    let sent = 0;
    let skipped = 0;
    const tally = (r: string) => (r === "sent" ? sent++ : skipped++);

    // --- 1. Por vencer (30/15/5 días) ---
    const expiring = await findExpiringDocuments(admin, today);
    for (const doc of expiring) {
      const results = await notifyBoth(admin, {
        organizationId: doc.organizationId,
        supplierId: doc.supplierId,
        supplierEmail: doc.supplierEmail,
        documentTypeId: undefined,
        kind: "expiring",
        typeSuffix: `document_expiring_${doc.daysUntil}:${doc.documentId}`,
        today: todayIso,
        alertParams: {
          supplierName: doc.supplierName,
          documentTypeName: doc.documentTypeName,
          daysUntil: doc.daysUntil,
          expiryDate: doc.expiryDate,
        },
      });
      results.forEach(tally);
    }

    // --- 2. Recién vencidos: alerta + flip a status='vencido' + recalcular ---
    const expired = await findNewlyExpiredDocuments(admin, today);
    for (const doc of expired) {
      await admin.from("documents").update({ status: "vencido" }).eq("id", doc.documentId);
      await logAudit(admin, {
        organizationId: doc.organizationId,
        actorId: null,
        actorType: "system",
        action: "document.expire",
        entityType: "document",
        entityId: doc.documentId,
      });

      const results = await notifyBoth(admin, {
        organizationId: doc.organizationId,
        supplierId: doc.supplierId,
        supplierEmail: doc.supplierEmail,
        documentTypeId: undefined,
        kind: "expired",
        typeSuffix: `document_expired:${doc.documentId}`,
        today: todayIso,
        alertParams: {
          supplierName: doc.supplierName,
          documentTypeName: doc.documentTypeName,
          expiryDate: doc.expiryDate,
        },
      });
      results.forEach(tally);

      await recalculateSupplierStatus(admin, {
        supplierId: doc.supplierId,
        organizationId: doc.organizationId,
        actorId: null,
        actorType: "system",
      });
    }

    // --- 3. Obligatorios sin cargar ---
    const missing = await findMissingMandatoryDocuments(admin);
    for (const req of missing) {
      const results = await notifyBoth(admin, {
        organizationId: req.organizationId,
        supplierId: req.supplierId,
        supplierEmail: req.supplierEmail,
        documentTypeId: req.documentTypeId,
        kind: "missing",
        typeSuffix: `document_missing:${req.documentTypeId}`,
        today: todayIso,
        alertParams: {
          supplierName: req.supplierName,
          documentTypeName: req.documentTypeName,
        },
      });
      results.forEach(tally);
    }

    // --- 4. Foto diaria de cumplimiento (para el gráfico del dashboard) ---
    const snapshotsWritten = await writeComplianceSnapshots(admin, todayIso);

    // Solo conteos — nunca nombres de proveedor, correos ni IDs en la respuesta.
    return NextResponse.json({
      expiringFound: expiring.length,
      expiredFound: expired.length,
      missingFound: missing.length,
      emailsSent: sent,
      emailsSkipped: skipped,
      snapshotsWritten,
    });
  } catch (err) {
    console.error("GET /api/cron/alerts failed", { name: (err as Error).name });
    return new NextResponse("No se pudo completar el job.", { status: 500 });
  }
}
