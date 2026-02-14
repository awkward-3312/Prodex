import type { FastifyInstance } from "fastify";
import { supabaseAdmin } from "../../lib/supabase.js";

type Role = "admin" | "supervisor" | "vendedor";

export async function quotesListRoutes(app: FastifyInstance) {
  app.get("/quotes", async (req, reply) => {
    await app.requireAuth(req);

    const role = req.auth!.role as Role;
    const userId = req.auth!.userId;

    let query = supabaseAdmin
      .from("quotes")
      .select("*")
      .order("created_at", { ascending: false });

    // vendedor solo ve las suyas
    if (role === "vendedor") {
      query = query.eq("created_by", userId);
    }

    const { data, error } = await query;

    if (error) return reply.code(500).send({ error: error.message });

    return reply.send(data ?? []);
  });
}