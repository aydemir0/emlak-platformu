import Link from "next/link";
import { redirect } from "next/navigation";

import { getVerifiedAuthIdentity } from "@/infrastructure/supabase/verified-session.server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const identity = await getVerifiedAuthIdentity();
  if (!identity) redirect("/");

  return (
    <div className="bg-muted/30 min-h-svh">
      <header className="bg-background border-b">
        <nav
          aria-label="Yönetim navigasyonu"
          className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"
        >
          <span className="font-semibold">Yönetim</span>
          <Link
            className="text-muted-foreground hover:text-foreground text-sm"
            href="/"
          >
            Public site
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
