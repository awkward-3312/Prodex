"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/lib/alerts";

type Role = "admin" | "supervisor" | "vendedor";

type Supply = {
  id: string;
  name: string;
  unit_base: string;
  cost_per_unit: number;
  stock: number;
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
    <div className="flex flex-wrap gap-2 items-end">
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

    const res = await apiFetch(`${API}/supplies`, {
      method: "POST",
      body: JSON.stringify({
        name,
        unitBase,
        costPerUnit: 0,
        stock: 0,
      }),
    });

    if (!res.ok) {
      const d = (await res.json().catch(() => null)) as unknown;
      let msg = String(res.status);

      if (typeof d === "object" && d !== null && "error" in d) {
        msg = String((d as { error?: unknown }).error ?? msg);
      }

      toast("error", `No autorizado o error: ${msg}`);
      return;
    }

    setName("");
    await loadSupplies();
    toast("success", "Insumo creado");
  };

  const addPurchase = async (supplyId: string, qty: number, totalCost: number) => {
    if (!canEdit) return;

    const res = await apiFetch(`${API}/supplies/${supplyId}/purchases`, {
      method: "POST",
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
        headerRight={<Badge variant="neutral">Rol: {role ?? "..."}</Badge>}
      >
        {errorMsg && (
          <Card variant="muted" className="p-4">
            <div className="text-sm text-[#38BDF8]" aria-live="polite">
              {errorMsg}
            </div>
          </Card>
        )}

        {canEdit ? (
          <Card className="max-w-md p-5">
            <h2 className="font-semibold">Crear insumo</h2>

            <div className="mt-3 space-y-3">
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

              <Button variant="primary" onClick={createSupply}>
                Crear insumo
              </Button>
            </div>
          </Card>
        ) : (
          <Card variant="muted" className="p-4">
            <div className="text-sm text-[#94A3B8]">
              Vista solo lectura (vendedor). Para crear/compras necesitas admin/supervisor.
            </div>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="font-semibold">Lista</h2>

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
                </div>

                <div className="mt-3">
                  <PurchaseRow supplyId={s.id} canEdit={canEdit} onAdd={addPurchase} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </AppShell>
    </RequireAuth>
  );
}
