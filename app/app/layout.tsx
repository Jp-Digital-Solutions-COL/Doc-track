import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar, type TopbarNotification } from "@/components/app-topbar";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import { FlashToastBridge } from "@/components/flash-toast-bridge";
import { BrandStyle } from "@/components/brand-style";

const NOTIFICATION_LOOKAHEAD_DAYS = 15;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // El middleware ya bloquea /app sin sesión; esto revalida de todos modos
  // en el server (defensa en profundidad, CLAUDE.md regla 5).
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  const superadmin = await isSuperadmin(supabase);

  // Sin membresía activa (org bloqueada o sin rol asignado) y sin ser
  // superadmin: no hay nada que la barra lateral pueda ofrecer — la propia
  // página de /app ya explica la situación con un mensaje claro.
  if (!membership && !superadmin) {
    return (
      <ToastProvider>
        <div className="min-h-screen">{children}</div>
        <Suspense fallback={null}>
          <FlashToastBridge />
        </Suspense>
        <Toaster />
      </ToastProvider>
    );
  }

  const { data: org } = membership
    ? await supabase
        .from("organizations")
        .select("name, logo_url, brand_color")
        .eq("id", membership.organizationId)
        .single()
    : { data: null };

  const notifications: TopbarNotification[] = [];
  if (membership) {
    const isAdmin = ["owner", "admin"].includes(membership.role);
    const today = new Date();
    const lookahead = new Date(today);
    lookahead.setDate(lookahead.getDate() + NOTIFICATION_LOOKAHEAD_DAYS);

    const [{ data: expiringDocs }, dataRequests] = await Promise.all([
      supabase
        .from("documents")
        .select("id, expiry_date, document_types(name), suppliers(legal_name)")
        .eq("organization_id", membership.organizationId)
        .eq("status", "aprobado")
        .gte("expiry_date", today.toISOString().slice(0, 10))
        .lte("expiry_date", lookahead.toISOString().slice(0, 10))
        .order("expiry_date", { ascending: true })
        .limit(5),
      isAdmin
        ? supabase
            .from("data_subject_requests")
            .select("id, requester_name, request_type, due_date")
            .eq("organization_id", membership.organizationId)
            .in("status", ["pendiente", "en_proceso"])
            .order("due_date", { ascending: true })
            .limit(5)
        : Promise.resolve({ data: null }),
    ]);

    for (const d of expiringDocs ?? []) {
      const typeName = (d.document_types as unknown as { name: string } | null)?.name ?? "Documento";
      const supplierName = (d.suppliers as unknown as { legal_name: string } | null)?.legal_name ?? "";
      notifications.push({
        id: `doc-${d.id}`,
        label: `${typeName} próximo a vencer`,
        sublabel: `${supplierName} — ${new Date(`${d.expiry_date}T00:00:00Z`).toLocaleDateString("es-CO")}`,
        href: `/app/suppliers`,
        kind: "expiring",
      });
    }
    for (const r of dataRequests.data ?? []) {
      notifications.push({
        id: `req-${r.id}`,
        label: "Solicitud de titular abierta",
        sublabel: `${r.requester_name} — vence ${new Date(`${r.due_date}T00:00:00Z`).toLocaleDateString("es-CO")}`,
        href: "/app/data-requests",
        kind: "request",
      });
    }
  }

  return (
    <ToastProvider>
      <BrandStyle brandColor={org?.brand_color ?? null} />
      <div className="flex min-h-screen">
        <AppSidebar
          orgName={org?.name ?? null}
          logoUrl={org?.logo_url ?? null}
          role={membership?.role ?? null}
          superadmin={superadmin}
          userEmail={user.email ?? ""}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar userEmail={user.email ?? ""} notifications={notifications} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      <Suspense fallback={null}>
        <FlashToastBridge />
      </Suspense>
      <Toaster />
    </ToastProvider>
  );
}
