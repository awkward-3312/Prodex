import type { FastifyInstance } from "fastify";
import { supabaseAdmin } from "../../lib/supabase.js";

export async function ordersConvertRoutes(app: FastifyInstance) {
  app.post("/quotes/:id/convert", async (req, reply) => {
    await app.requireAuth(req);
    const params = req.params as { id?: string };
    const quoteId = params.id;

    if (!quoteId) return reply.code(400).send({ error: "quote id requerido" });

    // 1) Leer quote
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select("id, status, expires_at")
      .eq("id", quoteId)
      .single();

    if (qErr) return reply.code(404).send({ error: "Cotización no encontrada" });

    const expiresAt = new Date(String((quote as any).expires_at));
    if (expiresAt.getTime() < Date.now()) {
      // marcar expired
      await supabaseAdmin.from("quotes").update({ status: "expired" }).eq("id", quoteId);
      return reply.code(400).send({ error: "Cotización expirada" });
    }

    if ((quote as any).status !== "draft" && (quote as any).status !== "approved") {
      return reply.code(400).send({ error: `No se puede convertir en estado ${(quote as any).status}` });
    }

    // 2) Leer líneas
    const { data: lines, error: lErr } = await supabaseAdmin
      .from("quote_lines")
      .select("supply_id, qty, supply_name")
      .eq("quote_id", quoteId);

    if (lErr) return reply.code(500).send({ error: String(lErr) });

    const supplyIds = (lines ?? []).map((l) => (l as any).supply_id).filter(Boolean);

    // 3) Leer stocks actuales
    const { data: supplies, error: sErr } = await   supabaseAdmin
      .from("supplies")
      .select("id, stock, name")
      .in("id", supplyIds);

    if (sErr) return reply.code(500).send({ error: String(sErr) });

    const stockById = new Map((supplies ?? []).map((s) => [s.id, Number((s as any).stock ?? 0)]));

    // 4) Validar stock
    const missing: Array<{ supplyId: string; name: string; needed: number; available: number }> = [];

    for (const ln of lines ?? []) {
      const supplyId = String((ln as any).supply_id);
      const needed = Number((ln as any).qty ?? 0);
      const available = stockById.get(supplyId) ?? 0;
      const name = String((ln as any).supply_name ?? "");

      if (available < needed) {
        missing.push({ supplyId, name, needed, available });
      }
    }

    if (missing.length > 0) {
      return reply.code(400).send({
        error: "Stock insuficiente",
        missing,
      });
    }

    // 5) Descontar stock (simple, secuencial)
    for (const ln of lines ?? []) {
      const supplyId = String((ln as any).supply_id);
      const needed = Number((ln as any).qty ?? 0);
      const available = stockById.get(supplyId) ?? 0;
      const newStock = available - needed;

      const { error: uErr } = await supabaseAdmin
        .from("supplies")
        .update({ stock: newStock })
        .eq("id", supplyId);

      if (uErr) return reply.code(500).send({ error: String(uErr) });
    }

    // 6) Marcar quote como converted
    const { data: updated, error: upErr } = await supabaseAdmin
      .from("quotes")
      .update({ status: "converted" })
      .eq("id", quoteId)
      .select("*")
      .single();

    if (upErr) return reply.code(500).send({ error: String(upErr) });

    return reply.send({
      ok: true,
      quote: updated,
    });
  });
}