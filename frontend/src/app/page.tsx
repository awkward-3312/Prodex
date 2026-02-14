import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default async function Home() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`, {
    cache: "no-store",
  });

  const data = await res.json();

  return (
    <AppShell
      title="Inicio"
      subtitle="Estado general del servicio y accesos rápidos."
      crumbs={[{ label: "Inicio" }]}
      headerRight={<Badge variant="neutral">Status</Badge>}
    >
      <Card className="p-5">
        <h2 className="text-base font-semibold">Salud del backend</h2>
        <pre className="mt-4 rounded-lg border border-[#334155] bg-[#0F172A]/80 p-4 text-sm text-[#94A3B8]">
          {JSON.stringify(data, null, 2)}
        </pre>
      </Card>
    </AppShell>
  );
}
