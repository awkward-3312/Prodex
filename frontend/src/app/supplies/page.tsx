"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { RequireAuth } from "@/components/RequireAuth";

type Supply = {
  id: string;
  name: string;
  unit_base: string;
  cost_per_unit: number;
  stock: number;
};

function PurchaseRow({
  supplyId,
  onAdd,
}: {
  supplyId: string;
  onAdd: (supplyId: string, qty: number, totalCost: number) => void;
}) {
  const [qty, setQty] = useState(0);
  const [totalCost, setTotalCost] = useState(0);

  return (
    <div className="flex flex-wrap gap-2 items-end">
      <div className="flex flex-col">
        <label className="text-xs opacity-70">Qty (unidad base)</label>
        <input
          className="border p-2 w-40"
          type="number"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />
      </div>

      <div className="flex flex-col">
        <label className="text-xs opacity-70">Costo total (L)</label>
        <input
          className="border p-2 w-40"
          type="number"
          value={totalCost}
          onChange={(e) => setTotalCost(Number(e.target.value))}
        />
      </div>

      <button
        className="bg-green-600 text-white px-3 py-2 rounded"
        onClick={() => onAdd(supplyId, qty, totalCost)}
      >
        Registrar compra
      </button>
    </div>
  );
}

export default function SuppliesPage() {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [name, setName] = useState("");
  const [unitBase, setUnitBase] = useState("u");

  const API = process.env.NEXT_PUBLIC_API_URL;

  const loadSupplies = async () => {
    try {
    const res = await apiFetch(`${API}/supplies`, { cache: "no-store" });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("loadSupplies error:", res.status, data);
      alert(`Error ${res.status}: ${data?.error ?? "No autorizado / fallo en backend"}`);
      return;
    }

    setSupplies(data as Supply[]);
  } catch (err) {
    console.error("Network/JS error:", err);
    alert("Error de red: no se pudo conectar al backend");
    }
  };

  const createSupply = async () => {
    await apiFetch(`${API}/supplies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        unitBase,
        costPerUnit: 0,
        stock: 0,
      }),
    });

    setName("");
    await loadSupplies();
  };

  const addPurchase = async (supplyId: string, qty: number, totalCost: number) => {
    try {
      const res = await apiFetch(`${API}/supplies/${supplyId}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty, totalCost }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("addPurchase error:", res.status, data);
        alert(`Error ${res.status}: ${data?.error ?? "No se pudo registrar la compra"}`);
        return;
      }

      await loadSupplies();
      alert("Compra registrada ✅");
    } catch (err) {
      console.error("Network/JS error:", err);
      alert("Error de red: no se pudo conectar al backend");
    }
  };

  useEffect(() => {
    void loadSupplies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
  <RequireAuth>
    <main className="min-h-screen p-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Insumos</h1>
        <p className="text-sm opacity-70">
          Crea insumos (sin costo/stock manual) y registra compras para actualizar stock y costo
          promedio ponderado.
        </p>
      </header>

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

        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={createSupply}
        >
          Crear insumo
        </button>
      </section>

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

              <PurchaseRow supplyId={s.id} onAdd={addPurchase} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  </RequireAuth>
  );
}
