import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../plugins/roles.js";
import { computeQuote } from "./quote.calculator.js";

type PreviewBody = {
  productId: string;
  inputs: Record<string, unknown>;
  applyIsv?: boolean;
  isvRate?: number;
};

export async function quotesPreviewRoutes(app: FastifyInstance) {
  app.post("/quotes/preview", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor", "vendedor"]);
    const body = req.body as Partial<PreviewBody>;

    req.log.info(
      { userId: req.auth?.userId, role: req.auth?.role, productId: body.productId },
      "quotes.preview request"
    );

    const applyIsv = Boolean(body.applyIsv);
    const isvRate = Number.isFinite(body.isvRate as number) ? Number(body.isvRate) : 0.15;

    try {
      const result = await computeQuote({
        productId: String(body.productId ?? ""),
        inputs: (body.inputs ?? {}) as Record<string, unknown>,
        applyIsv,
        isvRate,
      });

      return reply.send({
        inputs: result.inputs,
        template: {
          wastePct: result.template.wastePct,
          marginPct: result.template.marginPct,
          operationalPct: result.template.operationalPct,
        },
        breakdown: result.breakdown.map((b) => ({
          supplyName: b.supply_name,
          unitBase: b.unit_base,
          qty: b.qty,
          costPerUnit: b.cost_per_unit,
          lineCost: b.line_cost,
          formula: b.qty_formula,
        })),
        totals: result.totals,
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "Error");
      if (msg.includes("no encontrado")) return reply.code(404).send({ error: msg });
      if (msg.includes("inválido")) return reply.code(400).send({ error: msg });
      return reply.code(500).send({ error: msg });
    }
  });
}
