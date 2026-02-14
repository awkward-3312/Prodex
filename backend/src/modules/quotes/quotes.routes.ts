import type { FastifyInstance, FastifyRequest } from "fastify";
import { createAuthClient, supabaseAdmin } from "../../lib/supabase.js";
import { requireRole } from "../../plugins/roles.js";
import { computeQuote, UUID_RE } from "./quote.calculator.js";

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

type CreateQuoteBody = {
  productId: string;
  inputs: Record<string, unknown>;
  applyIsv?: boolean;
  isvRate?: number;
  priceFinal?: number;
  customerId?: string;
  customer?: {
    name?: string;
    rtn?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
  };
  discount?: {
    type?: DiscountType;
    season?: DiscountSeason;
    reason?: string;
    amount?: number;
  };
  supervisorEmail?: string;
  supervisorPassword?: string;
};

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
      page: string;
      offset: string;
    }>;

    const role = req.auth!.role as Role;
    let mine = q.mine === "1" || q.mine === "true";
    const status = q.status?.trim();
    const limitRaw = Number(q.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;
    const pageRaw = Number(q.page);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 0;
    const offsetRaw = Number(q.offset);
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;
    const start = page > 0 ? (page - 1) * limit : offset;
    const end = start + limit - 1;

    // vendedor solo ve las suyas (ignora mine)
    if (role === "vendedor") mine = true;

    let query = supabaseAdmin
      .from("quotes")
      .select(
        "id, created_at, created_by, product_id, status, inputs, price_final, isv_amount, total, expires_at"
      )
      .order("created_at", { ascending: false })
      .range(start, end);

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
        "id, created_at, created_by, product_id, customer_id, status, inputs, apply_isv, isv_rate, waste_pct, margin_pct, operational_pct, materials_cost, waste_cost, operational_cost, design_cost, cost_total, min_price, suggested_price, price_final, isv_amount, total, expires_at"
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

    let customer: any = null;
    if (quote.customer_id) {
      const { data: cust, error: cErr } = await supabaseAdmin
        .from("customers")
        .select("id, name, rtn, phone, email, address, notes, created_at")
        .eq("id", quote.customer_id)
        .maybeSingle();
      if (cErr) return reply.code(500).send({ error: String(cErr) });
      customer = cust ?? null;
    }

    return reply.send({
      quote,
      lines: Array.isArray(lines) ? lines : [],
      product: product ?? null,
      customer,
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

    const customerId = body.customerId;
    let resolvedCustomerId: string | null = null;
    const cleanText = (value: unknown) =>
      typeof value === "string" && value.trim().length ? value.trim() : null;

    if (customerId !== undefined) {
      if (!customerId || !UUID_RE.test(customerId)) {
        return reply.code(400).send({ error: "customerId inválido" });
      }
      const { data: cust, error: cErr } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("id", customerId)
        .maybeSingle();
      if (cErr) return reply.code(500).send({ error: String(cErr) });
      if (!cust) return reply.code(404).send({ error: "Cliente no encontrado" });
      resolvedCustomerId = customerId;
    } else if (body.customer) {
      const name = cleanText(body.customer.name);
      if (!name) return reply.code(400).send({ error: "nombre de cliente requerido" });
      const payload = {
        name,
        rtn: cleanText(body.customer.rtn),
        phone: cleanText(body.customer.phone),
        email: cleanText(body.customer.email),
        address: cleanText(body.customer.address),
        notes: cleanText(body.customer.notes),
      };
      const { data: cust, error: cErr } = await supabaseAdmin
        .from("customers")
        .insert(payload)
        .select("id")
        .single();
      if (cErr) return reply.code(500).send({ error: String(cErr) });
      resolvedCustomerId = cust?.id ?? null;
    }

    req.log.info(
      { userId: req.auth?.userId, role: req.auth?.role, productId: body.productId },
      "quotes.create request"
    );

    const applyIsv = Boolean(body.applyIsv);
    const isvRate = Number.isFinite(body.isvRate as number) ? Number(body.isvRate) : 0.15;
    let computed;
    try {
      computed = await computeQuote({
        productId: body.productId,
        inputs: (body.inputs ?? {}) as Record<string, unknown>,
        applyIsv,
        isvRate,
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "Error");
      if (msg.includes("no encontrado")) return reply.code(404).send({ error: msg });
      if (msg.includes("inválido")) return reply.code(400).send({ error: msg });
      return reply.code(500).send({ error: msg });
    }

    const { breakdown } = computed;
    const {
      materialsCost,
      wasteCost,
      operationalCost,
      designCost,
      costTotal,
      minPrice,
      suggestedPrice,
    } = computed.totals;
    const { wastePct, marginPct, operationalPct } = computed.template;

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

    let approvedBy: string | null = null;
    let approvedReason: string | null = null;

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

      approvedBy = supervisorId;
      approvedReason = "Precio final menor al sugerido";
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
        customer_id: resolvedCustomerId,
        template_id: computed.template.id,
        status: "draft",
        inputs: {
          ...computed.inputs,
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

        discount_pct: discountRequested ? discountPct : null,
        discount_type: discountRequested ? discountType ?? null : null,
        discount_reason: discountRequested ? discountReason : null,
        discount_season: discountRequested ? discountSeason ?? null : null,
        approved_by: approvedBy,
        approved_at: approvedBy ? new Date().toISOString() : null,
        approved_reason: approvedReason,
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
