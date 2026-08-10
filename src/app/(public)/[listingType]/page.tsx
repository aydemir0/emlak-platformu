import type { Metadata } from "next";
import Link from "next/link";

import type { PublicPropertyPage } from "@/application/public-properties/public-property-contracts";
import {
  buildCanonicalListingPath,
  type PublicListingType,
  type PublicSearchParamsInput,
} from "@/domain/public-properties/public-property-seo";
import { PublicPropertyCard } from "@/features/public-properties/components/public-property-card";
import {
  buildPublicPropertyListingMetadata,
  loadPublicPropertyListingPage,
} from "@/features/public-properties/public-property-page.server";

type ListingPageProps = Readonly<{
  params: Promise<{ listingType: string }>;
  searchParams: Promise<PublicSearchParamsInput>;
}>;

function listingLabel(listingType: PublicListingType): string {
  return listingType === "SATILIK" ? "Satılık" : "Kiralık";
}

function pageHref(
  listingType: PublicListingType,
  page: PublicPropertyPage,
  nextPage: number,
): string {
  return buildCanonicalListingPath(listingType, {
    ...page.query,
    page: nextPage,
  });
}

export function PublicPropertyListingView({
  listingType,
  page,
}: Readonly<{
  listingType: PublicListingType;
  page: PublicPropertyPage;
}>) {
  const label = listingLabel(listingType);
  const hasNextPage = page.page * 24 < page.total;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {label} ilanlar
        </h1>
        <p className="text-muted-foreground">
          {page.total} doğrulanmış public ilan bulundu.
        </p>
      </header>

      {page.items.length === 0 ? (
        <p role="status">Bu seçim için henüz ilan bulunmuyor.</p>
      ) : (
        <section
          aria-label={`${label} mülkler`}
          className="grid gap-6 md:grid-cols-2"
        >
          {page.items.map((property) => (
            <PublicPropertyCard key={property.publicId} property={property} />
          ))}
        </section>
      )}

      {page.page > 1 || hasNextPage ? (
        <nav aria-label="Sayfalama" className="flex justify-between">
          {page.page > 1 ? (
            <Link href={pageHref(listingType, page, page.page - 1)}>
              Önceki sayfa
            </Link>
          ) : (
            <span />
          )}
          {hasNextPage ? (
            <Link href={pageHref(listingType, page, page.page + 1)}>
              Sonraki sayfa
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: ListingPageProps): Promise<Metadata> {
  const { listingType } = await params;
  const data = await loadPublicPropertyListingPage(
    listingType,
    await searchParams,
  );
  return data === null ? {} : buildPublicPropertyListingMetadata(data);
}

export default async function PublicPropertyListingPage({
  params,
  searchParams,
}: ListingPageProps) {
  const { listingType } = await params;
  const data = await loadPublicPropertyListingPage(
    listingType,
    await searchParams,
  );
  return data === null ? null : <PublicPropertyListingView {...data} />;
}
