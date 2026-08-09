"use client";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section>
      <h1 className="text-xl font-semibold">Yönetim isteği tamamlanamadı</h1>
      <button
        className="mt-4 rounded-md border px-4 py-2 text-sm"
        onClick={reset}
        type="button"
      >
        Yeniden dene
      </button>
    </section>
  );
}
