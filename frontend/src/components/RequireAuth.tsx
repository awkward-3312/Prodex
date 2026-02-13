"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      const hasSession = !!data?.session;

      // debug útil
      console.log("RequireAuth session?", hasSession, error?.message ?? null);

      if (!hasSession) {
        // evita bucle si ya estás en /login
        if (pathname !== "/login") router.replace("/login");
        setReady(false);
        return;
      }

      setReady(true);
    })();

    return () => {
      mounted = false;
    };
  }, [router, pathname]);

  if (!ready) return <div className="p-8">Cargando...</div>;
  return <>{children}</>;
}