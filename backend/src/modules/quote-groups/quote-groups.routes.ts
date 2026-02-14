import type { FastifyInstance, FastifyRequest } from "fastify";
import { createAuthClient, supabaseAdmin } from "../../lib/supabase.js";
import { requireRole } from "../../plugins/roles.js";
import { computeQuote, UUID_RE } from "../quotes/quote.calculator.js";

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

type GroupItemInput = {
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
};

type CreateGroupBody = {
  items: GroupItemInput[];
  customerId?: string;
  customer?: {
    name?: string;
    rtn?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
  };
  supervisorEmail?: string;
  supervisorPassword?: string;
};

export async function quoteGroupsRoutes(app: FastifyInstance) {
  // ✅ Listar cotizaciones grupales
  app.get("/quote-groups", async (req: FastifyRequest, reply) => {
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

    if (role === "vendedor") mine = true;

    let query = supabaseAdmin
      .from("quote_groups")
      .select("id, created_at, created_by, status, price_final, isv_amount, total")
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

  // ✅ Crear cotización grupal
  app.post("/quote-groups", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor", "vendedor"]);

    const body = (req.body ?? {}) as Partial<CreateGroupBody>;
    const items = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return reply.code(400).send({ error: "items requeridos" });
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

    const role = req.auth?.role as Role | undefined;
    const createdBy = req.auth!.userId;

    // Validaciones y cómputo previo
    const computedItems: Array<{
      input: GroupItemInput;
      computed: Awaited<ReturnType<typeof computeQuote>>;
      priceFinal: number;
      suggestedPrice: number;
      isvAmount: number;
      total: number;
      discountType?: DiscountType;
      discountPct: number;
      discountReason: string;
      discountSeason?: DiscountSeason;
      discountRequested: boolean;
    }> = [];

    for (const item of items) {
      if (!item.productId || !UUID_RE.test(item.productId)) {
        return reply.code(400).send({ error: "productId inválido" });
      }

      const applyIsv = Boolean(item.applyIsv);
      const isvRate = Number.isFinite(item.isvRate as number) ? Number(item.isvRate) : 0.15;

      let computed;
      try {
        computed = await computeQuote({
          productId: item.productId,
          inputs: (item.inputs ?? {}) as Record<string, unknown>,
          applyIsv,
          isvRate,
        });
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? "Error");
        if (msg.includes("no encontrado")) return reply.code(404).send({ error: msg });
        if (msg.includes("inválido")) return reply.code(400).send({ error: msg });
        return reply.code(500).send({ error: msg });
      }

      const suggestedPrice = Number(computed.totals.suggestedPrice ?? 0);
      const requestedPriceRaw = Number(item.priceFinal);
      if (item.priceFinal !== undefined && (!Number.isFinite(requestedPriceRaw) || requestedPriceRaw <= 0)) {
        return reply.code(400).send({ error: "priceFinal inválido" });
      }
      const priceFinal =
        Number.isFinite(requestedPriceRaw) && requestedPriceRaw > 0 ? requestedPriceRaw : suggestedPrice;

      const discount = item.discount ?? {};
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

      const isvAmount = applyIsv ? priceFinal * isvRate : 0;
      const total = priceFinal + isvAmount;

      computedItems.push({
        input: item,
        computed,
        priceFinal,
        suggestedPrice,
        isvAmount,
        total,
        discountType,
        discountPct,
        discountReason,
        discountSeason,
        discountRequested,
      });
    }

    // Aprobación supervisor si algún item va por debajo del sugerido (vendedor)
    let approvedBy: string | null = null;
    let approvedReason: string | null = null;

    if (role === "vendedor") {
      const needsApproval = computedItems.some((it) => it.priceFinal < it.suggestedPrice);
      if (needsApproval) {
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
    }

    const subtotal = computedItems.reduce((acc, it) => acc + it.priceFinal, 0);
    const totalIsv = computedItems.reduce((acc, it) => acc + it.isvAmount, 0);
    const total = computedItems.reduce((acc, it) => acc + it.total, 0);

    const { data: group, error: gErr } = await supabaseAdmin
      .from("quote_groups")
      .insert({
        created_by: createdBy,
        customer_id: resolvedCustomerId,
        status: "draft",
        price_final: subtotal,
        isv_amount: totalIsv,
        total,
        approved_by: approvedBy,
        approved_at: approvedBy ? new Date().toISOString() : null,
        approved_reason: approvedReason,
      })
      .select("*")
      .single();

    if (gErr || !group) return reply.code(500).send({ error: String(gErr?.message ?? gErr) });

    const itemRows = computedItems.map((it, idx) => ({
      group_id: group.id,
      product_id: it.input.productId,
      template_id: it.computed.template.id,
      position: idx + 1,
      inputs: {
        ...it.computed.inputs,
        descuento: it.discountRequested
          ? {
              tipo: it.discountType,
              temporada: it.discountSeason ?? null,
              razon: it.discountReason,
              monto: Number.isFinite(it.discountPct) ? it.discountPct : 0,
            }
          : null,
      },
      apply_isv: Boolean(it.input.applyIsv),
      isv_rate: Number.isFinite(it.input.isvRate as number) ? Number(it.input.isvRate) : 0.15,
      suggested_price: it.suggestedPrice,
      price_final: it.priceFinal,
      isv_amount: it.isvAmount,
      total: it.total,
      discount_pct: it.discountRequested ? it.discountPct : null,
      discount_type: it.discountRequested ? it.discountType ?? null : null,
      discount_reason: it.discountRequested ? it.discountReason : null,
      discount_season: it.discountRequested ? it.discountSeason ?? null : null,
    }));

    const { data: groupItems, error: giErr } = await supabaseAdmin
      .from("quote_group_items")
      .insert(itemRows)
      .select("id, product_id, position")
      .order("position", { ascending: true });

    if (giErr || !groupItems) return reply.code(500).send({ error: String(giErr?.message ?? giErr) });

    const linesPayload: Array<Record<string, unknown>> = [];

    for (let i = 0; i < groupItems.length; i += 1) {
      const item = groupItems[i];
      const breakdown = computedItems[i]?.computed.breakdown ?? [];
      for (const b of breakdown) {
        linesPayload.push({
          group_item_id: item.id,
          supply_id: b.supply_id,
          supply_name: b.supply_name,
          unit_base: b.unit_base,
          qty: b.qty,
          cost_per_unit: b.cost_per_unit,
          line_cost: b.line_cost,
          qty_formula: b.qty_formula,
        });
      }
    }

    if (linesPayload.length > 0) {
      const { error: lErr } = await supabaseAdmin.from("quote_group_lines").insert(linesPayload);
      if (lErr) return reply.code(500).send({ error: String(lErr) });
    }

    return reply.code(201).send({
      groupId: group.id,
      group,
      items: groupItems,
    });
  });

  // ✅ Ver detalle de cotización grupal
  app.get("/quote-groups/:id", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor", "vendedor"]);

    const { id } = req.params as { id?: string };
    if (!id || !UUID_RE.test(id)) {
      return reply.code(400).send({ error: "id inválido" });
    }

    const { data: group, error: gErr } = await supabaseAdmin
      .from("quote_groups")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (gErr) return reply.code(500).send({ error: String(gErr) });
    if (!group) return reply.code(404).send({ error: "Cotización no encontrada" });

    if (req.auth?.role === "vendedor" && group.created_by !== req.auth.userId) {
      return reply.code(403).send({ error: "No autorizado" });
    }

    const { data: items, error: iErr } = await supabaseAdmin
      .from("quote_group_items")
      .select("*")
      .eq("group_id", id)
      .order("position", { ascending: true });

    if (iErr) return reply.code(500).send({ error: String(iErr) });

    const itemIds = (items ?? []).map((it) => it.id);
    const productIds = (items ?? []).map((it) => it.product_id).filter(Boolean);

    const { data: products, error: pErr } = await supabaseAdmin
      .from("products")
      .select("id, name")
      .in("id", productIds);

    if (pErr) return reply.code(500).send({ error: String(pErr) });

    const productById = new Map((products ?? []).map((p) => [p.id, p]));

    const { data: lines, error: lErr } = await supabaseAdmin
      .from("quote_group_lines")
      .select("group_item_id, supply_id, supply_name, unit_base, qty, cost_per_unit, line_cost, qty_formula")
      .in("group_item_id", itemIds);

    if (lErr) return reply.code(500).send({ error: String(lErr) });

    const itemsWithProduct = (items ?? []).map((it) => ({
      ...it,
      product: productById.get(it.product_id) ?? null,
    }));

    let customer: any = null;
    if (group.customer_id) {
      const { data: cust, error: cErr } = await supabaseAdmin
        .from("customers")
        .select("id, name, rtn, phone, email, address, notes, created_at")
        .eq("id", group.customer_id)
        .maybeSingle();
      if (cErr) return reply.code(500).send({ error: String(cErr) });
      customer = cust ?? null;
    }

    return reply.send({
      group,
      items: itemsWithProduct,
      lines: Array.isArray(lines) ? lines : [],
      customer,
    });
  });
}
