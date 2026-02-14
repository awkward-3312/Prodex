"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { toast } from "@/lib/alerts";

type Role = "admin" | "supervisor" | "vendedor";

type Supply = {
  id: string;
  name: string;
  unit_base: string;
  cost_per_unit: number;
  stock: number;
  default_consumption?: number | null;
  default_rounding?: "none" | "ceil" | null;
};

function PurchaseRow({
  supplyId,
  canEdit,
  onAdd,
}: {
  supplyId: string;
  canEdit: boolean;
  onAdd: (supplyId: string, qty: number, totalCost: number) => void;
}) {
  const [qty, setQty] = useState(0);
  const [totalCost, setTotalCost] = useState(0);

  return (
    <div className="flex flex-wrap gap-2 items-end rounded-xl border border-[#334155] bg-[#0B1220]/80 p-3">
      <div className="flex flex-col">
        <label className="text-xs text-[#94A3B8]">Qty (unidad base)</label>
        <Input
          className="w-40"
          type="number"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          disabled={!canEdit}
        />
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-[#94A3B8]">Costo total (L)</label>
        <Input
          className="w-40"
          type="number"
          value={totalCost}
          onChange={(e) => setTotalCost(Number(e.target.value))}
          disabled={!canEdit}
        />
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onAdd(supplyId, qty, totalCost)}
        disabled={!canEdit}
      >
        Registrar compra
      </Button>
    </div>
  );
}

export default function SuppliesPage() {
  const API = process.env.NEXT_PUBLIC_API_URL;

  const [role, setRole] = useState<Role | null>(null);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [name, setName] = useState("");
  const [unitBase, setUnitBase] = useState("u");
  const [defaultConsumption, setDefaultConsumption] = useState<number | "">("");
  const [defaultRounding, setDefaultRounding] = useState<"none" | "ceil">("none");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canEdit = useMemo(() => role === "admin" || role === "supervisor", [role]);

  const loadMe = async () => {
    try {
      const res = await apiFetch(`${API}/me`);
      const data = (await res.json().catch(() => null)) as unknown;

      if (!res.ok || !data || typeof data !== "object" || !("role" in data)) {
        setRole(null);
        return;
      }

      const r = String((data as { role: unknown }).role) as Role;
      setRole(r);
    } catch {
      setRole(null);
    }
  };

  const loadSupplies = async () => {
    try {
      setErrorMsg(null);

      const res = await apiFetch(`${API}/supplies`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as unknown;

      if (!res.ok) {
        setSupplies([]);

        let msg = "No se pudo cargar";
        if (typeof data === "object" && data !== null && "error" in data) {
          msg = String((data as { error?: unknown }).error ?? msg);
        }

        setErrorMsg(`Error ${res.status}: ${msg}`);
        return;
      }

      setSupplies(Array.isArray(data) ? (data as Supply[]) : []);
    } catch (err) {
      console.error("loadSupplies network error:", err);
      setSupplies([]);
      setErrorMsg("Error de red: no se pudo conectar al backend.");
    }
  };

  const createSupply = async () => {
    if (!canEdit) return;

    const payload: Record<string, unknown> = {
      name,
      unitBase,
      costPerUnit: 0,
      stock: 0,
    };

    if (defaultConsumption !== "") {
      payload.defaultConsumption = Number(defaultConsumption);
      payload.defaultRounding = defaultRounding;
    }

    const res = await apiFetch(`${API}/supplies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      const d: unknown = raw
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return raw;
            }
          })()
        : null;
      let msg = String(res.status);

      if (typeof d === "object" && d !== null && "error" in d) {
        msg = String((d as { error?: unknown }).error ?? msg);
      } else if (typeof d === "string" && d) {
        msg = d;
      }

      toast("error", `No autorizado o error: ${msg}`);
      return;
    }

    setName("");
    setDefaultConsumption("");
    setDefaultRounding("none");
    await loadSupplies();
    toast("success", "Insumo creado");
  };

  const addPurchase = async (supplyId: string, qty: number, totalCost: number) => {
    if (!canEdit) return;

    if (!Number.isFinite(qty) || qty <= 0) {
      toast("error", "Cantidad inválida");
      return;
    }
    if (!Number.isFinite(totalCost) || totalCost < 0) {
      toast("error", "Costo total inválido");
      return;
    }

    const res = await apiFetch(`${API}/supplies/${supplyId}/purchases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qty, totalCost }),
    });

    const data = (await res.json().catch(() => null)) as unknown;

    if (!res.ok) {
      let msg = "No se pudo registrar la compra";
      if (typeof data === "object" && data !== null && "error" in data) {
        msg = String((data as { error?: unknown }).error ?? msg);
      }
      toast("error", `Error ${res.status}: ${msg}`);
      return;
    }

    await loadSupplies();
    toast("success", "Compra registrada");
  };

  useEffect(() => {
    void (async () => {
      await loadMe();
      await loadSupplies();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RequireAuth>
      <AppShell
        title="Insumos"
        subtitle="Gestiona inventario, costos y compras con trazabilidad."
        crumbs={[
          { label: "Inicio", href: "/" },
          { label: "Insumos" },
        ]}
      >
        <div className="relative space-y-6">
          <div className="pointer-events-none absolute -top-20 right-6 h-64 w-64 rounded-full bg-[#38BDF8]/15 blur-3xl" />
          <div className="pointer-events-none absolute top-52 -left-10 h-72 w-72 rounded-full bg-[#22C55E]/10 blur-3xl" />

          {errorMsg && (
            <Card variant="muted" className="p-4">
              <div className="text-sm text-[#38BDF8]" aria-live="polite">
                {errorMsg}
              </div>
            </Card>
          )}

          {canEdit ? (
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">Crear insumo</h2>
                  <p className="text-xs text-[#94A3B8]">
                    Define unidad, consumo por defecto y redondeo opcional.
                  </p>
                </div>
                <Button variant="primary" onClick={createSupply}>
                  Crear insumo
                </Button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  placeholder="Nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />

                <Select value={unitBase} onChange={(e) => setUnitBase(e.target.value)}>
                  <option value="u">Unidad</option>
                  <option value="hoja">Hoja</option>
                  <option value="ml">Mililitros</option>
                  <option value="m">Metros</option>
                  <option value="m2">Metros²</option>
                </Select>

                <Input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Consumo por unidad (opcional)"
                  value={defaultConsumption}
                  onChange={(e) =>
                    setDefaultConsumption(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />

                <Select
                  value={defaultRounding}
                  onChange={(e) => setDefaultRounding(e.target.value as "none" | "ceil")}
                >
                  <option value="none">Sin redondeo</option>
                  <option value="ceil">Redondear hacia arriba</option>
                </Select>
              </div>
            </Card>
          ) : (
            <Card variant="muted" className="p-4">
              <div className="text-sm text-[#94A3B8]">
                Vista solo lectura (vendedor). Para crear/compras necesitas admin/supervisor.
              </div>
            </Card>
          )}

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Lista</h2>
              <span className="text-xs text-[#94A3B8]">{supplies.length} insumos</span>
            </div>

            <ul className="mt-4 space-y-3">
              {supplies.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-[#334155] bg-[#0F172A]/70 p-4"
                >
                  <div className="flex flex-col gap-1">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-[#94A3B8]">
                      Unidad: {s.unit_base} — Costo: L {Number(s.cost_per_unit).toFixed(4)} — Stock:{" "}
                      {Number(s.stock).toFixed(4)}
                    </div>
                    <div className="text-xs text-[#64748B]">
                      Consumo por unidad:{" "}
                      {s.default_consumption != null
                        ? `${Number(s.default_consumption)}${s.default_rounding === "ceil" ? " (ceil)" : ""}`
                        : "-"}
                    </div>
                  </div>

                  <div className="mt-4">
                    <PurchaseRow supplyId={s.id} canEdit={canEdit} onAdd={addPurchase} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
