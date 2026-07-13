"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  FileText,
  Lock,
  ClipboardCheck,
  Gavel,
  CreditCard,
  ShieldAlert,
  ShieldCheck,
  LogOut,
  ArrowRight,
} from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof Users };

function buildNav(isAdmin: boolean, superadmin: boolean): NavItem[] {
  const items: NavItem[] = [
    { href: "/app", label: "Inicio", icon: Home },
    { href: "/app/suppliers", label: "Proveedores", icon: Users },
    { href: "/app/document-types", label: "Tipos de documento", icon: FileText },
  ];
  if (isAdmin) {
    items.push(
      { href: "/app/audit", label: "Auditoría", icon: ClipboardCheck },
      { href: "/app/data-requests", label: "Solicitudes de titulares", icon: Gavel }
    );
  }
  items.push({ href: "/app/security", label: "Seguridad", icon: Lock });
  if (isAdmin) {
    items.push({ href: "/app/plan", label: "Plan", icon: CreditCard });
  }
  if (superadmin) {
    items.push({ href: "/superadmin", label: "Superadmin", icon: ShieldAlert });
  }
  return items;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  reviewer: "Revisor",
};

export function AppSidebar({
  orgName,
  role,
  superadmin,
  userEmail,
}: {
  orgName: string | null;
  role: string | null;
  superadmin: boolean;
  userEmail: string;
}) {
  const pathname = usePathname();
  const isAdmin = role ? ["owner", "admin"].includes(role) : false;
  const items = buildNav(isAdmin, superadmin);
  const initial = userEmail.charAt(0).toUpperCase();
  const roleLabel = role ? (ROLE_LABEL[role] ?? role) : superadmin ? "Superadmin" : "";

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 px-5 py-5">
        <Image src="/doc-track-logo.png" alt="Doc-Track" width={32} height={32} className="size-8 shrink-0" />
        <p className="truncate text-base font-semibold text-sidebar-foreground">{orgName ?? "Doc-Track"}</p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map((item) => {
          const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <div className="rounded-xl bg-accent p-4">
          <ShieldCheck className="size-5 text-primary" />
          <p className="mt-2 text-sm font-medium text-accent-foreground">Cumplimiento siempre al día</p>
          <p className="mt-1 text-xs text-accent-foreground/70">Gestiona riesgos y obligaciones de datos personales.</p>
          <Link
            href="/app/plan"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Ver buenas prácticas <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 px-1 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-sidebar-foreground">{userEmail}</p>
            {roleLabel ? <p className="text-xs text-sidebar-foreground/60">{roleLabel}</p> : null}
          </div>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/70">
            <LogOut className="size-4" />
            Cerrar sesión
          </Button>
        </form>
      </div>
    </aside>
  );
}
