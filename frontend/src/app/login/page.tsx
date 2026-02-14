"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/alerts";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace("/quote-preview");
    };
    void check();
  }, [router]);

  const signIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      toast("error", error.message);
      return;
    }

    router.replace("/quote-preview");
  };

  return (
    <main className="min-h-screen bg-[#0F172A] text-[#E2E8F0] p-8 flex items-center justify-center">
      <div className="w-full max-w-md border border-[#334155] bg-[#1E293B] rounded-lg p-6 space-y-4">
        <h1 className="text-2xl font-semibold">PRODEX · Login</h1>

        <Input
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Input
          placeholder="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button variant="primary" className="w-full" onClick={signIn} disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </div>
    </main>
  );
}
