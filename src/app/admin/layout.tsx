import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ApplicationError,
  isReportableOperationalFailure,
} from "@/application/errors/application-error";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { reportUnexpectedError } from "@/infrastructure/observability/runtime-observability.server";
import { createRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const requestContext = createRequestContext(await headers());
  try {
    await requireStaffPrincipal();
  } catch (error) {
    if (
      error instanceof ApplicationError &&
      ["UNAUTHENTICATED", "MFA_REQUIRED", "FORBIDDEN"].includes(error.code)
    ) {
      redirect("/");
    }
    if (isReportableOperationalFailure(error)) {
      reportUnexpectedError(error, {
        correlationId: requestContext.correlationId,
        operation: "admin.layout.authenticate",
      });
    }
    throw error;
  }

  return (
    <div className="bg-muted/30 min-h-svh">
      <header className="bg-background border-b">
        <nav
          aria-label="Yönetim navigasyonu"
          className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"
        >
          <div className="flex items-center gap-5">
            <span className="font-semibold">Yönetim</span>
            <Link
              className="text-muted-foreground hover:text-foreground text-sm"
              href="/admin/properties"
            >
              İlanlar
            </Link>
            <Link
              className="text-muted-foreground hover:text-foreground text-sm"
              href="/admin/leads"
            >
              Leadler
            </Link>
            <Link
              className="text-muted-foreground hover:text-foreground text-sm"
              href="/admin/appointments"
            >
              Randevular
            </Link>
          </div>
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
