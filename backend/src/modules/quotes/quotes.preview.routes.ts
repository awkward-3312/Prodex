import type { FastifyInstance } from "fastify";
import { supabase } from "../../lib/supabase.js";

type DesignLevel = "cliente" | "simple" | "medio" | "pro";

const DESIGN_COST: Record<DesignLevel, number> = {
  cliente: 0,
  simple: 300,
  medio: 500,
  pro: 700,
};

type PreviewBody = {
  productId: string;
  inputs: Record<string, unknown>;
  applyIsv?: boolean;
  isvRate?: number;
};

export async function quotesPreviewRoutes(app: FastifyInstance) {
  app.post("/quotes/preview", async (req, reply) => {
    const body = req.body as Partial<PreviewBody>;

    if (!body.productId) return reply.code(400).send({ error: "productId requerido" });

    const inputs = (body.inputs ?? {}) as Record<string, unknown>;

    const cantidad = Number(inputs["cantidad"]);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return reply.code(400).send({ error: "inputs.cantidad inválido" });
    }

    const diseñoRaw = (inputs["diseño"] ?? "cliente") as unknown;
    const diseño = String(diseñoRaw) as DesignLevel;
    if (!["cliente", "simple", "medio", "pro"].includes(diseño)) {
      return reply.code(400).send({ error: "inputs.diseño inválido" });
    }

    const applyIsv = Boolean(body.applyIsv);
    const isvRate = Number.isFinite(body.isvRate as number) ? Number(body.isvRate) : 0.15;

    // 1) Plantilla activa del producto
    const { data: tpl, error: tErr } = await supabase
      .from("product_templates")
      .select("id, waste_pct, margin_pct, operational_pct")
      .eq("product_id", body.productId)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tErr) return reply.code(500).send({ error: String(tErr) });
    if (!tpl) return reply.code(404).send({ error: "Plantilla activa no encontrada" });

    // 2) Items de receta (sin join)
    const { data: items, error: iErr } = await supabase
      .from("template_items")
      .select("id, qty_formula, supply_id")
      .eq("template_id", tpl.id);

    if (iErr) return reply.code(500).send({ error: String(iErr) });

    const supplyIds = (items ?? [])
      .map((it) => (it as unknown as { supply_id?: string }).supply_id)
      .filter((x): x is string => Boolean(x));

    // Si no hay insumos en receta, devolvemos algo claro
    if (supplyIds.length === 0) {
      return reply.send({
        inputs: { cantidad, diseño },
        template: {
          wastePct: Number(tpl.waste_pct ?? 0),
          marginPct: Number(tpl.margin_pct ?? 0),
          operationalPct: Number(tpl.operational_pct ?? 0),
        },
        breakdown: [],
        totals: {
          materialsCost: 0,
          wasteCost: 0,
          operationalCost: 0,
          designCost: DESIGN_COST[diseño],
          costTotal: DESIGN_COST[diseño],
          minPrice: DESIGN_COST[diseño],
          suggestedPrice: DESIGN_COST[diseño],
          profit: 0,
          marginReal: 0,
          applyIsv,
          isvRate,
          isv: applyIsv ? DESIGN_COST[diseño] * isvRate : 0,
          total: applyIsv ? DESIGN_COST[diseño] * (1 + isvRate) : DESIGN_COST[diseño],
        },
      });
    }

    // 3) Buscar supplies por ids
    const { data: supplies, error: sErr } = await supabase
      .from("supplies")
      .select("id, name, unit_base, cost_per_unit")
      .in("id", supplyIds);

    if (sErr) return reply.code(500).send({ error: String(sErr) });

    const supplyById = new Map((supplies ?? []).map((s) => [s.id, s]));

    // 4) Evaluador mínimo de fórmulas
    const ceil = Math.ceil;

    function evalQty(formula: string): number {
      if (!/^[0-9+\-*/().\s_a-zA-Z]+$/.test(formula)) {
        throw new Error(`Fórmula inválida: ${formula}`);
      }
      const expr = formula.replaceAll("cantidad", String(cantidad));
      // eslint-disable-next-line no-new-func
      const fn = new Function("ceil", `return (${expr});`);
      const val = Number(fn(ceil));
      if (!Number.isFinite(val) || val < 0) throw new Error(`Resultado inválido: ${formula}`);
      return val;
    }

    const breakdown: Array<{
      supplyName: string;
      unitBase: string;
      qty: number;
      costPerUnit: number;
      lineCost: number;
      formula: string;
    }> = [];

    let materialsCost = 0;

    for (const it of items ?? []) {
      const supplyId = (it as unknown as { supply_id?: string }).supply_id;
      if (!supplyId) continue;

      const s = supplyById.get(supplyId);
      if (!s) continue;

      const formula = (it as unknown as { qty_formula?: string }).qty_formula ?? "0";
      const qty = evalQty(String(formula));
      const cpu = Number(s.cost_per_unit ?? 0);
      const lineCost = qty * cpu;

      breakdown.push({
        supplyName: String(s.name),
        unitBase: String(s.unit_base),
        qty,
        costPerUnit: cpu,
        lineCost,
        formula: String(formula),
      });

      materialsCost += lineCost;
    }

    const wastePct = Number(tpl.waste_pct ?? 0.05);
    const marginPct = Number(tpl.margin_pct ?? 0.4);
    const operationalPct = Number(tpl.operational_pct ?? 0);

    const wasteCost = materialsCost * wastePct;
    const materialsPlusWaste = materialsCost + wasteCost;

    const operationalCost = materialsPlusWaste * operationalPct;

    const designCost = DESIGN_COST[diseño];

    const costTotal = materialsPlusWaste + operationalCost + designCost;

    const minPrice = marginPct >= 1 ? costTotal : costTotal / (1 - marginPct);
    const suggestedPrice = minPrice;

    const subtotal = suggestedPrice;
    const isv = applyIsv ? subtotal * isvRate : 0;
    const total = subtotal + isv;

    const profit = subtotal - costTotal;
    const marginReal = subtotal > 0 ? profit / subtotal : 0;

    return reply.send({
      inputs: { cantidad, diseño },
      template: { wastePct, marginPct, operationalPct },
      breakdown,
      totals: {
        materialsCost,
        wasteCost,
        operationalCost,
        designCost,
        costTotal,
        minPrice,
        suggestedPrice,
        profit,
        marginReal,
        applyIsv,
        isvRate,
        isv,
        total,
      },
    });
  });
}