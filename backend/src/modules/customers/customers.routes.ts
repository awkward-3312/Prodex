import type { FastifyInstance, FastifyRequest } from "fastify";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireRole } from "../../plugins/roles.js";

type CustomerInput = {
  name?: string;
  rtn?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function customersRoutes(app: FastifyInstance) {
  app.get("/customers", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor", "vendedor"]);

    const query = req.query as { search?: string; limit?: string; offset?: string };
    const search = cleanText(query.search);
    const limitRaw = Number(query.limit ?? 200);
    const offsetRaw = Number(query.offset ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, limitRaw)) : 200;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    const isAdmin = req.auth?.role === "admin";
    const selectCols = isAdmin
      ? "id, name, rtn, phone, email, address, notes, created_at"
      : "id, name, rtn";

    let builder = supabaseAdmin
      .from("customers")
      .select(selectCols)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      const term = `%${search}%`;
      builder = isAdmin
        ? builder.or(
            `name.ilike.${term},rtn.ilike.${term},phone.ilike.${term},email.ilike.${term},address.ilike.${term}`
          )
        : builder.or(`name.ilike.${term},rtn.ilike.${term}`);
    }

    const { data, error } = await builder;
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(data ?? []);
  });

  app.post("/customers", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin"]);

    const body = req.body as CustomerInput;
    const name = cleanText(body.name);
    if (!name) return reply.code(400).send({ error: "name requerido" });

    const payload = {
      name,
      rtn: cleanText(body.rtn),
      phone: cleanText(body.phone),
      email: cleanText(body.email),
      address: cleanText(body.address),
      notes: cleanText(body.notes),
    };

    const { data, error } = await supabaseAdmin
      .from("customers")
      .insert(payload)
      .select("id, name, rtn, phone, email, address, notes, created_at")
      .single();

    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send(data);
  });
}
