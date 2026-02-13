import { supabase } from "@/lib/supabaseClient";

export async function apiFetch(input: RequestInfo, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;

  const headers = new Headers(init.headers);

  // solo setea content-type si NO es FormData
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}