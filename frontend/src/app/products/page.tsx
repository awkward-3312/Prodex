"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  default_consumption?: number | null;
  default_rounding?: "none" | "ceil" | null;
};

type ProductRow = {
  id: string;
  name: string;
  created_at?: string;
};

type ProductItem = {
  supplyId: string;
  qtyFormula: string;
};

const evalFormula = (raw: string, cantidad: number) => {
  if (!Number.isFinite(cantidad) || cantidad < 0) {
    throw new Error("Cantidad inválida");
  }
  if (!/^[0-9+\-*/().\s_a-zA-Z]+$/.test(raw)) {
    throw new Error("Fórmula inválida");
  }
  const expr = raw.replaceAll("cantidad", String(cantidad));
  // eslint-disable-next-line no-new-func
  const fn = new Function("ceil", `return (${expr});`);
  const val = Number(fn(Math.ceil));
  if (!Number.isFinite(val) || val < 0) throw new Error("Resultado inválido");
  return val;
};

export default function ProductsPage() {
  const API = process.env.NEXT_PUBLIC_API_URL;
  const router = useRouter();

  const [role, setRole] = useState<Role | null>(null);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [name, setName] = useState("");
  const [wastePct, setWastePct] = useState(5);
  const [marginPct, setMarginPct] = useState(40);
  const [operationalPct, setOperationalPct] = useState(0);
  const [items, setItems] = useState<ProductItem[]>([]);
  const [selectedSupplyId, setSelectedSupplyId] = useState("");
  const baseQty = 1;
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
      const res = await apiFetch(`${API}/supplies`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "No se pudo cargar")
            : "No se pudo cargar";
        toast("error", msg);
        setSupplies([]);
        return;
      }
      setSupplies(Array.isArray(data) ? (data as Supply[]) : []);
    } catch (e) {
      console.error("load supplies error:", e);
      toast("error", "Error de red cargando insumos");
    }
  };

  const loadProducts = async () => {
    try {
      const res = await apiFetch(`${API}/products`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "No se pudo cargar")
            : "No se pudo cargar";
        toast("error", msg);
        setProducts([]);
        return;
      }
      setProducts(Array.isArray(data) ? (data as ProductRow[]) : []);
    } catch (e) {
      console.error("load products error:", e);
      toast("error", "Error de red cargando productos");
    }
  };

  const loadProductDetail = async (productId: string) => {
    try {
      const res = await apiFetch(`${API}/products/${productId}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok || !data || typeof data !== "object") {
        const msg =
          data && typeof data === "object" && "error" in data
            ? String((data as { error?: unknown }).error ?? "No se pudo cargar")
            : "No se pudo cargar";
        toast("error", msg);
        return;
      }

      const payload = data as {
        product?: { id: string; name?: string };
        template?: { waste_pct?: number; margin_pct?: number; operational_pct?: number } | null;
        items?: Array<{ supply_id?: string; qty_formula?: string }>;
      };

      setEditingId(productId);
      setName(payload.product?.name ?? "");
      setWastePct(Number(payload.template?.waste_pct ?? 0.05) * 100);
      setMarginPct(Number(payload.template?.margin_pct ?? 0.4) * 100);
      setOperationalPct(Number(payload.template?.operational_pct ?? 0) * 100);
      setItems(
        Array.isArray(payload.items)
          ? payload.items.map((it) => ({
              supplyId: String(it.supply_id ?? ""),
              qtyFormula: String(it.qty_formula ?? "cantidad"),
            }))
          : []
      );
    } catch (e) {
      console.error("load product detail error:", e);
      toast("error", "Error de red cargando producto");
    }
  };

  useEffect(() => {
    void (async () => {
      await loadMe();
      await loadSupplies();
      await loadProducts();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (role === "vendedor") {
      router.replace("/unauthorized");
    }
  }, [role, router]);

  const addItem = async () => {
    if (!selectedSupplyId) {
      toast("error", "Selecciona un insumo");
      return;
    }
    if (items.some((it) => it.supplyId === selectedSupplyId)) {
      toast("warning", "Ese insumo ya está agregado");
      return;
    }

    const autoFormula = await fetchDefaultFormula(selectedSupplyId);
    setItems((prev) => [...prev, { supplyId: selectedSupplyId, qtyFormula: autoFormula }]);
    setSelectedSupplyId("");
  };

  const removeItem = (supplyId: string) => {
    setItems((prev) => prev.filter((it) => it.supplyId !== supplyId));
  };

  const submitProduct = async () => {
    if (!canEdit) return;
    if (!name.trim()) {
      toast("error", "Nombre requerido");
      return;
    }
    if (items.length === 0) {
      toast("error", "Agrega al menos un insumo");
      return;
    }
    for (const it of items) {
      try {
        evalFormula(it.qtyFormula, baseQty);
      } catch {
        const label = supplyById.get(it.supplyId)?.name ?? it.supplyId;
        toast("error", `Fórmula inválida en insumo: ${label}`);
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        wastePct: Number(wastePct) / 100,
        marginPct: Number(marginPct) / 100,
        operationalPct: Number(operationalPct) / 100,
        items,
      };

      const isEdit = Boolean(editingId);
      const url = isEdit ? `${API}/products/${editingId}` : `${API}/products`;

      const res = await apiFetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as unknown;

      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "No se pudo crear")
            : "No se pudo crear";
        toast("error", msg);
        return;
      }

      toast("success", isEdit ? "Producto actualizado" : "Producto creado");
      setName("");
      setItems([]);
      setSelectedSupplyId("");
      setEditingId(null);
      await loadProducts();
    } catch (e) {
      console.error("create product error:", e);
      toast("error", "Error de red guardando producto");
    } finally {
      setLoading(false);
    }
  };

  const supplyById = useMemo(() => new Map(supplies.map((s) => [s.id, s])), [supplies]);
  const fetchDefaultFormula = async (supplyId: string) => {
    try {
      const res = await apiFetch(`${API}/supplies/${supplyId}/default-formula`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (res.ok && data && typeof data === "object" && "qtyFormula" in data) {
        return String((data as { qtyFormula?: unknown }).qtyFormula ?? "cantidad");
      }
    } catch {
      // ignore and fallback
    }
    return "cantidad";
  };

  return (
    <RequireAuth>
      <AppShell
        title="Productos"
        subtitle="Crea productos y define qué insumos consume cada uno."
        crumbs={[
          { label: "Inicio", href: "/" },
          { label: "Productos" },
        ]}
      >
        <div className="relative space-y-6">
          <div className="pointer-events-none absolute -top-20 right-6 h-64 w-64 rounded-full bg-[#38BDF8]/15 blur-3xl" />
          <div className="pointer-events-none absolute top-52 -left-10 h-72 w-72 rounded-full bg-[#22C55E]/10 blur-3xl" />

          {!canEdit && (
            <Card variant="muted" className="p-4">
              <div className="text-sm text-[#94A3B8]">
                Vista solo lectura. Para crear productos necesitas admin/supervisor.
              </div>
            </Card>
          )}

          <Card className="p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-base font-semibold">Nuevo producto</div>
                <div className="text-xs text-[#94A3B8]">
                  Define insumos y fórmulas (usa la variable <code>cantidad</code>).
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {editingId && (
                  <Button
                    variant="surface"
                    onClick={() => {
                      setEditingId(null);
                      setName("");
                      setItems([]);
                      setSelectedSupplyId("");
                      setWastePct(5);
                      setMarginPct(40);
                      setOperationalPct(0);
                    }}
                  >
                    Cancelar edición
                  </Button>
                )}
                <Button variant="primary" onClick={submitProduct} disabled={!canEdit || loading}>
                  {loading ? "Guardando..." : editingId ? "Guardar cambios" : "Crear producto"}
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[#94A3B8]">Nombre del producto</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-xs text-[#94A3B8]">Merma (%)</label>
                    <Input
                      type="number"
                      value={wastePct}
                      onChange={(e) => setWastePct(Number(e.target.value))}
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#94A3B8]">Margen (%)</label>
                    <Input
                      type="number"
                      value={marginPct}
                      onChange={(e) => setMarginPct(Number(e.target.value))}
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#94A3B8]">Operativo (%)</label>
                    <Input
                      type="number"
                      value={operationalPct}
                      onChange={(e) => setOperationalPct(Number(e.target.value))}
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#334155] bg-[#0F172A]/70 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                  Agregar insumo
                </div>
                <div className="mt-3 grid gap-3">
                  <Select
                    value={selectedSupplyId}
                    onChange={(e) => setSelectedSupplyId(e.target.value)}
                    disabled={!canEdit}
                  >
                    <option value="">Selecciona un insumo</option>
                    {supplies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.unit_base})
                      </option>
                    ))}
                  </Select>

                  <div className="rounded-lg border border-[#334155] bg-[#0B1220] px-3 py-2 text-xs">
                    <div className="text-[#94A3B8]">
                      El sistema genera automáticamente la fórmula por insumo.
                    </div>
                    <div className="mt-1 text-[#64748B]">
                      Puedes ver el resultado en la tabla de abajo.
                    </div>
                  </div>

                  <Button variant="secondary" onClick={addItem} disabled={!canEdit}>
                    Agregar
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-[#334155] pt-6">
              <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                Insumos del producto
              </div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <div className="text-xs text-[#94A3B8]">
                  Consumo por unidad (cantidad = {baseQty}).
                </div>
              </div>
              <div className="mt-3 overflow-hidden rounded-xl border border-[#334155]">
                <table className="w-full text-xs text-[#E2E8F0]">
                  <thead className="bg-[#1E293B] text-[#94A3B8]">
                    <tr>
                      <th className="px-3 py-2 text-left">Insumo</th>
                      <th className="px-3 py-2 text-left">Unidad</th>
                      <th className="px-3 py-2 text-left">Fórmula</th>
                      <th className="px-3 py-2 text-right">Consumo por unidad</th>
                      <th className="px-3 py-2 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#334155]">
                    {items.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-center text-[#94A3B8]" colSpan={5}>
                          Aún no has agregado insumos.
                        </td>
                      </tr>
                    ) : (
                      items.map((it) => {
                        const supply = supplyById.get(it.supplyId);
                        let preview = "";
                        let hasError = false;
                        try {
                          const base = Number(supply?.default_consumption);
                          if (Number.isFinite(base) && base > 0) {
                            preview = String(base);
                          } else {
                            preview = String(evalFormula(it.qtyFormula, baseQty));
                          }
                        } catch {
                          preview = "Error";
                          hasError = true;
                        }
                        return (
                          <tr key={it.supplyId}>
                            <td className="px-3 py-2">{supply?.name ?? it.supplyId}</td>
                            <td className="px-3 py-2">{supply?.unit_base ?? "-"}</td>
                            <td className="px-3 py-2">
                              <span className="text-[#E2E8F0]">{it.qtyFormula}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={hasError ? "text-[#F87171]" : ""}>{preview}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                variant="surface"
                                size="sm"
                                onClick={() => removeItem(it.supplyId)}
                                disabled={!canEdit}
                              >
                                Quitar
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-base font-semibold">Productos existentes</div>
                <div className="text-xs text-[#94A3B8]">Selecciona para editar su plantilla.</div>
              </div>
              <Button variant="surface" size="sm" onClick={loadProducts}>
                Refrescar
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              {products.length === 0 ? (
                <div className="text-sm text-[#94A3B8]">Aún no hay productos.</div>
              ) : (
                products.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-[#334155] bg-[#0F172A]/70 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-[#E2E8F0]">{p.name}</div>
                        <div className="text-xs text-[#94A3B8]">{p.id}</div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => loadProductDetail(p.id)}
                        disabled={!canEdit}
                      >
                        Editar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
