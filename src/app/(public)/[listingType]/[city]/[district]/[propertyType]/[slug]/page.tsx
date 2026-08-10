import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import type { PublicPropertyDetail } from "@/application/public-properties/public-property-contracts";
import { PublicPropertyBreadcrumbs } from "@/features/public-properties/components/public-property-breadcrumbs";
import { PublicPropertyGallery } from "@/features/public-properties/components/public-property-gallery";
import { PublicLeadContactForm } from "@/features/leads/components/public-lead-contact-form";
import {
  buildPublicPropertyBreadcrumbJsonLd,
  buildPublicPropertyMetadata,
  loadPublicPropertyDetailPage,
  serializePublicPropertyJsonLd,
  type PublicPropertyDetailRouteParams,
} from "@/features/public-properties/public-property-page.server";

type DetailPageProps = Readonly<{
  params: Promise<PublicPropertyDetailRouteParams>;
}>;

function formatPrice(property: PublicPropertyDetail): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: property.price.currencyCode,
    maximumFractionDigits: 0,
  }).format(property.price.amountMinor / 100);
}

export function PublicPropertyDetailView({
  property,
}: Readonly<{ property: PublicPropertyDetail }>) {
  const jsonLd = buildPublicPropertyBreadcrumbJsonLd(property);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      <PublicPropertyBreadcrumbs property={property} />
      <PublicPropertyGallery media={property.media} title={property.title} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <article className="space-y-6">
          <header className="space-y-3">
            <p className="text-muted-foreground">
              {property.propertyTypeLabel} · {property.location.district},{" "}
              {property.location.city}
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">
              {property.title}
            </h1>
            <p className="text-2xl font-semibold">{formatPrice(property)}</p>
          </header>

          {property.location.locationVisibility === "EXACT" &&
          property.location.addressLine ? (
            <p>{property.location.addressLine}</p>
          ) : null}

          {property.description ? (
            <p className="leading-7">{property.description}</p>
          ) : null}

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {property.grossAreaSqm === null ? null : (
              <div>
                <dt className="text-muted-foreground text-sm">Brüt alan</dt>
                <dd>{property.grossAreaSqm} m²</dd>
              </div>
            )}
            {property.netAreaSqm === null ? null : (
              <div>
                <dt className="text-muted-foreground text-sm">Net alan</dt>
                <dd>{property.netAreaSqm} m²</dd>
              </div>
            )}
            {property.bedroomCount === null ? null : (
              <div>
                <dt className="text-muted-foreground text-sm">Yatak odası</dt>
                <dd>{property.bedroomCount}</dd>
              </div>
            )}
            {property.bathroomCount === null ? null : (
              <div>
                <dt className="text-muted-foreground text-sm">Banyo</dt>
                <dd>{property.bathroomCount}</dd>
              </div>
            )}
          </dl>
        </article>

        <aside className="border-border h-fit space-y-3 rounded-xl border p-5">
          <h2 className="font-semibold">Bu ilanla ilgileniyor musunuz?</h2>
          <p className="text-muted-foreground text-sm">
            İletişim bilgilerinizi paylaşın; ekibimiz size dönüş yapsın.
          </p>
          <PublicLeadContactForm propertyId={property.publicId} />
        </aside>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: serializePublicPropertyJsonLd(jsonLd),
        }}
        type="application/ld+json"
      />
    </main>
  );
}

export async function generateMetadata({
  params,
}: DetailPageProps): Promise<Metadata> {
  const resolution = await loadPublicPropertyDetailPage(await params);
  return resolution.kind === "PROPERTY"
    ? buildPublicPropertyMetadata(resolution.property)
    : {};
}

export default async function PublicPropertyDetailPage({
  params,
}: DetailPageProps) {
  const resolution = await loadPublicPropertyDetailPage(await params);
  switch (resolution.kind) {
    case "PROPERTY":
      return <PublicPropertyDetailView property={resolution.property} />;
    case "REDIRECT":
      permanentRedirect(resolution.location);
    case "NOT_FOUND":
      notFound();
  }
}
