import Link from "next/link";

import type { PublicPropertyDetail } from "@/application/public-properties/public-property-contracts";

export type PublicPropertyBreadcrumbItem = Readonly<{
  name: string;
  href: string;
}>;

export function getPublicPropertyBreadcrumbItems(
  property: PublicPropertyDetail,
): readonly PublicPropertyBreadcrumbItem[] {
  const listingPath =
    property.listingType === "SATILIK" ? "/satilik" : "/kiralik";
  const search = new URLSearchParams();
  search.set("city", property.citySlug);
  const cityPath = `${listingPath}?${search.toString()}`;
  search.set("district", property.districtSlug);
  const districtPath = `${listingPath}?${search.toString()}`;
  search.set("propertyType", property.propertyTypeSlug);

  return [
    { name: "Ana sayfa", href: "/" },
    {
      name: property.listingType === "SATILIK" ? "Satılık" : "Kiralık",
      href: listingPath,
    },
    { name: property.location.city, href: cityPath },
    { name: property.location.district, href: districtPath },
    {
      name: property.propertyTypeLabel,
      href: `${listingPath}?${search.toString()}`,
    },
  ];
}

export function PublicPropertyBreadcrumbs({
  property,
}: Readonly<{ property: PublicPropertyDetail }>) {
  const items = getPublicPropertyBreadcrumbItems(property);

  return (
    <nav aria-label="İçerik yolu">
      <ol className="text-muted-foreground flex flex-wrap gap-2 text-sm">
        {items.map((item) => (
          <li key={item.href}>
            <Link className="hover:text-foreground" href={item.href}>
              {item.name}
            </Link>
            <span aria-hidden="true" className="ml-2">
              /
            </span>
          </li>
        ))}
        <li aria-current="page" className="text-foreground">
          {property.title}
        </li>
      </ol>
    </nav>
  );
}
