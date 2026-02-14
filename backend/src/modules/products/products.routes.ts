import type { FastifyInstance, FastifyRequest } from "fastify";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireRole } from "../../plugins/roles.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchQuery = {
  q?: string;
};

type CreateProductBody = {
  name?: string;
  wastePct?: number;
  marginPct?: number;
  operationalPct?: number;
  items?: Array<{
    supplyId?: string;
    qtyFormula?: string;
  }>;
};

function validateFormula(formula: string, testQty = 1) {
  if (!/^[0-9+\-*/().\s_a-zA-Z]+$/.test(formula)) {
    throw new Error("qtyFormula inválido");
  }
  const expr = formula.replaceAll("cantidad", String(testQty));
  // eslint-disable-next-line no-new-func
  const fn = new Function("ceil", `return (${expr});`);
  const val = Number(fn(Math.ceil));
  if (!Number.isFinite(val) || val < 0) {
    throw new Error("qtyFormula inválido");
  }
}

export async function productsRoutes(app: FastifyInstance) {
  // ✅ Listar productos
  app.get("/products", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor"]);

    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, name, created_at")
      .order("created_at", { ascending: false });

    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(data ?? []);
  });

  // 🔒 Buscar productos (nombre o id)
  app.get("/products/search", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor", "vendedor"]);

    const query = (req.query as SearchQuery)?.q?.trim() ?? "";

    if (query.length < 2) return reply.send([]);

    let reqQuery = supabaseAdmin.from("products").select("id, name").limit(8);

    if (UUID_RE.test(query)) {
      reqQuery = reqQuery.eq("id", query);
    } else {
      reqQuery = reqQuery.ilike("name", `%${query}%`);
    }

    const { data, error } = await reqQuery;
    if (error) return reply.code(500).send({ error: error.message });

    return reply.send(data ?? []);
  });

  // ✅ Detalle producto + plantilla activa
  app.get("/products/:id", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor"]);

    const params = req.params as { id?: string };
    const productId = params.id;

    if (!productId || !UUID_RE.test(productId)) {
      return reply.code(400).send({ error: "productId inválido" });
    }

    const { data: product, error: pErr } = await supabaseAdmin
      .from("products")
      .select("id, name, created_at")
      .eq("id", productId)
      .single();

    if (pErr || !product) return reply.code(404).send({ error: "Producto no encontrado" });

    const { data: tpl, error: tErr } = await supabaseAdmin
      .from("product_templates")
      .select("id, waste_pct, margin_pct, operational_pct, version, is_active")
      .eq("product_id", productId)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tErr) return reply.code(500).send({ error: tErr.message });

    if (!tpl) {
      return reply.send({ product, template: null, items: [] });
    }

    const { data: items, error: iErr } = await supabaseAdmin
      .from("template_items")
      .select("supply_id, qty_formula")
      .eq("template_id", tpl.id);

    if (iErr) return reply.code(500).send({ error: iErr.message });

    return reply.send({
      product,
      template: tpl,
      items: items ?? [],
    });
  });

  // 🔒 Crear producto + plantilla + insumos
  app.post("/products", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor"]);

    const body = (req.body ?? {}) as CreateProductBody;
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) return reply.code(400).send({ error: "name requerido" });

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return reply.code(400).send({ error: "items requeridos" });
    }

    const normalizedItems = items.map((it) => ({
      supplyId: String(it.supplyId ?? "").trim(),
      qtyFormula: String(it.qtyFormula ?? "").trim(),
    }));

    for (const it of normalizedItems) {
      if (!UUID_RE.test(it.supplyId)) {
        return reply.code(400).send({ error: "supplyId inválido" });
      }
      if (!it.qtyFormula) {
        return reply.code(400).send({ error: "qtyFormula requerido" });
      }
      try {
        validateFormula(it.qtyFormula);
      } catch {
        return reply
          .code(400)
          .send({ error: `qtyFormula inválido en supply ${it.supplyId}` });
      }
    }

    const wastePct =
      typeof body.wastePct === "number" && body.wastePct >= 0 ? body.wastePct : 0.05;
    const marginPct =
      typeof body.marginPct === "number" && body.marginPct >= 0 ? body.marginPct : 0.4;
    const operationalPct =
      typeof body.operationalPct === "number" && body.operationalPct >= 0
        ? body.operationalPct
        : 0;

    // 1) Crear producto
    const { data: product, error: pErr } = await supabaseAdmin
      .from("products")
      .insert({ name })
      .select("id, name")
      .single();

    if (pErr || !product) return reply.code(500).send({ error: pErr?.message ?? "error" });

    // 2) Crear plantilla activa
    const { data: template, error: tErr } = await supabaseAdmin
      .from("product_templates")
      .insert({
        product_id: product.id,
        waste_pct: wastePct,
        margin_pct: marginPct,
        operational_pct: operationalPct,
        is_active: true,
        version: 1,
      })
      .select("id, product_id")
      .single();

    if (tErr || !template) return reply.code(500).send({ error: tErr?.message ?? "error" });

    // 3) Insertar insumos
    const rows = normalizedItems.map((it) => ({
      template_id: template.id,
      supply_id: it.supplyId,
      qty_formula: it.qtyFormula,
    }));

    const { error: iErr } = await supabaseAdmin.from("template_items").insert(rows);

    if (iErr) return reply.code(500).send({ error: iErr.message });

    return reply.code(201).send({
      product,
      template,
      items: rows,
    });
  });

  // 🔒 Actualizar producto + nueva plantilla + insumos
  app.put("/products/:id", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor"]);

    const params = req.params as { id?: string };
    const productId = params.id;
    if (!productId || !UUID_RE.test(productId)) {
      return reply.code(400).send({ error: "productId inválido" });
    }

    const body = (req.body ?? {}) as CreateProductBody;
    const name = typeof body.name === "string" ? body.name.trim() : "";

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return reply.code(400).send({ error: "items requeridos" });
    }

    const normalizedItems = items.map((it) => ({
      supplyId: String(it.supplyId ?? "").trim(),
      qtyFormula: String(it.qtyFormula ?? "").trim(),
    }));

    for (const it of normalizedItems) {
      if (!UUID_RE.test(it.supplyId)) {
        return reply.code(400).send({ error: "supplyId inválido" });
      }
      if (!it.qtyFormula) {
        return reply.code(400).send({ error: "qtyFormula requerido" });
      }
      try {
        validateFormula(it.qtyFormula);
      } catch {
        return reply
          .code(400)
          .send({ error: `qtyFormula inválido en supply ${it.supplyId}` });
      }
    }

    const wastePct =
      typeof body.wastePct === "number" && body.wastePct >= 0 ? body.wastePct : 0.05;
    const marginPct =
      typeof body.marginPct === "number" && body.marginPct >= 0 ? body.marginPct : 0.4;
    const operationalPct =
      typeof body.operationalPct === "number" && body.operationalPct >= 0
        ? body.operationalPct
        : 0;

    if (name) {
      const { error: upErr } = await supabaseAdmin
        .from("products")
        .update({ name })
        .eq("id", productId);

      if (upErr) return reply.code(500).send({ error: upErr.message });
    }

    const { data: lastTpl, error: lastErr } = await supabaseAdmin
      .from("product_templates")
      .select("id, version")
      .eq("product_id", productId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) return reply.code(500).send({ error: lastErr.message });

    if (lastTpl?.id) {
      await supabaseAdmin
        .from("product_templates")
        .update({ is_active: false })
        .eq("product_id", productId)
        .eq("is_active", true);
    }

    const nextVersion = (lastTpl?.version ?? 0) + 1;

    const { data: template, error: tErr } = await supabaseAdmin
      .from("product_templates")
      .insert({
        product_id: productId,
        waste_pct: wastePct,
        margin_pct: marginPct,
        operational_pct: operationalPct,
        is_active: true,
        version: nextVersion,
      })
      .select("id, product_id, version, waste_pct, margin_pct, operational_pct, is_active")
      .single();

    if (tErr || !template) return reply.code(500).send({ error: tErr?.message ?? "error" });

    const rows = normalizedItems.map((it) => ({
      template_id: template.id,
      supply_id: it.supplyId,
      qty_formula: it.qtyFormula,
    }));

    const { error: iErr } = await supabaseAdmin.from("template_items").insert(rows);

    if (iErr) return reply.code(500).send({ error: iErr.message });

    return reply.send({
      product: { id: productId, name: name || undefined },
      template,
      items: rows,
    });
  });
}
