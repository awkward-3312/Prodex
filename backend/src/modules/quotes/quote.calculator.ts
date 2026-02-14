import { supabaseAdmin } from "../../lib/supabase.js";

export type DesignLevel = "cliente" | "simple" | "medio" | "pro";

export const DESIGN_COST: Record<DesignLevel, number> = {
  cliente: 0,
  simple: 300,
  medio: 500,
  pro: 700,
};

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ComputeQuoteParams = {
  productId: string;
  inputs: Record<string, unknown>;
  applyIsv?: boolean;
  isvRate?: number;
};

export type QuoteBreakdownLine = {
  supply_id: string;
  supply_name: string;
  unit_base: string;
  qty: number;
  cost_per_unit: number;
  line_cost: number;
  qty_formula: string;
};

export type QuoteTotals = {
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

export type QuoteTemplate = {
  id: string;
  wastePct: number;
  marginPct: number;
  operationalPct: number;
};

export type ComputeQuoteResult = {
  inputs: { cantidad: number; diseño: DesignLevel };
  template: QuoteTemplate;
  breakdown: QuoteBreakdownLine[];
  totals: QuoteTotals;
  product: { id: string; name?: string | null };
};

export async function computeQuote(params: ComputeQuoteParams): Promise<ComputeQuoteResult> {
  const { productId, inputs, applyIsv = false } = params;
  const isvRate = Number.isFinite(params.isvRate as number) ? Number(params.isvRate) : 0.15;

  if (!productId || !UUID_RE.test(productId)) {
    throw new Error("productId inválido");
  }

  const cantidad = Number(inputs["cantidad"]);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new Error("inputs.cantidad inválido");
  }

  const diseñoRaw = inputs["diseño"] ?? "cliente";
  const diseño = String(diseñoRaw) as DesignLevel;
  if (!["cliente", "simple", "medio", "pro"].includes(diseño)) {
    throw new Error("inputs.diseño inválido");
  }

  const { data: product, error: pErr } = await supabaseAdmin
    .from("products")
    .select("id, name")
    .eq("id", productId)
    .maybeSingle();

  if (pErr) throw new Error(String(pErr));
  if (!product) throw new Error("Producto no encontrado");

  const { data: tpl, error: tErr } = await supabaseAdmin
    .from("product_templates")
    .select("id, waste_pct, margin_pct, operational_pct")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tErr) throw new Error(String(tErr));
  if (!tpl) throw new Error("Plantilla activa no encontrada");

  const { data: items, error: iErr } = await supabaseAdmin
    .from("template_items")
    .select("id, qty_formula, supply_id")
    .eq("template_id", tpl.id);

  if (iErr) throw new Error(String(iErr));

  const supplyIds = (items ?? [])
    .map((it) => (it as unknown as { supply_id?: string }).supply_id)
    .filter((x): x is string => Boolean(x));

  if (supplyIds.length === 0) {
    const designCost = DESIGN_COST[diseño];
    return {
      inputs: { cantidad, diseño },
      template: {
        id: tpl.id,
        wastePct: Number(tpl.waste_pct ?? 0),
        marginPct: Number(tpl.margin_pct ?? 0),
        operationalPct: Number(tpl.operational_pct ?? 0),
      },
      breakdown: [],
      totals: {
        materialsCost: 0,
        wasteCost: 0,
        operationalCost: 0,
        designCost,
        costTotal: designCost,
        minPrice: designCost,
        suggestedPrice: designCost,
        profit: 0,
        marginReal: 0,
        applyIsv,
        isvRate,
        isv: applyIsv ? designCost * isvRate : 0,
        total: applyIsv ? designCost * (1 + isvRate) : designCost,
      },
      product: { id: product.id, name: product.name },
    };
  }

  const { data: supplies, error: sErr } = await supabaseAdmin
    .from("supplies")
    .select("id, name, unit_base, cost_per_unit")
    .in("id", supplyIds);

  if (sErr) throw new Error(String(sErr));

  const supplyById = new Map((supplies ?? []).map((s) => [s.id, s]));

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

  const breakdown: QuoteBreakdownLine[] = [];
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

  const subtotal = suggestedPrice;
  const isv = applyIsv ? subtotal * isvRate : 0;
  const total = subtotal + isv;

  const profit = subtotal - costTotal;
  const marginReal = subtotal > 0 ? profit / subtotal : 0;

  return {
    inputs: { cantidad, diseño },
    template: { id: tpl.id, wastePct, marginPct, operationalPct },
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
    product: { id: product.id, name: product.name },
  };
}
