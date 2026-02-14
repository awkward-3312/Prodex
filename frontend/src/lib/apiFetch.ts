import { supabase } from "@/lib/supabaseClient";

type ApiFetchInit = RequestInit & { auth?: boolean };

export async function apiFetch(input: RequestInfo | URL, init: ApiFetchInit = {}) {
  const headers = new Headers(init.headers);

  const authOn = init.auth !== false;

  if (authOn) {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (process.env.NODE_ENV === "development") {
      console.log("[apiFetch] session?", !!data.session, error?.message ?? null);
    }

    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
