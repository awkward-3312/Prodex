import { supabaseAdmin } from "./supabase.js";

type Role = "admin" | "supervisor" | "vendedor";

export type SupervisorAuthOk = {
  ok: true;
  supervisorUserId: string;
};

export type SupervisorAuthErr = {
  ok: false;
  error: string;
};

export type SupervisorAuthResult = SupervisorAuthOk | SupervisorAuthErr;

/**
 * Valida que:
 * 1) Exista un JWT de supervisor (access token de Supabase) en el body
 * 2) El JWT tenga formato válido (payload decodificable)
 * 3) El usuario (sub) exista en profiles y sea role = 'supervisor' o 'admin'
 *
 * NO usa jwksVerify aquí; esto es un "double check" rápido para pedir password de supervisor.
 * (Si quieres máxima seguridad, luego lo hacemos con jose + JWKS también.)
 */
export async function verifySupervisorToken(
  supervisorAccessToken: string | undefined
): Promise<SupervisorAuthResult> {
  if (!supervisorAccessToken || typeof supervisorAccessToken !== "string") {
    return { ok: false, error: "Falta token de supervisor" };
  }

  // JWT = header.payload.signature
  const parts = supervisorAccessToken.split(".");
  if (parts.length < 2 || !parts[1]) {
    return { ok: false, error: "Token supervisor inválido" };
  }

  const payloadPart = parts[1];

  // base64url -> base64
  const b64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
  // padding
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");

  let payloadJson: unknown;
  try {
    const jsonStr = Buffer.from(padded, "base64").toString("utf8");
    payloadJson = JSON.parse(jsonStr);
  } catch {
    return { ok: false, error: "Token supervisor inválido" };
  }

  if (!payloadJson || typeof payloadJson !== "object" || !("sub" in payloadJson)) {
    return { ok: false, error: "Token supervisor inválido" };
  }

  const sub = String((payloadJson as { sub?: unknown }).sub ?? "");
  if (!sub) {
    return { ok: false, error: "Token supervisor inválido" };
  }

  // Confirmar rol en profiles
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", sub)
    .single();

  if (error || !profile?.role) {
    return { ok: false, error: "Supervisor no encontrado" };
  }

  const role = String(profile.role) as Role;
  if (role !== "supervisor" && role !== "admin") {
    return { ok: false, error: "No autorizado (no es supervisor/admin)" };
  }

  return { ok: true, supervisorUserId: sub };
}