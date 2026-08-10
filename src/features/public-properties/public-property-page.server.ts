import "server-only";

import type { Metadata } from "next";
import { cache } from "react";

import type {
  PublicPropertyDetail,
  PublicPropertyPage,
} from "@/application/public-properties/public-property-contracts";
import type { PublicRouteResolution } from "@/application/public-properties/public-property-read-ports";
import { getPublicProperty } from "@/application/public-properties/get-public-property";
import { listPublicProperties } from "@/application/public-properties/list-public-properties";
import {
  buildPropertyCanonicalPath,
  parsePublicSearchParams,
  type PublicListingType,
  type PublicSearchParamsInput,
} from "@/domain/public-properties/public-property-seo";
import {
  getPublicPropertyBreadcrumbItems,
  type PublicPropertyBreadcrumbItem,
} from "@/features/public-properties/components/public-property-breadcrumbs";
import { getSafePublicMediaPath } from "@/features/public-properties/components/public-property-gallery";
import { PostgresPublicPropertyReadRepository } from "@/infrastructure/public-properties/postgres-public-property-read-repository.server";

export type PublicPropertyDetailRouteParams = Readonly<{
  listingType: string;
  city: string;
  district: string;
  propertyType: string;
  slug: string;
}>;

export type PublicPropertyListingPageData = Readonly<{
  listingType: PublicListingType;
  page: PublicPropertyPage;
}>;

function parseListingType(segment: string): PublicListingType | null {
  if (segment === "satilik") return "SATILIK";
  if (segment === "kiralik") return "KIRALIK";
  return null;
}

function publicPropertyDescription(property: PublicPropertyDetail): string {
  return (
    property.shortDescription?.trim() ||
    `${property.location.district}, ${property.location.city} konumunda ${property.propertyTypeLabel.toLocaleLowerCase("tr-TR")} ilanı.`
  );
}

function metadataImage(property: PublicPropertyDetail) {
  const cover =
    property.media.find((item) => item.isCover) ?? property.media[0];
  const candidates =
    cover?.variants
      .map((variant) => ({ variant, path: getSafePublicMediaPath(variant) }))
      .filter(
        (
          candidate,
        ): candidate is {
          variant: (typeof cover.variants)[number];
          path: string;
        } => candidate.path !== null,
      )
      .sort((left, right) => right.variant.width - left.variant.width) ?? [];
  const selected = candidates[0];
  return selected === undefined
    ? undefined
    : {
        url: selected.path,
        width: selected.variant.width,
        height: selected.variant.height,
        alt: cover?.altText?.trim() || property.title,
      };
}

export function buildPublicPropertyMetadata(
  property: PublicPropertyDetail,
): Metadata {
  const canonical = buildPropertyCanonicalPath(property);
  const description = publicPropertyDescription(property);
  const image = metadataImage(property);

  return {
    title: property.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "tr_TR",
      title: property.title,
      description,
      url: canonical,
      images: image === undefined ? undefined : [image],
    },
  };
}

export function buildPublicPropertyListingMetadata(
  data: PublicPropertyListingPageData,
): Metadata {
  const listingLabel = data.listingType === "SATILIK" ? "Satılık" : "Kiralık";
  const description = `${listingLabel} emlak ilanlarını şehir, ilçe ve mülk türüne göre keşfedin.`;
  return {
    title: `${listingLabel} ilanlar`,
    description,
    alternates: { canonical: data.page.canonicalPath },
    openGraph: {
      type: "website",
      locale: "tr_TR",
      title: `${listingLabel} ilanlar`,
      description,
      url: data.page.canonicalPath,
    },
  };
}

export function buildPublicPropertyBreadcrumbJsonLd(
  property: PublicPropertyDetail,
) {
  const current: PublicPropertyBreadcrumbItem = {
    name: property.title,
    href: buildPropertyCanonicalPath(property),
  };
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      ...getPublicPropertyBreadcrumbItems(property),
      current,
    ].map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.href,
    })),
  } as const;
}

export function serializePublicPropertyJsonLd(
  value: ReturnType<typeof buildPublicPropertyBreadcrumbJsonLd>,
): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

const getByCanonicalRoute = cache(async (route: string) =>
  getPublicProperty(new PostgresPublicPropertyReadRepository(), route),
);

export async function loadPublicPropertyDetailPage(
  params: PublicPropertyDetailRouteParams,
): Promise<PublicRouteResolution> {
  const listingType = parseListingType(params.listingType);
  if (listingType === null) return { kind: "NOT_FOUND" };

  let canonical: string;
  try {
    canonical = buildPropertyCanonicalPath({
      listingType,
      citySlug: params.city,
      districtSlug: params.district,
      propertyTypeSlug: params.propertyType,
      slug: params.slug,
    });
  } catch {
    return { kind: "NOT_FOUND" };
  }

  const requested = `/${params.listingType}/${params.city}/${params.district}/${params.propertyType}/${params.slug}`;
  return requested === canonical
    ? getByCanonicalRoute(canonical)
    : { kind: "NOT_FOUND" };
}

export async function loadPublicPropertyListingPage(
  listingTypeSegment: string,
  input: PublicSearchParamsInput,
): Promise<PublicPropertyListingPageData | null> {
  const listingType = parseListingType(listingTypeSegment);
  if (listingType === null) return null;
  const search = parsePublicSearchParams(input);
  const page = await listPublicProperties(
    new PostgresPublicPropertyReadRepository(),
    { listingType, search },
  );
  return { listingType, page };
}
