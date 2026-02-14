"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RequireAuth } from "@/components/RequireAuth";
import { apiFetch } from "@/lib/apiFetch";
import { toast } from "@/lib/alerts";
import { Input } from "@/components/ui/Input";

type DashboardResponse = {
  scope: "all" | "mine";
  totals: {
    count: number;
    totalAmount: number;
    avgAmount: number;
  };
  byStatus: Record<string, number>;
  recent: Array<{
    id: string;
    created_at?: string;
    status: string;
    total: number;
    product_id?: string;
    kind?: "quote" | "group";
  }>;
  lowStock?: Array<{
    id: string;
    name: string;
    unit_base: string;
    stock: number;
  }>;
  salesBySeller?: Array<{
    userId: string;
    fullName?: string | null;
    role?: string | null;
    count: number;
    total: number;
    avg: number;
  }>;
  averages?: {
    daily: number;
    weekly: number;
    monthly: number;
  };
};

export default function Home() {
  const API = process.env.NEXT_PUBLIC_API_URL!;
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  );
  const fmtL = (v?: number) => `L ${money.format(Number(v ?? 0))}`;

  const statusTotal = useMemo(() => {
    if (!data?.byStatus) return 0;
    return Object.values(data.byStatus).reduce((acc, v) => acc + Number(v || 0), 0);
  }, [data?.byStatus]);

  const statusEntries = useMemo(() => {
    if (!data?.byStatus) return [];
    return Object.entries(data.byStatus).map(([status, count]) => ({
      status,
      count,
      pct: statusTotal > 0 ? (Number(count || 0) / statusTotal) * 100 : 0,
    }));
  }, [data?.byStatus, statusTotal]);

  const maxSellerTotal = useMemo(() => {
    return Math.max(1, ...(data?.salesBySeller ?? []).map((s) => Number(s.total || 0)));
  }, [data?.salesBySeller]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        params.set("to", end.toISOString());
      }
      params.set("limit", "8");

      const res = await apiFetch(`${API}/dashboard?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as unknown;

      if (!res.ok || !payload || typeof payload !== "object") {
        const msg =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error ?? "No se pudo cargar")
            : "No se pudo cargar";
        toast("error", `Error ${res.status}: ${msg}`);
        setData(null);
        return;
      }

      setData(payload as DashboardResponse);
    } catch (e) {
      console.error("dashboard error:", e);
      toast("error", "Error de red cargando dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API, dateFrom, dateTo]);

  const statusVariant = (status: string) => {
    if (status === "converted") return "success";
    if (status === "approved") return "info";
    return "neutral";
  };

  const statusBarColor = (status: string) => {
    if (status === "converted") return "bg-[#22C55E]";
    if (status === "approved") return "bg-[#38BDF8]";
    if (status === "draft") return "bg-[#94A3B8]";
    if (status === "expired") return "bg-[#F97316]";
    return "bg-[#64748B]";
  };

  const formatDate = (v?: string) => {
    if (!v) return "-";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
  };

  return (
    <RequireAuth>
      <AppShell
        title="Dashboard"
        subtitle="Resumen general de cotizaciones y actividad reciente."
        crumbs={[{ label: "Dashboard" }]}
      >
        <div className="relative space-y-6">
          <div className="pointer-events-none absolute -top-20 right-6 h-64 w-64 rounded-full bg-[#38BDF8]/20 blur-3xl" />
          <div className="pointer-events-none absolute top-40 -left-16 h-72 w-72 rounded-full bg-[#22C55E]/15 blur-3xl" />
          <div className="pointer-events-none absolute bottom-10 right-1/3 h-72 w-72 rounded-full bg-[#1E293B]/60 blur-3xl" />

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-base font-semibold">Filtros</div>
                <div className="text-xs text-[#94A3B8]">
                  Ajusta el rango de fechas y vuelve a cargar el resumen.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-36"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-36"
                />
                {data && (
                  <Badge variant="neutral">
                    {data.scope === "all" ? "Todo el equipo" : "Mis cotizaciones"}
                  </Badge>
                )}
                <Button variant="surface" size="sm" onClick={loadDashboard} disabled={loading}>
                  {loading ? "..." : "Refrescar"}
                </Button>
              </div>
            </div>
          </Card>

          {loading ? (
            <Card className="p-5">Cargando...</Card>
          ) : !data ? (
            <Card className="p-5">No se pudo cargar el dashboard.</Card>
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-3">
                <Card className="p-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                    Cotizaciones
                  </p>
                  <div className="mt-2 text-2xl font-semibold">{data.totals.count}</div>
                </Card>
                <Card className="p-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                    Monto total
                  </p>
                  <div className="mt-2 text-2xl font-semibold">{fmtL(data.totals.totalAmount)}</div>
                </Card>
                <Card className="p-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                    Promedio
                  </p>
                  <div className="mt-2 text-2xl font-semibold">{fmtL(data.totals.avgAmount)}</div>
                </Card>
              </section>

              {data.scope === "all" && (
                <section className="grid gap-4 md:grid-cols-3">
                  <Card className="p-6">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">Promedio diario</p>
                    <div className="mt-2 text-2xl font-semibold">
                      {fmtL(data.averages?.daily ?? 0)}
                    </div>
                  </Card>
                  <Card className="p-6">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">Promedio semanal</p>
                    <div className="mt-2 text-2xl font-semibold">
                      {fmtL(data.averages?.weekly ?? 0)}
                    </div>
                  </Card>
                  <Card className="p-6">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">Promedio mensual</p>
                    <div className="mt-2 text-2xl font-semibold">
                      {fmtL(data.averages?.monthly ?? 0)}
                    </div>
                  </Card>
                </section>
              )}

              <section className="grid gap-4 md:grid-cols-4">
                {Object.entries(data.byStatus).map(([status, count]) => (
                  <Card key={status} className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold capitalize">{status}</span>
                      <Badge variant={statusVariant(status)}>{count}</Badge>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-[#0F172A]">
                      <div
                        className={`h-2 rounded-full ${statusBarColor(status)}`}
                        style={{
                          width: statusTotal ? `${(Number(count || 0) / statusTotal) * 100}%` : "0%",
                        }}
                      />
                    </div>
                  </Card>
                ))}
              </section>

              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold">Distribución por estado</h2>
                    <p className="text-xs text-[#94A3B8]">
                      {statusTotal} cotizaciones en el periodo seleccionado.
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#0F172A]">
                  {statusEntries.map((entry) => (
                    <span
                      key={entry.status}
                      className={`inline-block h-3 ${statusBarColor(entry.status)}`}
                      style={{ width: `${entry.pct}%` }}
                    />
                  ))}
                </div>
                <div className="mt-3 grid gap-2 text-xs text-[#94A3B8] sm:grid-cols-2 lg:grid-cols-4">
                  {statusEntries.map((entry) => (
                    <div key={`legend-${entry.status}`} className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${statusBarColor(entry.status)}`} />
                      <span className="capitalize">{entry.status}</span>
                      <span className="text-[#E2E8F0]">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {data.scope === "all" && (
                <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <Card className="p-5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold">Ventas por vendedor</h2>
                      <span className="text-xs text-[#94A3B8]">Convertidas</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {(data.salesBySeller ?? []).length === 0 ? (
                        <div className="text-sm text-[#94A3B8]">Sin ventas convertidas.</div>
                      ) : (
                        (data.salesBySeller ?? []).map((s) => (
                          <div
                            key={s.userId}
                            className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-[#E2E8F0]">
                                  {s.fullName ?? s.userId}
                                </div>
                                <div className="text-xs text-[#94A3B8]">
                                  {s.role ?? "usuario"}
                                </div>
                              </div>
                              <div className="text-sm font-semibold">{fmtL(s.total)}</div>
                            </div>
                            <div className="mt-3 h-2 w-full rounded-full bg-[#0B1220]">
                              <div
                                className="h-2 rounded-full bg-[#22C55E]"
                                style={{
                                  width: `${(Number(s.total || 0) / maxSellerTotal) * 100}%`,
                                }}
                              />
                            </div>
                            <div className="mt-2 grid gap-1 text-xs text-[#94A3B8] sm:grid-cols-2">
                              <div>Ventas: {s.count}</div>
                              <div>Promedio: {fmtL(s.avg)}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold">Insumos bajos</h2>
                      <span className="text-xs text-[#94A3B8]">Top 8</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {(data.lowStock ?? []).length === 0 ? (
                        <div className="text-sm text-[#94A3B8]">No hay insumos bajos.</div>
                      ) : (
                        (data.lowStock ?? []).map((s) => (
                          <div
                            key={s.id}
                            className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-semibold text-[#E2E8F0]">{s.name}</div>
                                <div className="text-xs text-[#94A3B8]">
                                  {s.unit_base}
                                </div>
                              </div>
                              <div className="text-right">
                                <div
                                  className={`text-sm font-semibold ${
                                    s.stock <= 2 ? "text-[#F87171]" : "text-[#F59E0B]"
                                  }`}
                                >
                                  {s.stock}
                                </div>
                                <div className="text-[10px] text-[#94A3B8]">
                                  {s.stock <= 2 ? "Crítico" : "Bajo"}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                </section>
              )}

              <section>
                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">Actividad reciente</h2>
                    <span className="text-xs text-[#94A3B8]">Últimas 8</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {data.recent.length === 0 ? (
                      <div className="text-sm text-[#94A3B8]">Sin actividad.</div>
                    ) : (
                      data.recent.map((q) => (
                        <div
                          key={q.id}
                          className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-[#E2E8F0]">{q.id}</div>
                              <Badge variant={statusVariant(q.status)}>{q.status}</Badge>
                              {q.kind === "group" && <Badge variant="info">grupal</Badge>}
                            </div>
                            <div className="text-sm font-semibold">{fmtL(q.total)}</div>
                          </div>
                          <div className="mt-2 grid gap-1 text-xs text-[#94A3B8] sm:grid-cols-2">
                            <div>
                              <span className="text-[#64748B]">Producto:</span>{" "}
                              <span className="text-[#E2E8F0]">
                                {q.kind === "group" ? "Cotización grupal" : q.product_id}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#64748B]">Creada:</span>{" "}
                              <span className="text-[#E2E8F0]">{formatDate(q.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </section>
            </>
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}
