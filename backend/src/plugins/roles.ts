import type { FastifyRequest } from "fastify";

type Role = "admin" | "supervisor" | "vendedor";

export function requireRole(req: FastifyRequest, allow: Role[]) {
  const role = req.auth?.role as Role | undefined;

  if (!role) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  if (!allow.includes(role)) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
}