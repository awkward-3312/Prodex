"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { apiFetch } from "@/lib/apiFetch";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/lib/alerts";

type Role = "admin" | "supervisor" | "vendedor";

type Customer = {
  id: string;
  name: string;
  rtn?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

export default function CustomersPage() {
  const API = process.env.NEXT_PUBLIC_API_URL!;
  const router = useRouter();

  const [role, setRole] = useState<Role | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(200);
  const [saving, setSaving] = useState(false);

  const [newCustomer, setNewCustomer] = useState({
    name: "",
    rtn: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const res = await apiFetch(`${API}/me`);
        const data = (await res.json().catch(() => null)) as unknown;
        if (!res.ok || !data || typeof data !== "object" || !("role" in data)) {
          if (alive) setRole(null);
          return;
        }
        const r = String((data as { role: unknown }).role) as Role;
        if (alive) setRole(r);
        if (r !== "admin") {
          router.replace("/unauthorized");
        }
      } catch {
        if (alive) setRole(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [API, router]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", String(limit));

      const res = await apiFetch(`${API}/customers?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as unknown;

      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "No se pudo cargar")
            : "No se pudo cargar";
        toast("error", `Error ${res.status}: ${msg}`);
        setCustomers([]);
        return;
      }

      setCustomers(Array.isArray(data) ? (data as Customer[]) : []);
    } catch (e) {
      console.error("load customers error:", e);
      toast("error", "Error de red cargando clientes");
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === "admin") {
      void loadCustomers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, search, limit]);

  const exportCsv = () => {
    if (!customers.length) {
      toast("warning", "No hay clientes para exportar");
      return;
    }
    const headers = ["Nombre", "RTN", "Teléfono", "Email", "Dirección", "Notas", "Creado"];
    const rows = customers.map((c) => [
      c.name ?? "",
      c.rtn ?? "",
      c.phone ?? "",
      c.email ?? "",
      c.address ?? "",
      c.notes ?? "",
      c.created_at ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const createCustomer = async () => {
    if (!newCustomer.name.trim()) {
      toast("error", "Nombre requerido");
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch(`${API}/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCustomer.name.trim(),
          rtn: newCustomer.rtn.trim() || undefined,
          phone: newCustomer.phone.trim() || undefined,
          email: newCustomer.email.trim() || undefined,
          address: newCustomer.address.trim() || undefined,
          notes: newCustomer.notes.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as unknown;

      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "No se pudo crear")
            : "No se pudo crear";
        toast("error", `Error ${res.status}: ${msg}`);
        return;
      }

      toast("success", "Cliente creado");
      setNewCustomer({ name: "", rtn: "", phone: "", email: "", address: "", notes: "" });
      await loadCustomers();
    } catch (e) {
      console.error("create customer error:", e);
      toast("error", "Error de red creando cliente");
    } finally {
      setSaving(false);
    }
  };

  const totalLabel = useMemo(() => {
    return customers.length === 1 ? "1 cliente" : `${customers.length} clientes`;
  }, [customers.length]);

  return (
    <RequireAuth>
      <AppShell
        title="Clientes"
        subtitle="Cartera de clientes (solo administración)."
        crumbs={[
          { label: "Inicio", href: "/" },
          { label: "Clientes" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="surface" size="sm" onClick={exportCsv}>
              Exportar Excel
            </Button>
            <Button variant="primary" size="sm" onClick={loadCustomers} disabled={loading}>
              {loading ? "..." : "Refrescar"}
            </Button>
          </div>
        }
      >
        <div className="relative space-y-6">
          <div className="pointer-events-none absolute -top-20 right-6 h-64 w-64 rounded-full bg-[#38BDF8]/15 blur-3xl" />
          <div className="pointer-events-none absolute top-52 -left-10 h-72 w-72 rounded-full bg-[#22C55E]/10 blur-3xl" />

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Filtros</div>
                <div className="text-xs text-[#94A3B8]">Busca por nombre, RTN, teléfono o correo.</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Buscar cliente"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-64"
                />
                <Input
                  type="number"
                  min={10}
                  step={10}
                  value={limit}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setLimit(Number.isFinite(next) && next > 0 ? next : 200);
                  }}
                  className="w-24"
                />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-base font-semibold">Nuevo cliente</div>
                <div className="text-xs text-[#94A3B8]">Registro rápido para tu cartera.</div>
              </div>
              <Button variant="primary" size="sm" onClick={createCustomer} disabled={saving}>
                {saving ? "Guardando..." : "Agregar cliente"}
              </Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                placeholder="Nombre (requerido)"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer((prev) => ({ ...prev, name: e.target.value }))}
              />
              <Input
                placeholder="RTN"
                value={newCustomer.rtn}
                onChange={(e) => setNewCustomer((prev) => ({ ...prev, rtn: e.target.value }))}
              />
              <Input
                placeholder="Teléfono"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <Input
                placeholder="Correo"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer((prev) => ({ ...prev, email: e.target.value }))}
              />
              <Input
                placeholder="Dirección"
                value={newCustomer.address}
                onChange={(e) => setNewCustomer((prev) => ({ ...prev, address: e.target.value }))}
              />
              <Input
                placeholder="Notas"
                value={newCustomer.notes}
                onChange={(e) => setNewCustomer((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-base font-semibold">Listado</div>
                <div className="text-xs text-[#94A3B8]">{totalLabel}</div>
              </div>
              <span className="text-xs text-[#94A3B8]">
                {loading ? "Cargando..." : "Última actualización"}
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-[#334155]">
              <table className="w-full text-xs text-[#E2E8F0]">
                <thead className="bg-[#1E293B] text-[#94A3B8]">
                  <tr>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">RTN</th>
                    <th className="px-3 py-2 text-left">Teléfono</th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">Dirección</th>
                    <th className="px-3 py-2 text-left">Creado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#334155]">
                  {loading ? (
                    <tr>
                      <td className="px-3 py-4 text-center text-[#94A3B8]" colSpan={6}>
                        Cargando...
                      </td>
                    </tr>
                  ) : customers.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-center text-[#94A3B8]" colSpan={6}>
                        No hay clientes registrados.
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => (
                      <tr key={c.id} className="hover:bg-[#0F172A]/80">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-[#E2E8F0]">{c.name}</div>
                          {c.notes && <div className="text-[10px] text-[#94A3B8]">{c.notes}</div>}
                        </td>
                        <td className="px-3 py-2">{c.rtn ?? "-"}</td>
                        <td className="px-3 py-2">{c.phone ?? "-"}</td>
                        <td className="px-3 py-2">{c.email ?? "-"}</td>
                        <td className="px-3 py-2">{c.address ?? "-"}</td>
                        <td className="px-3 py-2">
                          {c.created_at ? new Date(c.created_at).toLocaleDateString() : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
