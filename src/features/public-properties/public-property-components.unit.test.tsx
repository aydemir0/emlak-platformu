import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PublicPropertyDetail } from "@/application/public-properties/public-property-contracts";
import { PublicPropertyBreadcrumbs } from "@/features/public-properties/components/public-property-breadcrumbs";
import { PublicPropertyGallery } from "@/features/public-properties/components/public-property-gallery";

const detail: PublicPropertyDetail = {
  publicId: "property-1",
  title: "Bahçeli aile dairesi",
  shortDescription: "Geniş ve aydınlık daire.",
  description: "Toplu ulaşıma yakın, bakımlı aile dairesi.",
  price: { amountMinor: 12_500_000_00, currencyCode: "TRY" },
  propertyTypeLabel: "Daire",
  listingType: "SATILIK",
  citySlug: "ankara",
  districtSlug: "cankaya",
  propertyTypeSlug: "daire",
  slug: "bahceli-aile-dairesi",
  location: {
    locationVisibility: "REDACTED",
    city: "Ankara",
    citySlug: "ankara",
    district: "Çankaya",
    districtSlug: "cankaya",
  },
  media: [
    {
      mediaId: "media-1",
      isCover: true,
      sortOrder: 0,
      altText: "Aydınlık salon",
      variants: [
        {
          width: 640,
          height: 480,
          format: "WEBP",
          deliveryPath: "delivery/properties/property-1/media-1/640.webp",
        },
        {
          width: 1280,
          height: 960,
          format: "WEBP",
          deliveryPath: "delivery/properties/property-1/media-1/1280.webp",
        },
        {
          width: 1280,
          height: 960,
          format: "AVIF",
          deliveryPath: "delivery/properties/property-1/media-1/1280.avif",
        },
      ],
    },
  ],
  updatedAt: new Date("2026-08-10T08:00:00.000Z"),
  grossAreaSqm: 150,
  netAreaSqm: 125,
  bedroomCount: 3,
  bathroomCount: 2,
};

afterEach(cleanup);

describe("public property server components", () => {
  it("renders provider-neutral delivery paths as responsive image markup", () => {
    render(<PublicPropertyGallery media={detail.media} title={detail.title} />);

    const image = screen.getByRole("img", { name: "Aydınlık salon" });
    expect(image).toHaveAttribute(
      "srcset",
      "/delivery/properties/property-1/media-1/640.webp 640w, /delivery/properties/property-1/media-1/1280.webp 1280w",
    );
    expect(image).toHaveAttribute("sizes");
    expect(image).toHaveAttribute("width", "1280");
    expect(image).toHaveAttribute("height", "960");
    expect(screen.getByTestId("avif-source")).toHaveAttribute(
      "srcset",
      "/delivery/properties/property-1/media-1/1280.avif 1280w",
    );
  });

  it("renders semantic breadcrumb links from the public read model", () => {
    render(<PublicPropertyBreadcrumbs property={detail} />);

    expect(
      screen.getByRole("navigation", { name: "İçerik yolu" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Satılık" })).toHaveAttribute(
      "href",
      "/satilik",
    );
    expect(screen.getByRole("link", { name: "Ankara" })).toHaveAttribute(
      "href",
      "/satilik?city=ankara",
    );
  });
});

export { detail as publicPropertyDetailFixture };
