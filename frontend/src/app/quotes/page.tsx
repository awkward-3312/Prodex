"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { apiFetch } from "@/lib/apiFetch";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { confirmDialog, promptSupervisorCredentials, toast } from "@/lib/alerts";

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

type QuoteGroupRow = {
  id: string;
  created_at?: string;
  created_by?: string;
  status: string;
  price_final: number;
  isv_amount: number;
  total: number;
};

type ListRow =
  | ({ kind: "quote" } & QuoteRow)
  | ({ kind: "group" } & QuoteGroupRow);


export default function QuotesPage() {
  const API = process.env.NEXT_PUBLIC_API_URL!;
  const router = useRouter();

  const [quotes, setQuotes] = useState<ListRow[]>([]);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [quotesStatus, setQuotesStatus] = useState<"all" | "draft" | "approved" | "converted" | "expired">(
    "all"
  );
  const [quotesLimit, setQuotesLimit] = useState<number>(10);

  const loadQuotes = async () => {
    setIsLoadingQuotes(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(quotesLimit));

      if (quotesStatus !== "all") params.set("status", quotesStatus);

      // vendedor: siempre mine; admin/supervisor: igual dejamos mine para esta pantalla
      params.set("mine", "1");

      const [resQuotes, resGroups] = await Promise.all([
        apiFetch(`${API}/quotes?${params.toString()}`, { method: "GET", cache: "no-store" }),
        apiFetch(`${API}/quote-groups?${params.toString()}`, { method: "GET", cache: "no-store" }),
      ]);

      const dataQuotes = (await resQuotes.json().catch(() => null)) as unknown;
      const dataGroups = (await resGroups.json().catch(() => null)) as unknown;

      if (!resQuotes.ok || !resGroups.ok) {
        const errData = !resQuotes.ok ? dataQuotes : dataGroups;
        const errStatus = !resQuotes.ok ? resQuotes.status : resGroups.status;
        console.error("loadQuotes error:", errStatus, errData);
        setQuotes([]);
        const msg =
          typeof errData === "object" && errData !== null && "error" in errData
            ? String((errData as { error?: unknown }).error ?? "No se pudieron cargar")
            : "No se pudieron cargar";
        toast("error", `Error ${errStatus}: ${msg}`);
        return;
      }

      const qList = Array.isArray(dataQuotes) ? (dataQuotes as QuoteRow[]) : [];
      const gList = Array.isArray(dataGroups) ? (dataGroups as QuoteGroupRow[]) : [];
      const merged: ListRow[] = [
        ...qList.map((q) => ({ kind: "quote" as const, ...q })),
        ...gList.map((g) => ({ kind: "group" as const, ...g })),
      ];

      merged.sort((a, b) => {
        const ta = new Date(a.created_at ?? 0).getTime();
        const tb = new Date(b.created_at ?? 0).getTime();
        return tb - ta;
      });

      setQuotes(merged);
    } catch (e) {
      console.error("loadQuotes network error:", e);
      setQuotes([]);
      toast("error", "Error de red cargando cotizaciones");
    } finally {
      setIsLoadingQuotes(false);
    }
  };

  const convertQuote = async (quoteId: string) => {
    const ok = await confirmDialog({
      title: "Confirmar conversión",
      text: "Convertir esta cotización a pedido descontará stock. ¿Deseas continuar?",
      confirmText: "Sí, convertir",
      cancelText: "Cancelar",
    });
    if (!ok) return;

    const tryConvert = async (body?: { supervisorEmail: string; supervisorPassword: string }) => {
      const headers = body ? { "Content-Type": "application/json" } : undefined;
      const res = await apiFetch(`${API}/quotes/${quoteId}/convert`, {
        method: "POST",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
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
      return { res, data };
    };

    setConvertingId(quoteId);
    try {
      let { res, data } = await tryConvert();

      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "")
            : typeof data === "string"
              ? data
              : "";
        if (msg.includes("Aprobación requerida")) {
          const creds = await promptSupervisorCredentials();
          if (!creds) return;
          ({ res, data } = await tryConvert(creds));
        }
      }

      if (!res.ok) {
        let errMsg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "No se pudo convertir")
            : typeof data === "string"
              ? data
              : "No se pudo convertir";
        toast("error", errMsg);
        return;
      }

      toast("success", "Convertido a pedido.");
      void loadQuotes();
    } catch (e) {
      console.error("convert quote error:", e);
      toast("error", "Error de red");
    } finally {
      setConvertingId(null);
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
        actions={
          <Button variant="primary" size="sm" onClick={() => router.push("/quote-preview")}>
            Nueva cotización
          </Button>
        }
      >
        <div className="relative space-y-6">
          <div className="pointer-events-none absolute -top-20 right-6 h-64 w-64 rounded-full bg-[#38BDF8]/20 blur-3xl" />
          <div className="pointer-events-none absolute top-40 -left-16 h-72 w-72 rounded-full bg-[#22C55E]/15 blur-3xl" />
          <div className="pointer-events-none absolute bottom-10 right-1/3 h-72 w-72 rounded-full bg-[#1E293B]/60 blur-3xl" />

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">Filtros</h2>
                <p className="text-xs text-[#94A3B8]">Filtra por estado y define el límite.</p>
              </div>
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
          </Card>

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Listado</h2>
              <span className="text-xs text-[#94A3B8]">
                {quotes.length} resultados
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {isLoadingQuotes ? (
                <div className="text-sm text-[#94A3B8]">Cargando...</div>
              ) : quotes.length === 0 ? (
                <div className="text-sm text-[#94A3B8]">Aún no tienes cotizaciones guardadas.</div>
              ) : (
                <div className="space-y-2">
                  {quotes.map((q) => (
                    <div key={q.id} className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-[#E2E8F0]">{q.id}</div>
                          <Badge variant={tableStatusVariant(q.status)}>{q.status}</Badge>
                          {q.kind === "group" && (
                            <Badge variant="info">grupal</Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleCopy("ID de cotización", q.id)}
                          >
                            Copiar ID
                          </Button>

                          <Button
                            variant="surface"
                            size="sm"
                            onClick={() =>
                              router.push(q.kind === "group" ? `/quote-groups/${q.id}` : `/quotes/${q.id}`)
                            }
                          >
                            Ver hoja
                          </Button>

                          {q.kind === "quote" && (
                            <Button variant="surface" size="sm" onClick={() => router.push(buildQuoteUrl(q))}>
                              Usar
                            </Button>
                          )}

                          {q.kind === "quote" && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => convertQuote(q.id)}
                              disabled={
                                convertingId === q.id ||
                                (q.status !== "draft" && q.status !== "approved")
                              }
                            >
                              {convertingId === q.id ? "Convirtiendo..." : "Convertir"}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-1 text-xs text-[#94A3B8] sm:grid-cols-2">
                        <div>
                          <span className="text-[#64748B]">Producto:</span>{" "}
                          <span className="text-[#E2E8F0]">
                            {q.kind === "group" ? "Cotización grupal" : q.product_id}
                          </span>
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
                          <span className="text-[#E2E8F0]">
                            {q.kind === "quote" ? formatDate(q.expires_at) : "-"}
                          </span>
                        </div>
                      </div>

                      {q.kind === "quote" && q.inputs && (q.inputs.cantidad || q.inputs.diseño) && (
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
