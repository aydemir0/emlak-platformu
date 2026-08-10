import type {
  PublicIndexability,
  PublicPropertyCanonicalRoute,
  PublicSearchParams,
} from "@/domain/public-properties/public-property-seo";

export type PublicPropertyMedia = Readonly<{
  mediaId: string;
  isCover: boolean;
  sortOrder: number;
  altText: string | null;
  variants: readonly PublicPropertyMediaVariant[];
}>;

export type PublicPropertyMediaVariant = Readonly<{
  width: number;
  height: number;
  format: "WEBP" | "AVIF";
  deliveryPath: string;
}>;

type PublicPropertyLocationBase = Readonly<{
  city: string;
  citySlug: string;
  district: string;
  districtSlug: string;
}>;

export type PublicPropertyLocation =
  | (PublicPropertyLocationBase &
      Readonly<{
        locationVisibility: "EXACT";
        addressLine: string | null;
        latitude: number | null;
        longitude: number | null;
      }>)
  | (PublicPropertyLocationBase &
      Readonly<{
        locationVisibility: "REDACTED";
      }>);

export type PublicPropertyPrice = Readonly<{
  amountMinor: number;
  currencyCode: string;
}>;

export type PublicPropertySummary = PublicPropertyCanonicalRoute &
  Readonly<{
    publicId: string;
    title: string;
    shortDescription: string | null;
    price: PublicPropertyPrice;
    propertyTypeLabel: string;
    location: PublicPropertyLocation;
    media: readonly PublicPropertyMedia[];
    updatedAt: Date;
  }>;

export type PublicPropertyDetail = PublicPropertySummary &
  Readonly<{
    description: string | null;
    grossAreaSqm: number | null;
    netAreaSqm: number | null;
    bedroomCount: number | null;
    bathroomCount: number | null;
  }>;

export type PublicPropertyPage = Readonly<{
  items: readonly PublicPropertySummary[];
  query: PublicSearchParams;
  page: number;
  total: number;
  canonicalPath: string;
  indexability: PublicIndexability;
}>;
