import type { FastifyInstance, FastifyRequest } from "fastify";
import { createAuthClient, supabaseAdmin } from "../../lib/supabase.js";
import { requireRole } from "../../plugins/roles.js";

type DesignLevel = "cliente" | "simple" | "medio" | "pro";
type DiscountType = "seasonal" | "delay" | "senior" | "special_case";
type DiscountSeason =
  | "navidad"
  | "dia_mujer"
  | "dia_padre"
  | "dia_madre"
  | "verano"
  | "black_friday"
  | "otro";
type Role = "admin" | "supervisor" | "vendedor";

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
  priceFinal?: number;
  discount?: {
    type?: DiscountType;
    season?: DiscountSeason;
    reason?: string;
    amount?: number;
  };
  supervisorEmail?: string;
  supervisorPassword?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function quotesRoutes(app: FastifyInstance) {
  /**
   * ✅ LISTAR COTIZACIONES (para "cotizaciones previas")
   * GET /quotes?mine=1&status=draft&limit=10
   */
  app.get("/quotes", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor", "vendedor"]);

    const q = (req.query ?? {}) as Partial<{
      mine: string;
      status: string;
      limit: string;
    }>;

    const role = req.auth!.role as Role;
    let mine = q.mine === "1" || q.mine === "true";
    const status = q.status?.trim();
    const limitRaw = Number(q.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

    // vendedor solo ve las suyas (ignora mine)
    if (role === "vendedor") mine = true;

    let query = supabaseAdmin
      .from("quotes")
      .select(
        "id, created_at, created_by, product_id, status, inputs, price_final, isv_amount, total, expires_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (mine) {
      query = query.eq("created_by", req.auth!.userId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(Array.isArray(data) ? data : []);
  });

  /**
   * ✅ VER DETALLE DE COTIZACIÓN
   * GET /quotes/:id
   */
  app.get("/quotes/:id", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor", "vendedor"]);

    const { id } = req.params as { id?: string };
    if (!id || !UUID_RE.test(id)) {
      return reply.code(400).send({ error: "id inválido" });
    }

    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select(
        "id, created_at, created_by, product_id, status, inputs, apply_isv, isv_rate, waste_pct, margin_pct, operational_pct, materials_cost, waste_cost, operational_cost, design_cost, cost_total, min_price, suggested_price, price_final, isv_amount, total, expires_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (qErr) return reply.code(500).send({ error: String(qErr) });
    if (!quote) return reply.code(404).send({ error: "Cotización no encontrada" });

    if (req.auth?.role === "vendedor" && quote.created_by !== req.auth.userId) {
      return reply.code(403).send({ error: "No autorizado" });
    }

    const { data: lines, error: lErr } = await supabaseAdmin
      .from("quote_lines")
      .select("supply_id, supply_name, unit_base, qty, cost_per_unit, line_cost, qty_formula")
      .eq("quote_id", id)
      .order("supply_name", { ascending: true });

    if (lErr) return reply.code(500).send({ error: String(lErr) });

    const { data: product, error: pErr } = await supabaseAdmin
      .from("products")
      .select("id, name")
      .eq("id", quote.product_id)
      .maybeSingle();

    if (pErr) return reply.code(500).send({ error: String(pErr) });

    return reply.send({
      quote,
      lines: Array.isArray(lines) ? lines : [],
      product: product ?? null,
    });
  });

  /**
   * ✅ CREAR COTIZACIÓN
   * POST /quotes
   */
  app.post("/quotes", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor", "vendedor"]);

    const body = req.body as Partial<CreateQuoteBody>;

    if (!body.productId) return reply.code(400).send({ error: "productId requerido" });
    if (!UUID_RE.test(body.productId)) {
      return reply.code(400).send({ error: "productId inválido" });
    }

    req.log.info(
      { userId: req.auth?.userId, role: req.auth?.role, productId: body.productId },
      "quotes.create request"
    );

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

    // 0) Validar producto
    const { data: product, error: pErr } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("id", body.productId)
      .maybeSingle();

    if (pErr) return reply.code(500).send({ error: String(pErr) });
    if (!product) return reply.code(404).send({ error: "Producto no encontrado" });

    // 1) Plantilla activa del producto
    const { data: tpl, error: tErr } = await supabaseAdmin
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
    const { data: items, error: iErr } = await supabaseAdmin
      .from("template_items")
      .select("id, qty_formula, supply_id")
      .eq("template_id", tpl.id);

    if (iErr) return reply.code(500).send({ error: String(iErr) });

    const supplyIds = (items ?? [])
      .map((it) => (it as unknown as { supply_id?: string }).supply_id)
      .filter((x): x is string => Boolean(x));

    const { data: supplies, error: sErr } = supplyIds.length
      ? await supabaseAdmin
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

    const requestedPriceRaw = Number(body.priceFinal);
    if (body.priceFinal !== undefined && (!Number.isFinite(requestedPriceRaw) || requestedPriceRaw <= 0)) {
      return reply.code(400).send({ error: "priceFinal inválido" });
    }
    const priceFinal = Number.isFinite(requestedPriceRaw) && requestedPriceRaw > 0 ? requestedPriceRaw : suggestedPrice;

    const discount = body.discount ?? {};
    const discountType = discount.type;
    const discountPct = Number(discount.amount ?? 0);
    const discountReason = String(discount.reason ?? "").trim();
    const discountSeason = discount.season;
    const discountRequested =
      Boolean(discountType) || (Number.isFinite(discountPct) && discountPct > 0) || discountReason.length > 0;

    if (discountRequested) {
      if (!discountType) {
        return reply.code(400).send({ error: "tipo de descuento requerido" });
      }
      if (!Number.isFinite(discountPct) || discountPct <= 0 || discountPct >= 100) {
        return reply.code(400).send({ error: "porcentaje de descuento inválido" });
      }
      if (!discountReason) {
        return reply.code(400).send({ error: "razón de descuento requerida" });
      }
      if (discountType === "seasonal") {
        const allowedSeasons: DiscountSeason[] = [
          "navidad",
          "dia_mujer",
          "dia_padre",
          "dia_madre",
          "verano",
          "black_friday",
          "otro",
        ];
        if (!discountSeason || !allowedSeasons.includes(discountSeason)) {
          return reply.code(400).send({ error: "temporada de descuento inválida" });
        }
      }
      if (discountType === "special_case" && discountReason.length < 8) {
        return reply.code(400).send({ error: "razón detallada requerida para caso especial" });
      }
    }

    if (req.auth?.role === "vendedor" && priceFinal < suggestedPrice) {
      if (!body.supervisorEmail || !body.supervisorPassword) {
        return reply.code(400).send({
          error: "Aprobación requerida: supervisorEmail y supervisorPassword",
        });
      }

      const authClient = createAuthClient();
      const { data: signData, error: signErr } = await authClient.auth.signInWithPassword({
        email: body.supervisorEmail,
        password: body.supervisorPassword,
      });

      if (signErr || !signData.user?.id) {
        return reply.code(401).send({ error: "Credenciales de supervisor inválidas" });
      }

      const supervisorId = signData.user.id;
      const { data: profile, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", supervisorId)
        .single();

      if (pErr || !profile?.role) {
        return reply.code(403).send({ error: "Perfil de supervisor no encontrado" });
      }

      if (profile.role !== "admin" && profile.role !== "supervisor") {
        return reply.code(403).send({ error: "No autorizado: requiere admin/supervisor" });
      }
    }

    const isvAmount = applyIsv ? priceFinal * isvRate : 0;
    const total = priceFinal + isvAmount;

    // ✅ quien la creó
    const createdBy = req.auth!.userId;

    // 5) Insertar quote (🔥 aquí guardamos created_by)
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .insert({
        created_by: createdBy,

        product_id: body.productId,
        template_id: tpl.id,
        status: "draft",
      inputs: {
          cantidad,
          diseño,
          descuento: discountRequested
            ? {
                tipo: discountType,
                temporada: discountSeason ?? null,
                razon: discountReason,
                monto: Number.isFinite(discountPct) ? discountPct : 0,
              }
            : null,
        },
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

      const { error: lErr } = await supabaseAdmin.from("quote_lines").insert(linesPayload);
      if (lErr) return reply.code(500).send({ error: String(lErr) });
    }

    return reply.code(201).send({
      quoteId: quote.id,
      quote,
      breakdown,
    });
  });
}
