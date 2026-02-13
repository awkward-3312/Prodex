"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { apiFetch } from "@/lib/apiFetch";

type Role = "admin" | "supervisor" | "vendedor";

export function RequireAuth({
  children,
  allowRoles,
}: {
  children: React.ReactNode;
  allowRoles?: Role[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  // ✅ dependencia estable (string)
  const rolesKey = (allowRoles ?? []).join("|");

  useEffect(() => {
    let alive = true;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!alive) return;

      if (!token) {
        if (pathname !== "/login") router.replace("/login");
        setReady(false);
        return;
      }

      // ✅ reconstruimos allowRoles desde rolesKey (así no usamos allowRoles aquí)
      const allowed: Role[] = rolesKey
        ? (rolesKey.split("|").filter(Boolean) as Role[])
        : [];

      // si no hay restricción por rol
      if (allowed.length === 0) {
        setReady(true);
        return;
      }

      const API = process.env.NEXT_PUBLIC_API_URL;
      const res = await apiFetch(`${API}/me`);
      const me = await res.json().catch(() => null);

      if (!alive) return;

      if (!res.ok || !me?.role) {
        router.replace("/login");
        setReady(false);
        return;
      }

      const role = String(me.role) as Role;

      if (!allowed.includes(role)) {
        router.replace("/unauthorized"); // o /login si no tienes esa ruta
        setReady(false);
        return;
      }

      setReady(true);
    })();

    return () => {
      alive = false;
    };
  }, [router, pathname, rolesKey]);

  if (!ready) return <div className="p-8">Cargando...</div>;
  return <>{children}</>;
}