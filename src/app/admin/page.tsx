export default function AdminHomePage() {
  return (
    <section
      aria-labelledby="admin-heading"
      className="bg-background rounded-lg border p-6"
    >
      <p className="text-muted-foreground text-sm font-medium">
        Application foundation
      </p>
      <h1 id="admin-heading" className="mt-2 text-2xl font-semibold">
        Yönetim altyapısı hazır
      </h1>
      <p className="text-muted-foreground mt-3 max-w-2xl text-sm">
        İş akışları ve operasyonel ekranlar sonraki fazlarda, yetkilendirilmiş
        application use case’leri üzerinden eklenecek.
      </p>
    </section>
  );
}
