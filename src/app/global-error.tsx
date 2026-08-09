"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body>
        <main>
          <h1>Uygulama kullanılamıyor</h1>
          <button onClick={reset} type="button">
            Yeniden dene
          </button>
        </main>
      </body>
    </html>
  );
}
