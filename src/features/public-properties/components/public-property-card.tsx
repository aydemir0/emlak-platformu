import Link from "next/link";

import type { PublicPropertySummary } from "@/application/public-properties/public-property-contracts";
import { buildPropertyCanonicalPath } from "@/domain/public-properties/public-property-seo";
import { PublicPropertyGallery } from "@/features/public-properties/components/public-property-gallery";

function formatPrice(property: PublicPropertySummary): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: property.price.currencyCode,
    maximumFractionDigits: 0,
  }).format(property.price.amountMinor / 100);
}

export function PublicPropertyCard({
  property,
}: Readonly<{ property: PublicPropertySummary }>) {
  const href = buildPropertyCanonicalPath(property);

  return (
    <article className="border-border overflow-hidden rounded-xl border">
      <div className="p-2">
        <PublicPropertyGallery
          media={property.media.slice(0, 1)}
          title={property.title}
        />
      </div>
      <div className="space-y-2 px-4 pt-2 pb-5">
        <p className="text-muted-foreground text-sm">
          {property.location.district}, {property.location.city}
        </p>
        <h2 className="text-lg font-semibold">
          <Link className="hover:underline" href={href}>
            {property.title}
          </Link>
        </h2>
        <p className="font-medium">{formatPrice(property)}</p>
      </div>
    </article>
  );
}
