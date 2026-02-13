"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";

type DesignLevel = "cliente" | "simple" | "medio" | "pro";

type PreviewResponse = {
  breakdown: Array<{
    supplyName: string;
    unitBase: string;
    qty: number;
    costPerUnit: number;
    lineCost: number;
    formula: string;
  }>;
  totals: {
    materialsCost: number;
    wasteCost: number;
    operationalCost: number;
    designCost: number;
    costTotal: number;
    minPrice: number;
    suggestedPrice: number;
    profit: number;
    marginReal: number;
    applyIsv: boolean;
    isvRate: number;
    isv: number;
    total: number;
  };
};

type CreateQuoteResponse = {
  quoteId: string;
  quote: {
    id: string;
    status: string;
    price_final: number;
    isv_amount: number;
    total: number;
    expires_at: string;
  };
};

type MissingItem = {
  supplyId: string;
  name: string;
  needed: number;
  available: number;
};

type ConvertOk = { ok: true; quote: { id: string; status: string } };
type ConvertErr = { error: string; missing?: MissingItem[] };
type ConvertResponse = ConvertOk | ConvertErr;

export default function QuotePreviewPage() {
  const API = process.env.NEXT_PUBLIC_API_URL!;
  const router = useRouter();

  const [productId, setProductId] = useState<string>("");
  const [cantidad, setCantidad] = useState<number>(1);
  const [design, setDesign] = useState<DesignLevel>("cliente");
  const [applyIsv, setApplyIsv] = useState<boolean>(false);

  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [saved, setSaved] = useState<CreateQuoteResponse | null>(null);

  // (Opcional) estado para ver /me
  const [meInfo, setMeInfo] = useState<{ userId: string; role: string } | null>(null);

  // ✅ aquí va el /me (NO await suelto)
  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const res = await apiFetch(`${API}/me`);
        const raw = await res.text().catch(() => "");
        const data: unknown = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;

        if (!alive) return;

        if (!res.ok) {
          console.warn("GET /me error:", res.status, data);
          setMeInfo(null);
          return;
        }

        // esperado: { userId, role }
        if (typeof data === "object" && data !== null && "userId" in data && "role" in data) {
          const d = data as { userId: string; role: string };
          setMeInfo({ userId: String(d.userId), role: String(d.role) });
        } else {
          setMeInfo(null);
        }
      } catch (e) {
        console.warn("GET /me network error:", e);
        setMeInfo(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [API]);

  const testMe = async () => {
    const res = await apiFetch(`${API}/me`);
    const data = await res.json().catch(() => null);
    console.log("ME:", res.status, data);
    alert(`ME ${res.status}: ${JSON.stringify(data)}`);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const preview = async () => {
    setSaved(null);

    try {
      const res = await apiFetch(`${API}/quotes/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          inputs: { cantidad, diseño: design },
          applyIsv,
          isvRate: 0.15,
        }),
      });

      const data = (await res.json().catch(() => null)) as unknown;

      if (!res.ok) {
        const errMsg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "No se pudo cotizar")
            : typeof data === "string"
            ? data
            : "No se pudo cotizar";
        console.error("preview error:", res.status, data);
        alert(`Error ${res.status}: ${errMsg}`);
        return;
      }

      setResult(data as PreviewResponse);
    } catch (e) {
      console.error(e);
      alert("Error de red");
    }
  };

  const saveQuote = async () => {
    try {
      const res = await apiFetch(`${API}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          inputs: { cantidad, diseño: design },
          applyIsv,
          isvRate: 0.15,
        }),
      });

      const data = (await res.json().catch(() => null)) as unknown;

      if (!res.ok) {
        const errMsg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "No se pudo guardar")
            : "No se pudo guardar";
        console.error("save quote error:", res.status, data);
        alert(`Error ${res.status}: ${errMsg}`);
        return;
      }

      const savedData = data as CreateQuoteResponse;
      setSaved(savedData);
      alert(`Cotización guardada ✅\nID: ${savedData.quoteId}`);
    } catch (e) {
      console.error(e);
      alert("Error de red");
    }
  };

  const convertToOrder = async () => {
  if (!saved?.quoteId) return;

  try {
    // ✅ si es vendedor, pedimos credenciales de supervisor
    let body: { supervisorEmail: string; supervisorPassword: string } | undefined;

    if (meInfo?.role === "vendedor") {
      const supervisorEmail = window.prompt("Email del supervisor:");
      if (!supervisorEmail) return;

      const supervisorPassword = window.prompt("Contraseña del supervisor:");
      if (!supervisorPassword) return;

      body = { supervisorEmail, supervisorPassword };
    }

    const res = await apiFetch(`${API}/quotes/${saved.quoteId}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await res.json().catch(() => null)) as unknown;

    if (!res.ok) {
      let errMsg = "No se pudo convertir";
      let missing: MissingItem[] | undefined;

      if (typeof data === "object" && data !== null) {
        const d = data as Partial<ConvertErr>;
        if (d.error) errMsg = String(d.error);

        if (Array.isArray(d.missing)) {
          missing = d.missing.map((m) => ({
            supplyId: String((m as Partial<MissingItem>).supplyId ?? ""),
            name: String((m as Partial<MissingItem>).name ?? ""),
            needed: Number((m as Partial<MissingItem>).needed ?? 0),
            available: Number((m as Partial<MissingItem>).available ?? 0),
          }));
        }
      }

      if (missing?.length) {
        const msg = missing
          .map((m) => `${m.name}: necesitas ${m.needed}, hay ${m.available}`)
          .join("\n");
        alert(`Stock insuficiente:\n${msg}`);
      } else {
        alert(`Error ${res.status}: ${errMsg}`);
      }
      return;
    }

    const okData = data as ConvertResponse;
    if ("ok" in okData && okData.ok) {
      alert("Convertido a pedido ✅ (stock descontado)");
      setSaved((prev) =>
        prev ? { ...prev, quote: { ...prev.quote, status: "converted" } } : prev
      );
    }
  } catch (e) {
    console.error(e);
    alert("Error de red");
  }
};

  return (
    <RequireAuth>
      <main className="min-h-screen p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div className="text-xs opacity-70">
            {meInfo ? (
              <>
                user: <span className="font-medium">{meInfo.userId}</span> — role:{" "}
                <span className="font-medium">{meInfo.role}</span>
              </>
            ) : (
              <>user: (sin /me)</>
            )}
          </div>

          <div className="flex gap-2">
            <button className="border px-3 py-1 rounded" onClick={testMe}>
              Probar /me
            </button>
            <button
              className="text-red-600 border border-red-600 px-3 py-1 rounded"
              onClick={logout}
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        <h1 className="text-2xl font-semibold">Cotización (preview + guardar + convertir)</h1>

        <div className="border rounded-lg p-4 max-w-xl space-y-3">
          <div className="space-y-1">
            <label className="text-sm opacity-70">Product ID</label>
            <input
              className="border p-2 w-full rounded"
              placeholder="Pega aquí el productId (uuid)"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col">
              <label className="text-sm opacity-70">Cantidad</label>
              <input
                className="border p-2 rounded w-40"
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(Number(e.target.value))}
                min={1}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm opacity-70">Diseño</label>
              <select
                className="border p-2 rounded w-44"
                value={design}
                onChange={(e) => setDesign(e.target.value as DesignLevel)}
              >
                <option value="cliente">Cliente trae</option>
                <option value="simple">Simple (L300)</option>
                <option value="medio">Medio (L500)</option>
                <option value="pro">Pro (L700)</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <input
                id="isv"
                type="checkbox"
                checked={applyIsv}
                onChange={(e) => setApplyIsv(e.target.checked)}
              />
              <label htmlFor="isv" className="text-sm">
                Aplicar ISV 15%
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            onClick={preview}
              disabled={!productId.trim()}
            >
              Calcular (preview)
            </button>

            <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={saveQuote}>
              Guardar cotización
            </button>

            <button
              className="bg-purple-600 text-white px-4 py-2 rounded disabled:opacity-50"
              onClick={convertToOrder}
              disabled={!saved?.quoteId}
            >
              Convertir a pedido
            </button>
          </div>
        </div>

        {saved && (
          <div className="border rounded-lg p-4 max-w-xl space-y-2">
            <h2 className="font-semibold">Cotización guardada</h2>
            <div className="text-sm">ID: {saved.quoteId}</div>
            <div className="text-sm">Estado: {saved.quote.status}</div>
            <div className="text-sm">Subtotal: L {Number(saved.quote.price_final).toFixed(2)}</div>
            <div className="text-sm">ISV: L {Number(saved.quote.isv_amount).toFixed(2)}</div>
            <div className="font-medium">Total: L {Number(saved.quote.total).toFixed(2)}</div>
            <div className="text-xs opacity-70">Expira: {saved.quote.expires_at}</div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h2 className="font-semibold mb-2">Desglose (preview)</h2>
              <div className="space-y-2">
                {result.breakdown.map((b, idx) => (
                  <div key={idx} className="text-sm border rounded p-2">
                    <div className="font-medium">{b.supplyName}</div>
                    <div className="opacity-80">
                      qty: {b.qty} {b.unitBase} — cpu: L {b.costPerUnit.toFixed(4)} — costo: L{" "}
                      {b.lineCost.toFixed(4)}
                    </div>
                    <div className="opacity-60">fórmula: {b.formula}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h2 className="font-semibold mb-2">Totales (preview)</h2>
              <div className="text-sm space-y-1">
                <div>Materiales: L {result.totals.materialsCost.toFixed(4)}</div>
                <div>Merma: L {result.totals.wasteCost.toFixed(4)}</div>
                <div>Operativo: L {result.totals.operationalCost.toFixed(4)}</div>
                <div>Diseño: L {result.totals.designCost.toFixed(2)}</div>
                <hr className="my-2" />
                <div className="font-medium">Costo total: L {result.totals.costTotal.toFixed(4)}</div>
                <div>Precio mínimo: L {result.totals.minPrice.toFixed(4)}</div>
                <div>Precio sugerido: L {result.totals.suggestedPrice.toFixed(4)}</div>
                <div>Utilidad: L {result.totals.profit.toFixed(4)}</div>
                <div>Margen real: {(result.totals.marginReal * 100).toFixed(2)}%</div>
                <hr className="my-2" />
                <div>ISV: L {result.totals.isv.toFixed(4)}</div>
                <div className="font-medium">Total: L {result.totals.total.toFixed(4)}</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </RequireAuth>
  );
}