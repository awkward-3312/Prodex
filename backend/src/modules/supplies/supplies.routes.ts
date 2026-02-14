import type { FastifyInstance, FastifyRequest } from "fastify";
import type { UnitBase } from "./supplies.model.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireRole } from "../../plugins/roles.js";

function isUnitBase(v: unknown): v is UnitBase {
  return v === "u" || v === "hoja" || v === "ml" || v === "m" || v === "m2";
}

function isRounding(v: unknown): v is "none" | "ceil" {
  return v === "none" || v === "ceil";
}

export async function suppliesRoutes(app: FastifyInstance) {
  // ✅ VER: cualquiera logueado
  app.get("/supplies", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);

    const { data, error } = await supabaseAdmin
      .from("supplies")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(data ?? []);
  });

  // ✅ Fórmula por defecto (tomada de template_items existentes)
  app.get("/supplies/:id/default-formula", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor", "vendedor"]);

    const params = req.params as { id?: string };
    const supplyId = params.id;

    if (!supplyId) return reply.code(400).send({ error: "supply id requerido" });

    const { data, error } = await supabaseAdmin
      .from("template_items")
      .select("qty_formula")
      .eq("supply_id", supplyId)
      .limit(1)
      .maybeSingle();

    if (error) return reply.code(500).send({ error: error.message });

    const qtyFormula = data?.qty_formula ? String(data.qty_formula) : "cantidad";
    return reply.send({ qtyFormula });
  });

  // 🔒 CREAR: solo admin/supervisor
  app.post("/supplies", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor"]);

    req.log.info({ userId: req.auth?.userId, role: req.auth?.role }, "supplies.create request");

    const body = req.body as Partial<{
      name: string;
      unitBase: UnitBase;
      costPerUnit: number;
      stock: number;
      defaultConsumption: number;
      defaultRounding: "none" | "ceil";
    }>;

    if (!body.name || typeof body.name !== "string") {
      return reply.code(400).send({ error: "name requerido" });
    }
    if (!isUnitBase(body.unitBase)) {
      return reply.code(400).send({ error: "unitBase inválido" });
    }
    if (typeof body.costPerUnit !== "number" || body.costPerUnit < 0) {
      return reply.code(400).send({ error: "costPerUnit inválido" });
    }
    if (typeof body.stock !== "number" || body.stock < 0) {
      return reply.code(400).send({ error: "stock inválido" });
    }
    if (body.defaultConsumption !== undefined) {
      if (typeof body.defaultConsumption !== "number" || body.defaultConsumption <= 0) {
        return reply.code(400).send({ error: "defaultConsumption inválido" });
      }
    }
    if (body.defaultRounding !== undefined && !isRounding(body.defaultRounding)) {
      return reply.code(400).send({ error: "defaultRounding inválido" });
    }

    const insertRow: Record<string, unknown> = {
      name: body.name.trim(),
      unit_base: body.unitBase,
      cost_per_unit: body.costPerUnit,
      stock: body.stock,
    };

    if (body.defaultConsumption !== undefined) {
      insertRow.default_consumption = body.defaultConsumption;
      insertRow.default_rounding = body.defaultRounding ?? "none";
    }

    const { data, error } = await supabaseAdmin
      .from("supplies")
      .insert(insertRow)
      .select("*")
      .single();

    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send(data);
  });
}
