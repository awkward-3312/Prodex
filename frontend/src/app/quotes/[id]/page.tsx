"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { apiFetch } from "@/lib/apiFetch";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/lib/alerts";

type QuoteDetail = {
  id: string;
  created_at?: string;
  created_by?: string;
  product_id: string;
  status: string;
  inputs?: {
    cantidad?: number;
    diseño?: string;
    descuento?: {
      tipo?: string;
      temporada?: string | null;
      razon?: string;
      monto?: number;
    } | null;
  } | null;
  apply_isv?: boolean;
  isv_rate?: number;
  materials_cost?: number;
  waste_cost?: number;
  operational_cost?: number;
  design_cost?: number;
  cost_total?: number;
  suggested_price?: number;
  price_final?: number;
  isv_amount?: number;
  total?: number;
  expires_at?: string;
};

type QuoteLine = {
  supply_id: string;
  supply_name: string;
  unit_base: string;
  qty: number;
  cost_per_unit: number;
  line_cost: number;
  qty_formula: string;
};

type QuoteDetailResponse = {
  quote: QuoteDetail;
  lines: QuoteLine[];
  product: { id: string; name?: string | null } | null;
};

export default function QuoteDetailPage() {
  const API = process.env.NEXT_PUBLIC_API_URL!;
  const router = useRouter();
  const params = useParams();
  const quoteId = String(params?.id ?? "");

  const [data, setData] = useState<QuoteDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    void (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`${API}/quotes/${quoteId}`, { method: "GET", cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as unknown;

        if (!alive) return;

        if (!res.ok || !payload || typeof payload !== "object") {
          const msg =
            payload && typeof payload === "object" && "error" in payload
              ? String((payload as { error?: unknown }).error ?? "No se pudo cargar")
              : "No se pudo cargar";
          toast("error", `Error ${res.status}: ${msg}`);
          setData(null);
          return;
        }

        setData(payload as QuoteDetailResponse);
      } catch (e) {
        if (!alive) return;
        console.error("quote detail error:", e);
        toast("error", "Error de red cargando cotización");
        setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [API, quoteId]);

  const money = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const fmtL = (v?: number) => `L ${money.format(Number(v ?? 0))}`;
  const fmtDate = (v?: string) => {
    if (!v) return "-";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
  };

  const paperTitle = useMemo(() => {
    if (!data?.quote?.id) return "Cotización interna";
    return `Cotización interna ${data.quote.id}`;
  }, [data?.quote?.id]);

  const productLabel = data?.product?.name
    ? String(data.product.name)
    : "Producto sin nombre";

  const descuentoPct = Number(data?.quote.inputs?.descuento?.monto ?? 0);
  const subtotalConDescuento = Number(data?.quote.price_final ?? 0);
  const pctFactor = descuentoPct > 0 && descuentoPct < 100 ? 1 - descuentoPct / 100 : 1;
  const subtotal = pctFactor > 0 ? subtotalConDescuento / pctFactor : subtotalConDescuento;
  const descuento = subtotal - subtotalConDescuento;
  const autoPriceWithDiscount =
    Number(data?.quote.suggested_price ?? 0) > 0 && descuentoPct > 0
      ? Number(data?.quote.suggested_price ?? 0) * (1 - descuentoPct / 100)
      : null;
  const descuentoLabel = data?.quote.inputs?.descuento?.tipo ?? null;
  const descuentoDetalle = data?.quote.inputs?.descuento?.razon ?? null;
  const qty = Number(data?.quote.inputs?.cantidad ?? 0) || 1;
  const unitPrice = subtotalConDescuento / qty;
  const lineDiscount = descuento > 0 ? descuento : 0;

  const numberToWordsEs = (value: number) => {
    const unidades = [
      "CERO",
      "UNO",
      "DOS",
      "TRES",
      "CUATRO",
      "CINCO",
      "SEIS",
      "SIETE",
      "OCHO",
      "NUEVE",
    ];
    const especiales = [
      "DIEZ",
      "ONCE",
      "DOCE",
      "TRECE",
      "CATORCE",
      "QUINCE",
      "DIECISEIS",
      "DIECISIETE",
      "DIECIOCHO",
      "DIECINUEVE",
    ];
    const decenas = [
      "",
      "DIEZ",
      "VEINTE",
      "TREINTA",
      "CUARENTA",
      "CINCUENTA",
      "SESENTA",
      "SETENTA",
      "OCHENTA",
      "NOVENTA",
    ];
    const centenas = [
      "",
      "CIENTO",
      "DOSCIENTOS",
      "TRESCIENTOS",
      "CUATROCIENTOS",
      "QUINIENTOS",
      "SEISCIENTOS",
      "SETECIENTOS",
      "OCHOCIENTOS",
      "NOVECIENTOS",
    ];

    const toWords = (n: number): string => {
      if (n === 0) return "CERO";
      if (n === 100) return "CIEN";
      if (n < 10) return unidades[n];
      if (n < 20) return especiales[n - 10];
      if (n < 30) {
        if (n === 20) return "VEINTE";
        return `VEINTI${unidades[n - 20].toLowerCase()}`.toUpperCase();
      }
      if (n < 100) {
        const d = Math.floor(n / 10);
        const u = n % 10;
        return u === 0 ? decenas[d] : `${decenas[d]} Y ${unidades[u]}`;
      }
      if (n < 1000) {
        const c = Math.floor(n / 100);
        const r = n % 100;
        return r === 0 ? centenas[c] : `${centenas[c]} ${toWords(r)}`;
      }
      if (n < 1_000_000) {
        const m = Math.floor(n / 1000);
        const r = n % 1000;
        const miles = m === 1 ? "MIL" : `${toWords(m)} MIL`;
        return r === 0 ? miles : `${miles} ${toWords(r)}`;
      }
      if (n < 1_000_000_000) {
        const m = Math.floor(n / 1_000_000);
        const r = n % 1_000_000;
        const millones = m === 1 ? "UN MILLON" : `${toWords(m)} MILLONES`;
        return r === 0 ? millones : `${millones} ${toWords(r)}`;
      }
      return "NUMERO FUERA DE RANGO";
    };

    const rounded = Math.round(value * 100) / 100;
    const entero = Math.floor(rounded);
    const cent = Math.round((rounded - entero) * 100);
    if (cent === 0) {
      return `${toWords(entero)} LEMPIRAS EXACTOS`;
    }
    const centStr = String(cent).padStart(2, "0");
    return `${toWords(entero)} LEMPIRAS CON ${centStr}/100`;
  };

  const totalEnLetras = numberToWordsEs(Number(data?.quote.total ?? 0));

  return (
    <RequireAuth>
      <>
        <AppShell
          title="Cotización interna"
          subtitle="Vista tipo hoja para revisión y control interno."
          crumbs={[
            { label: "Inicio", href: "/" },
            { label: "Cotizaciones", href: "/quotes" },
            { label: "Detalle" },
          ]}
          headerRight={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="surface" size="sm" onClick={() => router.push("/quotes")}>
                Volver
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => window.print()}
                className="no-print"
              >
                Descargar PDF
              </Button>
            </div>
          }
        >
          <style jsx global>{`
            @media print {
              @page {
                size: A4;
                margin: 10mm;
              }
              body {
                background: white !important;
              }
              header,
              aside,
              .no-print {
                display: none !important;
              }
              main {
                padding: 0 !important;
              }
              .a4-sheet {
                width: 210mm !important;
                height: 297mm !important;
                min-height: 297mm !important;
                padding: 8mm !important;
                box-shadow: none !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
              }
              .a4-card {
                height: 100% !important;
                padding: 6mm !important;
                overflow: hidden !important;
              }
              .a4-content {
                transform: scale(0.95);
                transform-origin: top left;
                width: calc(100% / 0.95);
              }
            }
          `}</style>

          {loading ? (
            <Card className="p-5">Cargando...</Card>
          ) : !data ? (
            <Card className="p-5">No se pudo cargar la cotización.</Card>
          ) : (
            <div className="relative">
              <div className="pointer-events-none absolute -top-20 right-6 h-64 w-64 rounded-full bg-[#38BDF8]/20 blur-3xl no-print" />
              <div className="pointer-events-none absolute top-40 -left-16 h-72 w-72 rounded-full bg-[#22C55E]/15 blur-3xl no-print" />

              <div className="a4-sheet rounded-2xl border border-[#CBD5F5] bg-[#F8FAFC] p-4">
                <div className="mx-auto w-full max-w-[820px]">
                  <div className="a4-card relative overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-6 text-[#0F172A] shadow-2xl">
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="rotate-[-25deg] text-4xl font-black uppercase tracking-[0.32em] text-[#E2E8F0]/50">
                        NO ES FACTURA
                      </div>
                    </div>

                    <div className="a4-content relative text-[11px]">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <img
                            src="/prodex-logo.png"
                            alt="Prodex"
                            className="h-12 w-auto object-contain"
                          />
                          <div>
                            <div className="text-base font-semibold">PRODEX</div>
                            <div className="text-xs text-[#475569]">Cost Intelligence System</div>
                            <div className="mt-2 text-[11px] text-[#475569]">
                              Razón social: —
                            </div>
                            <div className="text-[11px] text-[#475569]">RTN: —</div>
                            <div className="text-[11px] text-[#475569]">Dirección: —</div>
                            <div className="text-[11px] text-[#475569]">Tel: —</div>
                            <div className="text-[11px] text-[#475569]">Correo: —</div>
                            <div className="text-[11px] text-[#475569]">CAI: —</div>
                            <div className="text-[11px] text-[#475569]">
                              Rango autorizado: —
                            </div>
                            <div className="text-[11px] text-[#475569]">
                              Fecha límite emisión: —
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-base font-semibold uppercase">Factura</div>
                          <div className="text-xs text-[#475569]">
                            No. {data.quote.id.slice(0, 12).toUpperCase()}
                          </div>
                          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#CBD5F5] px-3 py-1 text-[11px]">
                            <span className="font-semibold">Estatus:</span>
                            <Badge variant="neutral">{data.quote.status}</Badge>
                          </div>
                          <div className="mt-2 text-[11px] text-[#475569]">
                            Fecha: {fmtDate(data.quote.created_at)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[11px]">
                        <div className="grid grid-cols-[100px_1fr_90px_1fr] gap-2">
                          <div className="font-semibold">CLIENTE:</div>
                          <div className="border-b border-[#CBD5F5]">&nbsp;</div>
                          <div className="font-semibold text-right">RTN:</div>
                          <div className="border-b border-[#CBD5F5]">&nbsp;</div>
                        </div>
                      </div>

                      <div className="mt-3 overflow-hidden rounded-lg border border-[#CBD5F5]">
                        <div className="grid grid-cols-[90px_1fr_120px_150px_110px] bg-[#1F2937] text-xs font-semibold text-white">
                          <div className="px-2 py-2 text-center">CANTIDAD</div>
                          <div className="px-2 py-2 text-center">DESCRIPCIÓN</div>
                          <div className="px-2 py-2 text-center">PRECIO UNITARIO</div>
                          <div className="px-2 py-2 text-center">DESCUENTOS</div>
                          <div className="px-2 py-2 text-center">TOTAL</div>
                        </div>
                        <div className="grid grid-cols-[90px_1fr_120px_150px_110px] bg-[#D9F0FF] text-[11px] text-[#0F172A]">
                          <div className="px-2 py-2 text-center">{qty}</div>
                          <div className="px-2 py-2">
                            <div className="font-semibold">{productLabel}</div>
                            <div className="text-[10px] text-[#475569]">
                              Diseño: {data.quote.inputs?.diseño ?? "-"}
                            </div>
                          </div>
                          <div className="px-2 py-2 text-right">{fmtL(unitPrice)}</div>
                          <div className="px-2 py-2 text-right">{fmtL(lineDiscount)}</div>
                          <div className="px-2 py-2 text-right">{fmtL(subtotalConDescuento)}</div>
                        </div>
                        <div className="h-[290px] bg-[#D9F0FF]" />
                        <div className="grid grid-cols-[90px_1fr_120px_150px_110px] border-t border-[#CBD5F5] bg-[#CDE9FF] text-[11px] font-semibold">
                          <div className="px-2 py-2 text-right col-span-4">TOTAL</div>
                          <div className="px-2 py-2 text-right">{fmtL(subtotalConDescuento)}</div>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
                        <div>
                          <div className="rounded-lg border border-[#CBD5F5] bg-[#F3F4F6] px-3 py-2 text-[11px]">
                            <span className="font-semibold">VALOR EN LETRAS:</span>{" "}
                            {totalEnLetras}
                          </div>

                          <div className="mt-2 text-[10px] text-[#475569]">
                            La factura es beneficio de todos “exíjala”.
                          </div>
                          <div className="mt-1 text-[10px] text-[#475569]">
                            Documento interno. No válido como factura fiscal.
                          </div>
                        </div>

                        <div className="rounded-lg border border-[#CBD5F5] bg-[#F3F4F6] px-3 py-2 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span>Importe exonerado</span>
                            <span>{fmtL(0)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Importe exento</span>
                            <span>{fmtL(0)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Importe gravado 15%</span>
                            <span>{fmtL(subtotalConDescuento)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>ISV 15%</span>
                            <span>{fmtL(data.quote.isv_amount)}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between border-t border-[#CBD5F5] pt-2 text-sm font-semibold text-[#B91C1C]">
                            <span>Total a pagar</span>
                            <span>{fmtL(data.quote.total)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {data && (
            <div className="no-print mt-6 space-y-4">
              <Card className="p-5">
                <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                  Desglose de costos (interno)
                </div>
                <div className="mt-3 overflow-hidden rounded-xl border border-[#334155] bg-[#0F172A]/80">
                  <table className="w-full text-xs text-[#E2E8F0]">
                    <thead className="bg-[#1E293B] text-[#94A3B8]">
                      <tr>
                        <th className="px-3 py-2 text-left">Insumo</th>
                        <th className="px-3 py-2 text-left">Unidad</th>
                        <th className="px-3 py-2 text-right">Cantidad</th>
                        <th className="px-3 py-2 text-right">Costo unitario</th>
                        <th className="px-3 py-2 text-right">Costo línea</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#334155]">
                      {data.lines.length === 0 ? (
                        <tr>
                          <td className="px-3 py-3 text-center text-[#94A3B8]" colSpan={5}>
                            Sin insumos registrados.
                          </td>
                        </tr>
                      ) : (
                        data.lines.map((line) => (
                          <tr key={line.supply_id}>
                            <td className="px-3 py-2">{line.supply_name}</td>
                            <td className="px-3 py-2">{line.unit_base}</td>
                            <td className="px-3 py-2 text-right">{line.qty}</td>
                            <td className="px-3 py-2 text-right">{fmtL(line.cost_per_unit)}</td>
                            <td className="px-3 py-2 text-right">{fmtL(line.line_cost)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <Card className="p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                    Insumos requeridos (interno)
                  </div>
                  <div className="mt-3 overflow-hidden rounded-xl border border-[#334155] bg-[#0F172A]/80">
                    <table className="w-full text-xs text-[#E2E8F0]">
                      <thead className="bg-[#1E293B] text-[#94A3B8]">
                        <tr>
                          <th className="px-3 py-2 text-left">Insumo</th>
                          <th className="px-3 py-2 text-right">Cantidad</th>
                          <th className="px-3 py-2 text-left">Unidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#334155]">
                        {data.lines.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-center text-[#94A3B8]" colSpan={3}>
                              Sin insumos registrados.
                            </td>
                          </tr>
                        ) : (
                          data.lines.map((line) => (
                            <tr key={`${line.supply_id}-req`}>
                              <td className="px-3 py-2">{line.supply_name}</td>
                              <td className="px-3 py-2 text-right">{line.qty}</td>
                              <td className="px-3 py-2">{line.unit_base}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                    Costos internos
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-[#94A3B8]">
                    <div className="flex items-center justify-between">
                      <span>Diseño</span>
                      <span>{fmtL(data.quote.design_cost)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-[#334155] pt-2 text-sm font-semibold text-[#E2E8F0]">
                      <span>Costo total</span>
                      <span>{fmtL(data.quote.cost_total)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Precio sugerido</span>
                      <span>{fmtL(data.quote.suggested_price)}</span>
                    </div>
                    {descuento > 0 && (
                      <div className="mt-2 rounded-lg border border-[#334155] p-2 text-xs text-[#94A3B8]">
                        <div className="font-semibold text-[#E2E8F0]">
                          Descuento: {descuentoPct.toFixed(2)}% ({fmtL(descuento)})
                        </div>
                        {descuentoLabel && <div>Tipo: {descuentoLabel}</div>}
                        {descuentoDetalle && <div>Motivo: {descuentoDetalle}</div>}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </AppShell>
      </>
    </RequireAuth>
  );
}
