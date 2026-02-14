import type { FastifyInstance, FastifyRequest } from "fastify";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireRole } from "../../plugins/roles.js";

export async function suppliesPurchasesRoutes(app: FastifyInstance) {
  app.post("/supplies/:id/purchases", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor"]);

    const params = req.params as { id?: string };
    const supplyId = params.id;

    const body = req.body as Partial<{
      qty: number;
      totalCost: number;
      notes?: string;
    }>;

    if (!supplyId) return reply.code(400).send({ error: "supply id requerido" });
    if (typeof body.qty !== "number" || body.qty <= 0) {
      return reply.code(400).send({ error: "qty inválido" });
    }
    if (typeof body.totalCost !== "number" || body.totalCost < 0) {
      return reply.code(400).send({ error: "totalCost inválido" });
    }

    req.log.info(
      { userId: req.auth?.userId, role: req.auth?.role, supplyId },
      "supplies.purchase request"
    );

    // 1) Traer supply actual
    const { data: supply, error: sErr } = await supabaseAdmin
      .from("supplies")
      .select("id, stock, cost_per_unit")
      .eq("id", supplyId)
      .single();

    if (sErr) return reply.code(404).send({ error: "Supply no encontrado" });

    const currentStock = Number(supply.stock ?? 0);
    const currentCpu = Number(supply.cost_per_unit ?? 0);

    const qty = body.qty;
    const totalCost = body.totalCost;

    const newStock = currentStock + qty;

    const newCpu =
      newStock === 0
        ? 0
        : (currentStock * currentCpu + totalCost) / newStock;

    // 2) Insertar compra
    const { data: purchase, error: pErr } = await supabaseAdmin
      .from("supply_purchases")
      .insert({
        supply_id: supplyId,
        qty,
        total_cost: totalCost,
        notes: body.notes ?? null,
      })
      .select("*")
      .single();

    if (pErr) return reply.code(500).send({ error: pErr.message });

    // 3) Actualizar supply (stock + costo promedio)
    const { data: updated, error: uErr } = await supabaseAdmin
      .from("supplies")
      .update({
        stock: newStock,
        cost_per_unit: newCpu,
      })
      .eq("id", supplyId)
      .select("*")
      .single();

    if (uErr) return reply.code(500).send({ error: uErr.message });

    return reply.code(201).send({
      purchase,
      updatedSupply: updated,
    });
  });
}
