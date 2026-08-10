export const PUBLIC_LISTING_TYPES = ["SATILIK", "KIRALIK"] as const;

export type PublicListingType = (typeof PUBLIC_LISTING_TYPES)[number];

export type PublicSearchParams = Readonly<{
  city?: string;
  district?: string;
  propertyType?: string;
  minPrice?: number;
  maxPrice?: number;
  roomCount?: number;
  page: number;
}>;

export type PublicSearchParamsInput = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export type PublicPropertyCanonicalRoute = Readonly<{
  listingType: PublicListingType;
  citySlug: string;
  districtSlug: string;
  propertyTypeSlug: string;
  slug: string;
}>;

export type PublicListingIndexabilityInput = Readonly<{
  hasFilters: boolean;
  page: number;
}>;

export type PublicIndexability = "INDEX" | "NOINDEX";

const DEFAULT_PAGE = 1;
const MAXIMUM_PAGE = 100;
const MAXIMUM_SLUG_LENGTH = 80;
const MAXIMUM_PRICE_MINOR = 9_999_999_999_999;
const MAXIMUM_ROOM_COUNT = 20;

function normalizeSlug(value: string): string | undefined {
  const normalized = value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 && normalized.length <= MAXIMUM_SLUG_LENGTH
    ? normalized
    : undefined;
}

function readSingleValue(
  input: PublicSearchParamsInput,
  key: string,
): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

function parseBoundedInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined || !/^(0|[1-9]\d*)$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

function listingTypePathSegment(listingType: PublicListingType): string {
  switch (listingType) {
    case "SATILIK":
      return "satilik";
    case "KIRALIK":
      return "kiralik";
  }
}

function appendQueryValue(
  query: URLSearchParams,
  key: string,
  value: string | number | undefined,
): void {
  if (value !== undefined) query.set(key, String(value));
}

function requireRouteSegment(value: string): string {
  const normalized = normalizeSlug(value);
  if (normalized === undefined) {
    throw new Error("PUBLIC_PROPERTY_SEO_VALIDATION_FAILED");
  }
  return normalized;
}

export function parsePublicSearchParams(
  input: PublicSearchParamsInput,
): PublicSearchParams {
  const minPrice = parseBoundedInteger(
    readSingleValue(input, "minPrice"),
    0,
    MAXIMUM_PRICE_MINOR,
  );
  const maxPrice = parseBoundedInteger(
    readSingleValue(input, "maxPrice"),
    0,
    MAXIMUM_PRICE_MINOR,
  );
  const parsed: {
    city?: string;
    district?: string;
    propertyType?: string;
    minPrice?: number;
    maxPrice?: number;
    roomCount?: number;
    page: number;
  } = {
    page:
      parseBoundedInteger(
        readSingleValue(input, "page"),
        DEFAULT_PAGE,
        MAXIMUM_PAGE,
      ) ?? DEFAULT_PAGE,
  };
  const city = readSingleValue(input, "city");
  const district = readSingleValue(input, "district");
  const propertyType = readSingleValue(input, "propertyType");
  const roomCount = parseBoundedInteger(
    readSingleValue(input, "roomCount"),
    1,
    MAXIMUM_ROOM_COUNT,
  );

  if (city !== undefined) {
    const normalized = normalizeSlug(city);
    if (normalized !== undefined) parsed.city = normalized;
  }
  if (district !== undefined) {
    const normalized = normalizeSlug(district);
    if (normalized !== undefined) parsed.district = normalized;
  }
  if (propertyType !== undefined) {
    const normalized = normalizeSlug(propertyType);
    if (normalized !== undefined) parsed.propertyType = normalized;
  }
  const hasValidPriceRange =
    minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice;
  if (hasValidPriceRange && minPrice !== undefined) parsed.minPrice = minPrice;
  if (hasValidPriceRange && maxPrice !== undefined) parsed.maxPrice = maxPrice;
  if (roomCount !== undefined) parsed.roomCount = roomCount;

  return parsed;
}

export function buildCanonicalListingPath(
  listingType: PublicListingType,
  search: PublicSearchParams,
): string {
  const query = new URLSearchParams();
  appendQueryValue(query, "city", normalizeSlug(search.city ?? ""));
  appendQueryValue(query, "district", normalizeSlug(search.district ?? ""));
  appendQueryValue(
    query,
    "propertyType",
    normalizeSlug(search.propertyType ?? ""),
  );
  appendQueryValue(
    query,
    "minPrice",
    Number.isSafeInteger(search.minPrice) &&
      search.minPrice >= 0 &&
      search.minPrice <= MAXIMUM_PRICE_MINOR
      ? search.minPrice
      : undefined,
  );
  appendQueryValue(
    query,
    "maxPrice",
    Number.isSafeInteger(search.maxPrice) &&
      search.maxPrice >= 0 &&
      search.maxPrice <= MAXIMUM_PRICE_MINOR
      ? search.maxPrice
      : undefined,
  );
  appendQueryValue(
    query,
    "roomCount",
    Number.isSafeInteger(search.roomCount) &&
      search.roomCount >= 1 &&
      search.roomCount <= MAXIMUM_ROOM_COUNT
      ? search.roomCount
      : undefined,
  );
  appendQueryValue(
    query,
    "page",
    Number.isSafeInteger(search.page) &&
      search.page > DEFAULT_PAGE &&
      search.page <= MAXIMUM_PAGE
      ? search.page
      : undefined,
  );

  const path = `/${listingTypePathSegment(listingType)}`;
  return query.size > 0 ? `${path}?${query.toString()}` : path;
}

export function getIndexability(
  input: PublicListingIndexabilityInput,
): PublicIndexability {
  return input.hasFilters || input.page !== DEFAULT_PAGE ? "NOINDEX" : "INDEX";
}

export function buildPropertyCanonicalPath(
  route: PublicPropertyCanonicalRoute,
): string {
  return [
    "",
    listingTypePathSegment(route.listingType),
    requireRouteSegment(route.citySlug),
    requireRouteSegment(route.districtSlug),
    requireRouteSegment(route.propertyTypeSlug),
    requireRouteSegment(route.slug),
  ].join("/");
}
