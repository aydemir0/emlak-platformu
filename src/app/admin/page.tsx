import Link from "next/link";

export default function AdminHomePage() {
  return (
    <section
      aria-labelledby="admin-heading"
      className="bg-background rounded-lg border p-6"
    >
      <p className="text-muted-foreground text-sm font-medium">Yönetim</p>
      <h1 id="admin-heading" className="mt-2 text-2xl font-semibold">
        Operasyon başlangıcı
      </h1>
      <p className="text-muted-foreground mt-3 max-w-2xl text-sm">
        İlan taslaklarını yetkilendirilmiş application use case’leri üzerinden
        yönetin.
      </p>
      <Link
        className="mt-5 inline-block text-sm font-medium underline"
        href="/admin/properties"
      >
        İlanlara git
      </Link>
    </section>
  );
}
