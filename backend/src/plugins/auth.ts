import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { createLocalJWKSet, jwtVerify } from "jose";
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

async function authPlugin(app: FastifyInstance) {
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const issuer = process.env.SUPABASE_JWT_ISSUER;
  const apikey = process.env.SUPABASE_ANON_KEY; // <- NUEVO

  if (!projectRef || !issuer || !apikey) {
    throw new Error(
      "Faltan SUPABASE_PROJECT_REF / SUPABASE_JWT_ISSUER / SUPABASE_ANON_KEY en backend/.env"
    );
  }

  // 1) Bajamos JWKS con apikey (porque Supabase te da 401 sin apikey)
  const jwksUrl = `https://${projectRef}.supabase.co/auth/v1/.well-known/jwks.json`;
  const jwksRes = await fetch(jwksUrl, { headers: { apikey } });

  if (!jwksRes.ok) {
    const txt = await jwksRes.text().catch(() => "");
    throw new Error(`No se pudo obtener JWKS (${jwksRes.status}) ${txt}`);
  }

  const jwks = await jwksRes.json();
  const JWKS = createLocalJWKSet(jwks);

  // 2) Decorator
  app.decorate("requireAuth", async (req: FastifyRequest) => {
    const token = getBearerToken(req);
    if (!token) {
      throw Object.assign(new Error("No auth token"), { statusCode: 401 });
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer,
      audience: "authenticated",
    });

    const sub = payload.sub;
    if (!sub || typeof sub !== "string") {
      throw Object.assign(new Error("JWT inválido"), { statusCode: 401 });
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", sub)
      .single();

    if (error || !profile?.role) {
      throw Object.assign(new Error("Perfil/rol no encontrado"), { statusCode: 403 });
    }

    req.auth = { userId: sub, jwt: token, role: profile.role };
  });
}

export default fp(authPlugin);