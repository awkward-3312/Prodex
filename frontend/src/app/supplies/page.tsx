"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { RequireAuth } from "@/components/RequireAuth";

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
        <label className="text-xs opacity-70">Qty (unidad base)</label>
        <input
          className="border p-2 w-40 rounded"
          type="number"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          disabled={!canEdit}
        />
      </div>

      <div className="flex flex-col">
        <label className="text-xs opacity-70">Costo total (L)</label>
        <input
          className="border p-2 w-40 rounded"
          type="number"
          value={totalCost}
          onChange={(e) => setTotalCost(Number(e.target.value))}
          disabled={!canEdit}
        />
      </div>

      <button
        className="bg-green-600 text-white px-3 py-2 rounded disabled:opacity-50"
        onClick={() => onAdd(supplyId, qty, totalCost)}
        disabled={!canEdit}
      >
        Registrar compra
      </button>
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

      alert(`No autorizado o error: ${msg}`);
      return;
    }

    setName("");
    await loadSupplies();
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
      alert(`Error ${res.status}: ${msg}`);
      return;
    }

    await loadSupplies();
    alert("Compra registrada ✅");
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
      <main className="min-h-screen p-8 space-y-8">
        <header>
          <h1 className="text-2xl font-semibold">Insumos</h1>
          <div className="text-sm opacity-70">Rol: {role ?? "..."}</div>
          {errorMsg && <div className="text-red-600 text-sm mt-2">{errorMsg}</div>}
        </header>

        {canEdit ? (
          <section className="space-y-3 max-w-md border rounded-lg p-4">
            <h2 className="font-semibold">Crear insumo</h2>

            <input
              className="border p-2 w-full rounded"
              placeholder="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <select
              className="border p-2 w-full rounded"
              value={unitBase}
              onChange={(e) => setUnitBase(e.target.value)}
            >
              <option value="u">Unidad</option>
              <option value="hoja">Hoja</option>
              <option value="ml">Mililitros</option>
              <option value="m">Metros</option>
              <option value="m2">Metros²</option>
            </select>

            <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={createSupply}>
              Crear insumo
            </button>
          </section>
        ) : (
          <div className="text-sm opacity-70">
            Vista solo lectura (vendedor). Para crear/compras necesitas admin/supervisor.
          </div>
        )}

        <section className="space-y-3">
          <h2 className="font-semibold">Lista</h2>

          <ul className="space-y-3">
            {supplies.map((s) => (
              <li key={s.id} className="border p-4 rounded-lg space-y-2">
                <div className="flex flex-col gap-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-sm opacity-80">
                    Unidad: {s.unit_base} — Costo: L {Number(s.cost_per_unit).toFixed(4)} — Stock:{" "}
                    {Number(s.stock).toFixed(4)}
                  </div>
                </div>

                <PurchaseRow supplyId={s.id} canEdit={canEdit} onAdd={addPurchase} />
              </li>
            ))}
          </ul>
        </section>
      </main>
    </RequireAuth>
  );
}