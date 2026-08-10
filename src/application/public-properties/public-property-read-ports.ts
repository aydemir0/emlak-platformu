import type {
  PublicListingType,
  PublicPropertyCanonicalRoute,
  PublicSearchParams,
} from "@/domain/public-properties/public-property-seo";
import type {
  PublicPropertyDetail,
  PublicPropertyPage,
} from "@/application/public-properties/public-property-contracts";

export type PublicPropertyListQuery = Readonly<{
  listingType: PublicListingType;
  search: PublicSearchParams;
}>;

export type PublicRouteResolution =
  | Readonly<{ kind: "PROPERTY"; property: PublicPropertyDetail }>
  | Readonly<{ kind: "REDIRECT"; status: 301; location: string }>
  | Readonly<{ kind: "NOT_FOUND" }>;

export type PublicSitemapEntry = PublicPropertyCanonicalRoute &
  Readonly<{
    path: string;
    lastModified: Date;
  }>;

export interface PublicPropertyReadRepository {
  getByRoute(route: string): Promise<PublicRouteResolution>;
  list(query: PublicPropertyListQuery): Promise<PublicPropertyPage>;
  listSitemapEntries(): Promise<readonly PublicSitemapEntry[]>;
}
