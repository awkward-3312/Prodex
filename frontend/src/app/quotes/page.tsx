"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { apiFetch } from "@/lib/apiFetch";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/lib/alerts";

type QuoteRow = {
  id: string;
  created_at?: string;
  product_id: string;
  status: string;
  price_final: number;
  isv_amount: number;
  total: number;
  expires_at?: string;
  inputs?: { cantidad?: number; diseño?: string } | null;
  created_by?: string;
};

type MeInfo = {
  userId: string;
  role: string;
  fullName?: string | null;
};

export default function QuotesPage() {
  const API = process.env.NEXT_PUBLIC_API_URL!;
  const router = useRouter();

  const [meInfo, setMeInfo] = useState<MeInfo | null>(null);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [quotesStatus, setQuotesStatus] = useState<"all" | "draft" | "approved" | "converted" | "expired">(
    "all"
  );
  const [quotesLimit, setQuotesLimit] = useState<number>(10);

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

  const loadQuotes = async () => {
    setIsLoadingQuotes(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(quotesLimit));

      if (quotesStatus !== "all") params.set("status", quotesStatus);

      // vendedor: siempre mine; admin/supervisor: igual dejamos mine para esta pantalla
      params.set("mine", "1");

      const res = await apiFetch(`${API}/quotes?${params.toString()}`, { method: "GET", cache: "no-store" });
      const data = (await res.json().catch(() => null)) as unknown;

      if (!res.ok) {
        console.error("loadQuotes error:", res.status, data);
        setQuotes([]);
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "No se pudieron cargar")
            : "No se pudieron cargar";
        toast("error", `Error ${res.status}: ${msg}`);
        return;
      }

      setQuotes(Array.isArray(data) ? (data as QuoteRow[]) : []);
    } catch (e) {
      console.error("loadQuotes network error:", e);
      setQuotes([]);
      toast("error", "Error de red cargando cotizaciones");
    } finally {
      setIsLoadingQuotes(false);
    }
  };

  useEffect(() => {
    void loadQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API, quotesStatus, quotesLimit]);

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast("success", `${label} copiado`);
    } catch {
      toast("error", "No se pudo copiar");
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const tableStatusVariant = (status: string) => {
    if (status === "converted") return "success";
    if (status === "approved") return "info";
    return "neutral";
  };

  const formatDate = (v?: string) => {
    if (!v) return "-";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
  };

  const buildQuoteUrl = (q: QuoteRow) => {
    const params = new URLSearchParams();
    params.set("productId", q.product_id);
    if (q.inputs?.cantidad) params.set("cantidad", String(q.inputs.cantidad));
    if (q.inputs?.diseño) params.set("diseno", String(q.inputs.diseño));
    return `/quote-preview?${params.toString()}`;
  };

  return (
    <RequireAuth>
      <AppShell
        title="Cotizaciones previas"
        subtitle="Consulta, filtra y reutiliza cotizaciones guardadas."
        crumbs={[
          { label: "Inicio", href: "/" },
          { label: "Cotizaciones" },
        ]}
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
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
            <Button variant="surface" size="sm" onClick={() => router.push("/quote-preview")}>
              Ir a cotizar
            </Button>
            <Button variant="primary" size="sm" onClick={logout}>
              Cerrar sesión
            </Button>
          </div>
        }
      >
        <div className="relative space-y-6">
          <div className="pointer-events-none absolute -top-20 right-6 h-64 w-64 rounded-full bg-[#38BDF8]/20 blur-3xl" />
          <div className="pointer-events-none absolute top-40 -left-16 h-72 w-72 rounded-full bg-[#22C55E]/15 blur-3xl" />
          <div className="pointer-events-none absolute bottom-10 right-1/3 h-72 w-72 rounded-full bg-[#1E293B]/60 blur-3xl" />

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Listado</h2>
              <div className="flex items-center gap-2">
                <Select
                  className="w-36"
                  value={quotesStatus}
                  onChange={(e) =>
                    setQuotesStatus(
                      e.target.value as "all" | "draft" | "approved" | "converted" | "expired"
                    )
                  }
                >
                  <option value="all">Todos</option>
                  <option value="draft">Draft</option>
                  <option value="approved">Approved</option>
                  <option value="converted">Converted</option>
                  <option value="expired">Expired</option>
                </Select>

                <Select
                  className="w-24"
                  value={String(quotesLimit)}
                  onChange={(e) => setQuotesLimit(Number(e.target.value))}
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </Select>

                <Button variant="surface" size="sm" onClick={loadQuotes} disabled={isLoadingQuotes}>
                  {isLoadingQuotes ? "..." : "Refrescar"}
                </Button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {isLoadingQuotes ? (
                <div className="text-sm text-[#94A3B8]">Cargando...</div>
              ) : quotes.length === 0 ? (
                <div className="text-sm text-[#94A3B8]">Aún no tienes cotizaciones guardadas.</div>
              ) : (
                <div className="space-y-2">
                  {quotes.map((q) => (
                    <div key={q.id} className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-[#E2E8F0]">{q.id}</div>
                          <Badge variant={tableStatusVariant(q.status)}>{q.status}</Badge>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleCopy("ID de cotización", q.id)}
                          >
                            Copiar ID
                          </Button>

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => router.push(`/quotes/${q.id}`)}
                          >
                            Ver hoja
                          </Button>

                          <Button variant="surface" size="sm" onClick={() => router.push(buildQuoteUrl(q))}>
                            Usar
                          </Button>
                        </div>
                      </div>

                      <div className="mt-2 grid gap-1 text-xs text-[#94A3B8] sm:grid-cols-2">
                        <div>
                          <span className="text-[#64748B]">Producto:</span>{" "}
                          <span className="text-[#E2E8F0]">{q.product_id}</span>
                        </div>
                        <div>
                          <span className="text-[#64748B]">Total:</span>{" "}
                          <span className="text-[#E2E8F0]">L {Number(q.total ?? 0).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[#64748B]">Creada:</span>{" "}
                          <span className="text-[#E2E8F0]">{formatDate(q.created_at)}</span>
                        </div>
                        <div>
                          <span className="text-[#64748B]">Expira:</span>{" "}
                          <span className="text-[#E2E8F0]">{formatDate(q.expires_at)}</span>
                        </div>
                      </div>

                      {q.inputs && (q.inputs.cantidad || q.inputs.diseño) && (
                        <div className="mt-2 text-xs text-[#94A3B8]">
                          <span className="text-[#64748B]">Inputs:</span>{" "}
                          <span className="text-[#E2E8F0]">
                            cantidad={q.inputs.cantidad ?? "-"}, diseño={q.inputs.diseño ?? "-"}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
