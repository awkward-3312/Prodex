import type { FastifyInstance } from "fastify";
import { supabase } from "../../lib/supabase.js";

type DesignLevel = "cliente" | "simple" | "medio" | "pro";

const DESIGN_COST: Record<DesignLevel, number> = {
  cliente: 0,
  simple: 300,
  medio: 500,
  pro: 700,
};

type CreateQuoteBody = {
  productId: string;
  inputs: Record<string, unknown>;
  applyIsv?: boolean;
  isvRate?: number;
  // priceFinal opcional si luego quieres que el vendedor proponga un precio (por ahora lo dejamos automático)
};

export async function quotesRoutes(app: FastifyInstance) {
  app.post("/quotes", async (req, reply) => {
    const body = req.body as Partial<CreateQuoteBody>;

    if (!body.productId) return reply.code(400).send({ error: "productId requerido" });

    const inputs = (body.inputs ?? {}) as Record<string, unknown>;
    const cantidad = Number(inputs["cantidad"]);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return reply.code(400).send({ error: "inputs.cantidad inválido" });
    }

    const diseñoRaw = inputs["diseño"] ?? "cliente";
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

    // 2) Items de receta
    const { data: items, error: iErr } = await supabase
      .from("template_items")
      .select("id, qty_formula, supply_id")
      .eq("template_id", tpl.id);

    if (iErr) return reply.code(500).send({ error: String(iErr) });

    const supplyIds = (items ?? [])
      .map((it) => (it as unknown as { supply_id?: string }).supply_id)
      .filter((x): x is string => Boolean(x));

    const { data: supplies, error: sErr } = supplyIds.length
      ? await supabase
          .from("supplies")
          .select("id, name, unit_base, cost_per_unit, stock")
          .in("id", supplyIds)
      : { data: [], error: null };

    if (sErr) return reply.code(500).send({ error: String(sErr) });

    const supplyById = new Map((supplies ?? []).map((s) => [s.id, s]));

    // 3) Evaluador mínimo de fórmula
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

    // 4) Construir breakdown + costos (snapshot)
    const breakdown: Array<{
      supply_id: string;
      supply_name: string;
      unit_base: string;
      qty: number;
      cost_per_unit: number;
      line_cost: number;
      qty_formula: string;
    }> = [];

    let materialsCost = 0;

    for (const it of items ?? []) {
      const supplyId = (it as unknown as { supply_id?: string }).supply_id;
      if (!supplyId) continue;

      const s = supplyById.get(supplyId);
      if (!s) continue;

      const formula = String((it as any).qty_formula ?? "0");
      const qty = evalQty(formula);
      const cpu = Number((s as any).cost_per_unit ?? 0);
      const lineCost = qty * cpu;

      breakdown.push({
        supply_id: supplyId,
        supply_name: String((s as any).name),
        unit_base: String((s as any).unit_base),
        qty,
        cost_per_unit: cpu,
        line_cost: lineCost,
        qty_formula: formula,
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

    // Por ahora price_final = suggested (luego haremos override con aprobación)
    const priceFinal = suggestedPrice;

    const isvAmount = applyIsv ? priceFinal * isvRate : 0;
    const total = priceFinal + isvAmount;

    // 5) Insertar quote
    const { data: quote, error: qErr } = await supabase
      .from("quotes")
      .insert({
        product_id: body.productId,
        template_id: tpl.id,
        status: "draft",
        inputs: { cantidad, diseño },
        apply_isv: applyIsv,
        isv_rate: isvRate,

        waste_pct: wastePct,
        margin_pct: marginPct,
        operational_pct: operationalPct,

        materials_cost: materialsCost,
        waste_cost: wasteCost,
        operational_cost: operationalCost,
        design_cost: designCost,

        cost_total: costTotal,
        min_price: minPrice,
        suggested_price: suggestedPrice,

        price_final: priceFinal,
        isv_amount: isvAmount,
        total,
      })
      .select("*")
      .single();

    if (qErr) return reply.code(500).send({ error: String(qErr) });

    // 6) Insertar líneas snapshot
    if (breakdown.length > 0) {
      const linesPayload = breakdown.map((b) => ({
        quote_id: quote.id,
        supply_id: b.supply_id,
        supply_name: b.supply_name,
        unit_base: b.unit_base,
        qty: b.qty,
        cost_per_unit: b.cost_per_unit,
        line_cost: b.line_cost,
        qty_formula: b.qty_formula,
      }));

      const { error: lErr } = await supabase.from("quote_lines").insert(linesPayload);
      if (lErr) return reply.code(500).send({ error: String(lErr) });
    }

    return reply.code(201).send({
      quoteId: quote.id,
      quote,
      breakdown,
    });
  });
}