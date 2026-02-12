import type { FastifyInstance } from "fastify";
import type { UnitBase } from "./supplies.model.js";
import { supabase } from "../../lib/supabase.js";

function isUnitBase(v: unknown): v is UnitBase {
  return v === "u" || v === "hoja" || v === "ml" || v === "m" || v === "m2";
}

export async function suppliesRoutes(app: FastifyInstance) {
  // Listar insumos (desde Supabase)
  app.get("/supplies", async (_req, reply) => {
    const { data, error } = await supabase
      .from("supplies")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(data);
  });

  // Crear insumo (en Supabase)
  app.post("/supplies", async (req, reply) => {
    const body = req.body as Partial<{
      name: string;
      unitBase: UnitBase;
      costPerUnit: number;
      stock: number;
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

    const { data, error } = await supabase
      .from("supplies")
      .insert({
        name: body.name.trim(),
        unit_base: body.unitBase,
        cost_per_unit: body.costPerUnit,
        stock: body.stock,
      })
      .select("*")
      .single();

    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send(data);
  });
}
