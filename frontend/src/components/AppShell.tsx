"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { apiFetch } from "@/lib/apiFetch";
import { supabase } from "@/lib/supabaseClient";

type NavItem = { label: string; href: string };
type Crumb = { label: string; href?: string };

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Cotizar", href: "/quote-preview" },
  { label: "Cotizaciones", href: "/quotes" },
  { label: "Clientes", href: "/customers" },
  { label: "Productos", href: "/products" },
  { label: "Insumos", href: "/supplies" },
];

export function AppShell({
  title,
  subtitle,
  crumbs,
  headerRight,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  headerRight?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const API = process.env.NEXT_PUBLIC_API_URL!;
  const [meInfo, setMeInfo] = useState<{ userId: string; role: string; fullName?: string | null } | null>(
    null
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await apiFetch(`${API}/me`);
        const raw = await res.text().catch(() => "");
        const data: unknown = raw
          ? (() => {
              try {
                return JSON.parse(raw);
              } catch {
                return raw;
              }
            })()
          : null;

        if (!alive) return;
        if (!res.ok) {
          setMeInfo(null);
          return;
        }

        if (typeof data === "object" && data !== null && "userId" in data && "role" in data) {
          const d = data as { userId: string; role: string; fullName?: string | null };
          setMeInfo({
            userId: String(d.userId),
            role: String(d.role),
            fullName: d.fullName ? String(d.fullName) : null,
          });
        } else {
          setMeInfo(null);
        }
      } catch {
        if (!alive) return;
        setMeInfo(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [API]);

  const filteredNav = useMemo(() => {
    if (meInfo?.role === "vendedor") {
      return navItems.filter((item) => item.href !== "/products" && item.href !== "/customers");
    }
    if (meInfo?.role !== "admin") {
      return navItems.filter((item) => item.href !== "/customers");
    }
    return navItems;
  }, [meInfo?.role]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#E2E8F0]">
      <header className="border-b border-[#334155] bg-[#0F172A]/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl border border-[#334155] bg-[#1E293B] flex items-center justify-center">
              <img
                src="/prodex-logo.png"
                alt="Prodex"
                className="h-7 w-7 object-contain"
              />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xs uppercase tracking-[0.3em] text-[#94A3B8]">PRODEX</span>
              <span className="text-sm font-semibold text-[#E2E8F0]">Panel operativo</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-full border border-[#334155] bg-[#1E293B] px-3 py-1 text-xs text-[#94A3B8]">
              {meInfo ? (
                <>
                  user:{" "}
                  <span className="font-medium text-[#E2E8F0]">
                    {meInfo.fullName ?? meInfo.userId}
                  </span>{" "}
                  — <span className="font-medium text-[#E2E8F0]">{meInfo.role}</span>
                </>
              ) : (
                <>user: (sin /me)</>
              )}
            </div>
            <button
              className="rounded-full border border-[#334155] bg-[#22C55E] px-3 py-1 text-xs font-semibold text-[#0F172A] transition hover:brightness-110"
              onClick={logout}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:flex lg:flex-col lg:gap-3">
          <div className="rounded-2xl border border-[#334155] bg-[#1E293B]/90 p-4 text-xs text-[#94A3B8]">
            Navegación
          </div>
          <div className="flex flex-col gap-2">
            {filteredNav.map((item) => (
              <a
                key={item.href}
                className={cn(
                  "rounded-xl border border-transparent px-3 py-2 text-sm font-semibold transition",
                  pathname === item.href
                    ? "border-[#38BDF8]/40 bg-[#1E293B] text-[#E2E8F0]"
                    : "text-[#94A3B8] hover:border-[#334155] hover:bg-[#1E293B]/70 hover:text-[#E2E8F0]"
                )}
                href={item.href}
              >
                {item.label}
              </a>
            ))}
          </div>
        </aside>

        <main className="space-y-6">
          {crumbs && crumbs.length > 0 && (
            <div className="text-xs text-[#94A3B8]">
              {crumbs.map((c, idx) => (
                <span key={`${c.label}-${idx}`}>
                  {c.href ? (
                    <a className="hover:text-[#E2E8F0]" href={c.href}>
                      {c.label}
                    </a>
                  ) : (
                    <span className="text-[#E2E8F0]">{c.label}</span>
                  )}
                  {idx < crumbs.length - 1 && <span className="mx-2">/</span>}
                </span>
              ))}
            </div>
          )}

          <div>
            <h1 className="text-3xl font-semibold">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-[#94A3B8]">{subtitle}</p>}
          </div>

          {(headerRight || actions) && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {headerRight}
              {actions}
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}
