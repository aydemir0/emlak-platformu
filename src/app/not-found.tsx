import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Sayfa bulunamadı</h1>
      <p className="text-muted-foreground mt-3">İstenen sayfa mevcut değil.</p>
      <Link className="mt-6 inline-block text-sm underline" href="/">
        Ana sayfaya dön
      </Link>
    </main>
  );
}
