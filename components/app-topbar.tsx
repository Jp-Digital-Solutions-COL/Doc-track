"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, ChevronDown, FileWarning, Gavel } from "lucide-react";
import { searchSuppliers, type SearchResult } from "@/lib/actions/search";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

export type TopbarNotification = { id: string; label: string; sublabel: string; href: string; kind: "expiring" | "request" };

export function AppTopbar({
  userEmail,
  notifications,
}: {
  userEmail: string;
  notifications: TopbarNotification[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const r = await searchSuppliers(query);
        setResults(r);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Atajo ⌘K / Ctrl+K para enfocar la búsqueda, y cerrar los menús con click afuera.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
        setUserMenuOpen(false);
      }
    }
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setNotifOpen(false);
        setUserMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onClickOutside);
    };
  }, []);

  return (
    <TooltipProvider>
    <div ref={containerRef} className="flex items-center justify-end gap-3 border-b bg-background px-8 py-4">
      <div className="relative flex-1 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchInputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Buscar proveedores..."
          className="h-9 w-full rounded-lg border border-input bg-background pr-14 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
          ⌘K
        </kbd>

        {searchOpen && query.trim().length >= 2 ? (
          <div className="absolute top-full z-20 mt-1 w-full rounded-lg border bg-popover p-1 shadow-md">
            {results.length > 0 ? (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setQuery("");
                    router.push(r.href);
                  }}
                  className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="font-medium">{r.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{r.sublabel}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados para &ldquo;{query}&rdquo;.</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Notificaciones"
              >
                <Bell className="size-4" />
                {notifications.length > 0 ? (
                  <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[0.65rem] font-semibold text-white">
                    {notifications.length > 9 ? "9+" : notifications.length}
                  </span>
                ) : null}
              </button>
            }
          />
          <TooltipContent>Notificaciones</TooltipContent>
        </Tooltip>
        {notifOpen ? (
          <div className="absolute top-full right-0 z-20 mt-1 w-72 rounded-lg border bg-popover p-1 shadow-md">
            {notifications.length > 0 ? (
              notifications.map((n) => {
                const Icon = n.kind === "expiring" ? FileWarning : Gavel;
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => setNotifOpen(false)}
                    className="flex items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-warning" />
                    <span>
                      <span className="block font-medium">{n.label}</span>
                      <span className="block text-xs text-muted-foreground">{n.sublabel}</span>
                    </span>
                  </Link>
                );
              })
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">Sin notificaciones pendientes.</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-1 rounded-lg p-1 hover:bg-muted"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {userEmail.charAt(0).toUpperCase()}
                </div>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </button>
            }
          />
          <TooltipContent>Tu cuenta</TooltipContent>
        </Tooltip>
        {userMenuOpen ? (
          <div className="absolute top-full right-0 z-20 mt-1 w-56 rounded-lg border bg-popover p-1 shadow-md">
            <p className="truncate px-3 py-2 text-xs text-muted-foreground">{userEmail}</p>
            <Link href="/app/security" className="block rounded-md px-3 py-2 text-sm hover:bg-muted" onClick={() => setUserMenuOpen(false)}>
              Seguridad
            </Link>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm" className="w-full justify-start px-3">
                Cerrar sesión
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
    </TooltipProvider>
  );
}
