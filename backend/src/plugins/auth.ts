import type { FastifyInstance, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { supabaseAdmin } from "../lib/supabase.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      userId: string;
      jwt: string;
      role: "admin" | "supervisor" | "vendedor";
    };
  }

  interface FastifyInstance {
    requireAuth: (req: FastifyRequest) => Promise<void>;
  }
}

function getBearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;

  const [type, token] = h.split(" ");
  if (type !== "Bearer" || !token) return null;

  return token;
}

export async function authPlugin(app: FastifyInstance) {
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const issuer = process.env.SUPABASE_JWT_ISSUER;

  if (!projectRef || !issuer) {
    throw new Error("Faltan SUPABASE_PROJECT_REF o SUPABASE_JWT_ISSUER en backend/.env");
  }

  const JWKS = createRemoteJWKSet(
    new URL(`https://${projectRef}.supabase.co/auth/v1/keys`)
  );

  app.decorate("requireAuth", async (req: FastifyRequest) => {
    const token = getBearerToken(req);
    if (!token) {
      return Promise.reject(Object.assign(new Error("No auth token"), { statusCode: 401 }));
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer,
      audience: "authenticated",
    });

    const sub = payload.sub;
    if (!sub || typeof sub !== "string") {
      return Promise.reject(Object.assign(new Error("JWT inválido (sin sub)"), { statusCode: 401 }));
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", sub)
      .single();

    if (error || !profile?.role) {
      return Promise.reject(
        Object.assign(new Error("Perfil/rol no encontrado"), { statusCode: 403 })
      );
    }

    req.auth = { userId: sub, jwt: token, role: profile.role };
  });
}