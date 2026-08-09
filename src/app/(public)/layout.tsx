import Link from "next/link";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="border-b">
        <nav
          aria-label="Ana navigasyon"
          className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4"
        >
          <Link className="font-semibold" href="/">
            Emlak Platformu
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground text-sm"
            href="/admin"
          >
            Yönetim
          </Link>
        </nav>
      </header>
      {children}
    </>
  );
}
