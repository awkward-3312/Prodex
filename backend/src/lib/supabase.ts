import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env");
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

export function createAuthClient() {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY en backend/.env");
  }
  return createClient(url, anonKey, { auth: { persistSession: false } });
}
