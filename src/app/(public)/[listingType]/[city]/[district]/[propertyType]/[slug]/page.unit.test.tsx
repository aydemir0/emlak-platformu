import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { loadPublicPropertyDetailPage, notFound, permanentRedirect } =
  vi.hoisted(() => ({
    loadPublicPropertyDetailPage: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    permanentRedirect: vi.fn(() => {
      throw new Error("NEXT_PERMANENT_REDIRECT");
    }),
  }));

vi.mock("next/navigation", () => ({ notFound, permanentRedirect }));

vi.mock("@/features/public-properties/public-property-page.server", () => ({
  buildPublicPropertyBreadcrumbJsonLd: vi.fn(),
  buildPublicPropertyMetadata: vi.fn(),
  loadPublicPropertyDetailPage,
  serializePublicPropertyJsonLd: vi.fn(),
}));

import PublicPropertyDetailPage from "./page";

const params = Promise.resolve({
  listingType: "satilik",
  city: "ankara",
  district: "cankaya",
  propertyType: "daire",
  slug: "bahceli-aile-dairesi",
});

describe("public property detail delivery", () => {
  it("permanently redirects a confirmed historical route directly to its canonical route", async () => {
    const canonicalRoute = "/satilik/ankara/cankaya/daire/yeni-ilan";
    loadPublicPropertyDetailPage.mockResolvedValue({
      kind: "REDIRECT",
      status: 301,
      location: canonicalRoute,
    });

    await expect(PublicPropertyDetailPage({ params })).rejects.toThrow(
      "NEXT_PERMANENT_REDIRECT",
    );

    expect(permanentRedirect).toHaveBeenCalledWith(canonicalRoute);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("returns not found when the public repository does not expose the route", async () => {
    loadPublicPropertyDetailPage.mockResolvedValue({ kind: "NOT_FOUND" });

    await expect(PublicPropertyDetailPage({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );

    expect(notFound).toHaveBeenCalledOnce();
    expect(permanentRedirect).not.toHaveBeenCalled();
  });
});
