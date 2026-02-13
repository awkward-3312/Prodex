export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen p-8 flex items-center justify-center">
      <div className="max-w-md w-full border rounded-lg p-6 space-y-3">
        <h1 className="text-xl font-semibold">Acceso no autorizado</h1>
        <p className="text-sm opacity-70">
          Tu usuario no tiene permisos para entrar a esta sección.
        </p>
        <a className="inline-block underline" href="/quote-preview">
          Volver
        </a>
      </div>
    </main>
  );
}