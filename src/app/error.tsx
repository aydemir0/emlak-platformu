"use client";

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Bir sorun oluştu</h1>
      <p className="text-muted-foreground mt-3">
        İstek tamamlanamadı. Güvenle yeniden deneyebilirsiniz.
      </p>
      <button
        className="mt-6 rounded-md border px-4 py-2 text-sm"
        onClick={reset}
        type="button"
      >
        Yeniden dene
      </button>
    </main>
  );
}
