"use client";

export default function PropertiesError({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <section className="rounded-md border p-6">
      <h1 className="font-semibold">İlan ekranı açılamadı</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        İşlem güvenli şekilde durduruldu. Tekrar deneyebilirsiniz.
      </p>
      <button
        className="mt-4 rounded-md border px-3 py-2 text-sm"
        onClick={reset}
      >
        Tekrar dene
      </button>
    </section>
  );
}
