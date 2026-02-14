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
    <main className="relative min-h-screen bg-[#0B1220] text-[#E2E8F0]">
      <div className="pointer-events-none absolute -top-32 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 left-0 h-80 w-80 rounded-full bg-[#22C55E]/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-5xl items-center px-6 py-12">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-[#334155] bg-[#0F172A]/80 p-8 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl border border-[#334155] bg-[#1E293B] flex items-center justify-center">
                <img src="/prodex-logo.png" alt="Prodex" className="h-8 w-8 object-contain" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-[#94A3B8]">PRODEX</div>
                <div className="text-lg font-semibold">Panel operativo</div>
              </div>
            </div>
            <div className="mt-6 text-sm text-[#94A3B8]">
              Accede con tu cuenta corporativa para cotizar, revisar insumos y convertir pedidos en segundos.
            </div>
            <div className="mt-4 rounded-2xl border border-[#334155] bg-[#0B1220]/80 p-4 text-xs text-[#94A3B8]">
              Usa el correo y contraseña asignados por administración.
            </div>
          </div>

          <div className="rounded-3xl border border-[#334155] bg-[#1E293B] p-8 shadow-xl">
            <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
            <p className="mt-2 text-sm text-[#94A3B8]">Ingresa tus credenciales para continuar.</p>

            <div className="mt-6 space-y-4">
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
          </div>
        </div>
      </div>
    </main>
  );
}
