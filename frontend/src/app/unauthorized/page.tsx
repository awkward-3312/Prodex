import { Card } from "@/components/ui/Card";

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen bg-[#0F172A] text-[#E2E8F0] p-8 flex items-center justify-center">
      <Card className="max-w-md w-full space-y-3">
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
