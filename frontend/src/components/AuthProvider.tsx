"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  id: string;
  full_name: string | null;
  role: "admin" | "supervisor" | "vendedor";
};

type AuthState = {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
};

const AuthCtx = createContext<AuthState>({
  loading: true,
  userId: null,
  profile: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    userId: null,
    profile: null,
  });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;

      if (!mounted) return;

      if (!uid) {
        setState({ loading: false, userId: null, profile: null });
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", uid)
        .single();

      if (!mounted) return;

      setState({
        loading: false,
        userId: uid,
        profile: (profile as Profile) ?? null,
      });
    };

    void load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
