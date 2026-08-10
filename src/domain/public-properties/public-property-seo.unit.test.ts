import { describe, expect, it } from "vitest";

import {
  buildCanonicalListingPath,
  buildPropertyCanonicalPath,
  getIndexability,
  parsePublicSearchParams,
} from "@/domain/public-properties/public-property-seo";

describe("public property SEO policy", () => {
  it("marks filtered and paginated listings as non-indexable", () => {
    expect(getIndexability({ hasFilters: true, page: 1 })).toEqual("NOINDEX");
    expect(getIndexability({ hasFilters: false, page: 2 })).toEqual("NOINDEX");
    expect(getIndexability({ hasFilters: false, page: 1 })).toEqual("INDEX");
  });

  it("builds a normalized canonical listing path with default pagination removed", () => {
    expect(
      buildCanonicalListingPath("SATILIK", { city: "Ankara", page: 1 }),
    ).toBe("/satilik?city=ankara");
  });

  it("builds the canonical property hierarchy from controlled route slugs", () => {
    expect(
      buildPropertyCanonicalPath({
        listingType: "SATILIK",
        citySlug: "Ankara",
        districtSlug: "Çankaya",
        propertyTypeSlug: "Daire",
        slug: "Örnek İlan",
      }),
    ).toBe("/satilik/ankara/cankaya/daire/ornek-ilan");
  });

  it("drops malformed, duplicate, and out-of-bounds public search values", () => {
    expect(
      parsePublicSearchParams({
        city: ["Ankara", "Izmir"],
        district: "Çankaya",
        minPrice: "-1",
        maxPrice: "2000000",
        roomCount: "99",
        page: "0",
        tracking: "campaign",
      }),
    ).toEqual({ district: "cankaya", maxPrice: 2_000_000, page: 1 });
  });

  it("drops only a reversed price range while retaining independent filters", () => {
    expect(
      parsePublicSearchParams({
        minPrice: "2000000",
        maxPrice: "1000000",
        roomCount: "3",
      }),
    ).toEqual({ page: 1, roomCount: 3 });
  });

  it("omits a reversed price range from the canonical listing path", () => {
    expect(
      buildCanonicalListingPath("SATILIK", {
        minPrice: 2_000_000,
        maxPrice: 1_000_000,
        page: 1,
      }),
    ).toBe("/satilik");
  });
});
