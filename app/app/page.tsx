import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  TrendingUp,
  Clock,
  Users,
  Gavel,
  ShieldCheck,
  Calendar,
  Activity,
  ArrowRight,
  CheckCircle2,
  FileWarning,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions/auth";
import { getCurrentMembership, hasBlockedMembership } from "@/lib/auth/session";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { humanizeDataSubjectRequestType, humanizeAuditAction } from "@/lib/labels";
import { ComplianceChart } from "@/components/compliance-chart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const LOOKAHEAD_DAYS = 30;

function daysUntil(dateStr: string) {
  const ms = new Date(`${dateStr}T00:00:00Z`).getTime() - new Date().setUTCHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function urgencyVariant(days: number): "destructive" | "warning" | "secondary" {
  if (days <= 5) return "destructive";
  if (days <= 15) return "warning";
  return "secondary";
}

function complianceLabel(pct: number) {
  if (pct >= 90) return { text: "Excelente", variant: "success" as const };
  if (pct >= 75) return { text: "Bueno", variant: "warning" as const };
  if (pct >= 50) return { text: "Regular", variant: "warning" as const };
  return { text: "Bajo", variant: "destructive" as const };
}

function activityIcon(action: string) {
  if (action.includes("approve") || action.includes("accept")) return { Icon: CheckCircle2, color: "text-success" };
  if (action.includes("reject") || action.includes("delete") || action.includes("erase") || action.includes("block"))
    return { Icon: FileWarning, color: "text-destructive" };
  if (action.includes("expire")) return { Icon: Clock, color: "text-warning" };
  if (action.includes("invit") || action.includes("create") || action === "upload" || action === "reupload")
    return { Icon: FileText, color: "text-primary" };
  return { Icon: ShieldCheck, color: "text-muted-foreground" };
}

export default async function AppHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // El middleware ya bloquea /app sin sesión; esto revalida de todos modos
  // en el server (defensa en profundidad, CLAUDE.md regla 5).
  if (!user) redirect("/login");

  // getCurrentMembership() ya filtra organizations.status = 'active' — si la
  // org está bloqueada, esto da null igual que "nunca tuvo rol". Se
  // distingue acá solo para mostrar un mensaje claro, no para autorizar nada.
  const membership = await getCurrentMembership(supabase, user.id);
  const superadmin = await isSuperadmin(supabase);

  if (!membership) {
    const blocked = await hasBlockedMembership(supabase, user.id);
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <Image src="/doc-track-logo.png" alt="Doc-Track" width={40} height={40} className="mx-auto h-9 w-9" />
        {blocked ? (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              El acceso de tu organización fue suspendido. Contacta al administrador de la plataforma.
            </p>
            <form action={logout} className="mt-4">
              <Button type="submit" variant="outline">
                Cerrar sesión
              </Button>
            </form>
          </>
        ) : superadmin ? (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              Tu cuenta es superadmin de la plataforma y no pertenece a ninguna organización.
            </p>
            <Link href="/superadmin" className="mt-4 inline-block">
              <Button>Ir al panel de superadmin</Button>
            </Link>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Tu cuenta no tiene un rol asignado en ninguna organización todavía.
          </p>
        )}
      </div>
    );
  }

  const isAdmin = ["owner", "admin"].includes(membership.role);
  const today = new Date();
  const lookaheadDate = new Date(today);
  lookaheadDate.setDate(lookaheadDate.getDate() + LOOKAHEAD_DAYS);
  const todayIso = today.toISOString().slice(0, 10);
  const lookaheadIso = lookaheadDate.toISOString().slice(0, 10);

  const [
    { data: expiringDocs },
    { data: pendingSuppliers },
    dataRequests,
    { count: totalSuppliers },
    { count: activeSuppliers },
    { data: recentActivity },
    { data: snapshots },
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("id, expiry_date, document_types(name), suppliers(id, legal_name)")
      .eq("organization_id", membership.organizationId)
      .eq("status", "aprobado")
      .gte("expiry_date", todayIso)
      .lte("expiry_date", lookaheadIso)
      .order("expiry_date", { ascending: true })
      .limit(5),
    supabase
      .from("suppliers")
      .select("id, legal_name, status, created_at")
      .eq("organization_id", membership.organizationId)
      .in("status", ["pendiente", "en_revision"])
      .order("created_at", { ascending: false })
      .limit(5),
    isAdmin
      ? supabase
          .from("data_subject_requests")
          .select("id, requester_name, request_type, due_date, status", { count: "exact" })
          .eq("organization_id", membership.organizationId)
          .in("status", ["pendiente", "en_proceso"])
          .order("due_date", { ascending: true })
          .limit(5)
      : Promise.resolve({ data: null, count: 0 }),
    supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", membership.organizationId),
    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organizationId)
      .eq("status", "activo"),
    supabase
      .from("audit_logs")
      .select("id, action, entity_type, created_at")
      .eq("organization_id", membership.organizationId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("compliance_snapshots")
      .select("snapshot_date, compliance_pct")
      .eq("organization_id", membership.organizationId)
      .order("snapshot_date", { ascending: true })
      .limit(180),
  ]);

  const compliancePct = totalSuppliers && totalSuppliers > 0 ? Math.round(((activeSuppliers ?? 0) / totalSuppliers) * 100) : 0;
  const compliance = complianceLabel(compliancePct);
  const urgentRequestsCount = dataRequests.count ?? 0;
  const chartData = (snapshots ?? []).map((s) => ({ date: s.snapshot_date as string, pct: Number(s.compliance_pct) }));

  const statCards = [
    {
      label: "Documentos por vencer",
      value: expiringDocs?.length ?? 0,
      sub: `Próximos ${LOOKAHEAD_DAYS} días`,
      icon: Clock,
      tone: "warning" as const,
    },
    {
      label: "Pendientes de revisión",
      value: pendingSuppliers?.length ?? 0,
      sub: "Proveedores",
      icon: Users,
      tone: "warning" as const,
    },
    ...(isAdmin
      ? [
          {
            label: "Solicitudes abiertas",
            value: urgentRequestsCount,
            sub: "De titulares",
            icon: Gavel,
            tone: "destructive" as const,
          },
        ]
      : []),
    {
      label: "Cumplimiento general",
      value: `${compliancePct}%`,
      sub: compliance.text,
      icon: ShieldCheck,
      tone: "success" as const,
    },
  ];

  const toneClasses: Record<string, { bg: string; fg: string; bar: string }> = {
    warning: { bg: "bg-warning/10", fg: "text-warning", bar: "bg-warning" },
    destructive: { bg: "bg-destructive/10", fg: "text-destructive", bar: "bg-destructive" },
    success: { bg: "bg-success/10", fg: "text-success", bar: "bg-success" },
  };

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          Dashboard <TrendingUp className="size-5 text-muted-foreground" />
        </h1>
        <p className="text-sm text-muted-foreground">Resumen operativo</p>
      </div>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {statCards.map((card) => {
          const tone = toneClasses[card.tone];
          const Icon = card.icon;
          const barPct = typeof card.value === "number" ? Math.min(100, card.value * 10) : compliancePct;
          return (
            <Card key={card.label}>
              <CardContent className="pt-6">
                <div className={`flex size-9 items-center justify-center rounded-lg ${tone.bg}`}>
                  <Icon className={`size-5 ${tone.fg}`} />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-semibold">{card.value}</p>
                <p className={`text-xs font-medium ${tone.fg}`}>{card.sub}</p>
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${barPct}%` }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="size-4 text-primary" /> Próximos vencimientos
              </CardTitle>
              <Link href="/app/document-types" className="text-xs font-medium text-primary hover:underline">
                Ver todos
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {expiringDocs && expiringDocs.length > 0 ? (
              <ul className="space-y-2">
                {expiringDocs.map((d) => {
                  const days = daysUntil(d.expiry_date as string);
                  const supplier = (d.suppliers as unknown as { id: string; legal_name: string } | null);
                  const typeName = (d.document_types as unknown as { name: string } | null)?.name ?? "Documento";
                  return (
                    <li key={d.id} className="flex items-center justify-between text-sm">
                      <Link href={supplier ? `/app/suppliers/${supplier.id}` : "#"} className="min-w-0 truncate hover:underline">
                        {typeName} <span className="text-muted-foreground">— {supplier?.legal_name}</span>
                      </Link>
                      <Badge variant={urgencyVariant(days)} className="shrink-0">
                        {days <= 0 ? "Hoy" : `${days}d`}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nada por vencer en los próximos {LOOKAHEAD_DAYS} días.</p>
            )}
            <Link href="/app/document-types" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Ir a Tipos de documento <ArrowRight className="size-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 text-primary" /> Proveedores pendientes
              </CardTitle>
              <Link href="/app/suppliers" className="text-xs font-medium text-primary hover:underline">
                Ver todos
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingSuppliers && pendingSuppliers.length > 0 ? (
              <ul className="space-y-2">
                {pendingSuppliers.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm">
                    <Link href={`/app/suppliers/${s.id}`} className="min-w-0 truncate hover:underline">
                      {s.legal_name}
                    </Link>
                    <Badge variant={s.status === "en_revision" ? "warning" : "secondary"} className="shrink-0">
                      {s.status === "en_revision" ? "En revisión" : "Pendiente"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Ningún proveedor pendiente ahora mismo.</p>
            )}
            <Link href="/app/suppliers" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Ir a Proveedores <ArrowRight className="size-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-primary" /> Actividad reciente
            </CardTitle>
            <CardDescription>Últimos eventos de esta organización.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity && recentActivity.length > 0 ? (
              <ul className="space-y-3">
                {recentActivity.map((a) => {
                  const { Icon, color } = activityIcon(a.action);
                  return (
                    <li key={a.id} className="flex items-start gap-2 text-sm">
                      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
                      <span className="min-w-0">
                        <span className="block truncate">{humanizeAuditAction(a.action)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString("es-CO")}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>
            )}
            {isAdmin ? (
              <Link href="/app/audit" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Ver toda la actividad <ArrowRight className="size-3" />
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {isAdmin ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gavel className="size-4 text-primary" /> Solicitudes de titulares (Ley 1581)
                </CardTitle>
                <Link href="/app/data-requests" className="text-xs font-medium text-primary hover:underline">
                  Ver todas
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {dataRequests.data && dataRequests.data.length > 0 ? (
                <ul className="space-y-2">
                  {dataRequests.data.map((r) => {
                    const days = daysUntil(r.due_date as string);
                    return (
                      <li key={r.id} className="flex items-center justify-between text-sm">
                        <span className="min-w-0 truncate">
                          {humanizeDataSubjectRequestType(r.request_type)} <span className="text-muted-foreground">— {r.requester_name}</span>
                        </span>
                        <Badge variant={days < 0 ? "destructive" : urgencyVariant(days)} className="shrink-0">
                          {days < 0 ? "Vencido" : days === 0 ? "Hoy" : `${days}d`}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Sin solicitudes abiertas.</p>
              )}
              <Link href="/app/data-requests" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Ir a Solicitudes de titulares <ArrowRight className="size-3" />
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4 text-primary" /> Cumplimiento en el tiempo
              </CardTitle>
              <CardDescription>Una foto por día, desde que se activó el seguimiento.</CardDescription>
            </CardHeader>
            <CardContent>
              <ComplianceChart data={chartData} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
