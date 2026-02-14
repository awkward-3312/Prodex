import type { FastifyInstance, FastifyRequest } from "fastify";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireRole } from "../../plugins/roles.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchQuery = {
  q?: string;
};

export async function productsRoutes(app: FastifyInstance) {
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
}
