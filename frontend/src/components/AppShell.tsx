"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type NavItem = { label: string; href: string };
type Crumb = { label: string; href?: string };

const navItems: NavItem[] = [
  { label: "Inicio", href: "/" },
  { label: "Cotizar", href: "/quote-preview" },
  { label: "Cotizaciones", href: "/quotes" },
  { label: "Insumos", href: "/supplies" },
];

export function AppShell({
  title,
  subtitle,
  crumbs,
  headerRight,
  children,
}: {
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#E2E8F0]">
      <header className="border-b border-[#334155] bg-[#0F172A]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
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

          <nav className="hidden items-center gap-4 text-sm font-semibold md:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                className={cn(
                  "transition",
                  pathname === item.href
                    ? "text-[#38BDF8]"
                    : "text-[#94A3B8] hover:text-[#E2E8F0]"
                )}
                href={item.href}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">{headerRight}</div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:flex lg:flex-col lg:gap-3">
          <div className="rounded-2xl border border-[#334155] bg-[#1E293B]/90 p-4 text-xs text-[#94A3B8]">
            Navegación
          </div>
          <div className="flex flex-col gap-2">
            {navItems.map((item) => (
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

          {children}
        </main>
      </div>
    </div>
  );
}
