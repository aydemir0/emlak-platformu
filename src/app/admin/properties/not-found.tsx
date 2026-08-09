import Link from "next/link";

export default function PropertyNotFound() {
  return (
    <section className="rounded-md border p-6">
      <h1 className="font-semibold">İlan bulunamadı</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Kayıt yok veya bu kayda erişim yetkiniz bulunmuyor.
      </p>
      <Link
        className="mt-4 inline-block text-sm underline"
        href="/admin/properties"
      >
        İlanlara dön
      </Link>
    </section>
  );
}
