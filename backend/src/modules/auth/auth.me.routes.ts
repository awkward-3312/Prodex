 import type { FastifyInstance, FastifyRequest } from "fastify";

export default async function authMeRoutes(app: FastifyInstance) {
  app.get("/me", async (req: FastifyRequest, reply) => {
    try {
      await app.requireAuth(req);

      return reply.send({
        userId: req.auth!.userId,
        role: req.auth!.role,
        fullName: req.auth!.fullName ?? null,
      });
    } catch (e: any) {
      const code = Number(e?.statusCode ?? 401);
      return reply.code(code).send({
        error: code === 401 ? "Unauthorized" : "Forbidden",
        message: e?.message ?? "Auth error",
      });
    }
  });
}
