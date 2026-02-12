export default async function Home() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`, {
    cache: "no-store",
  });

  const data = await res.json();

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">PRODEX</h1>
      <pre className="mt-6 rounded-lg border p-4 bg-white">
        {JSON.stringify(data, null, 2)}
      </pre>
    </main>
  );
}
