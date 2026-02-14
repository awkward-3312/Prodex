import { Card } from "@/components/ui/Card";

export default function UnauthorizedPage() {
  return (
    <main className="relative min-h-screen bg-[#0B1220] text-[#E2E8F0] p-8 flex items-center justify-center">
      <div className="pointer-events-none absolute -top-24 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 left-0 h-80 w-80 rounded-full bg-[#22C55E]/10 blur-3xl" />

      <Card className="max-w-md w-full space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-[#334155] bg-[#1E293B] flex items-center justify-center">
            <img src="/prodex-logo.png" alt="Prodex" className="h-7 w-7 object-contain" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[#94A3B8]">PRODEX</div>
            <div className="text-sm font-semibold">Panel operativo</div>
          </div>
        </div>
        <h1 className="text-xl font-semibold">Acceso no autorizado</h1>
        <p className="text-sm text-[#94A3B8]">
          Tu usuario no tiene permisos para entrar a esta sección.
        </p>
        <a className="inline-block text-sm font-semibold text-[#38BDF8] hover:underline" href="/quote-preview">
          Volver
        </a>
      </Card>
    </main>
  );
}
