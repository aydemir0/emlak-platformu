import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(cleanup);

import { PublicPropertyListingView } from "@/app/(public)/[listingType]/page";
import { PublicPropertyDetailView } from "@/app/(public)/[listingType]/[city]/[district]/[propertyType]/[slug]/page";
import {
  buildPublicPropertyBreadcrumbJsonLd,
  buildPublicPropertyListingMetadata,
  buildPublicPropertyMetadata,
} from "@/features/public-properties/public-property-page.server";
import { publicPropertyDetailFixture } from "@/features/public-properties/public-property-components.unit.test";

describe("public property detail page", () => {
  it("server-renders a listing page with canonical property links", () => {
    render(
      <PublicPropertyListingView
        listingType="SATILIK"
        page={{
          items: [publicPropertyDetailFixture],
          query: { page: 1 },
          page: 1,
          total: 1,
          canonicalPath: "/satilik",
          indexability: "INDEX",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Satılık ilanlar" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: publicPropertyDetailFixture.title }),
    ).toHaveAttribute(
      "href",
      "/satilik/ankara/cankaya/daire/bahceli-aile-dairesi",
    );
  });

  it("server-renders public facts and the lead-capture CTA", () => {
    render(<PublicPropertyDetailView property={publicPropertyDetailFixture} />);

    expect(
      screen.getByRole("heading", { name: publicPropertyDetailFixture.title }),
    ).toBeVisible();
    expect(screen.getByRole("img", { name: "Aydınlık salon" })).toHaveAttribute(
      "srcset",
    );
    expect(
      screen.getByRole("button", { name: "Danışmana ulaş" }),
    ).toBeEnabled();
  });

  it("never copies non-EXACT hidden fields into HTML, metadata, or JSON-LD", () => {
    const sensitiveAddress = "SIZDIRILMAMASI-GEREKEN-ADRES";
    const sensitiveLatitude = 39.925_533;
    const poisoned = {
      ...publicPropertyDetailFixture,
      location: {
        ...publicPropertyDetailFixture.location,
        addressLine: sensitiveAddress,
        latitude: sensitiveLatitude,
        longitude: 32.866_287,
      },
    } as PublicPropertyDetail;

    const { container } = render(
      <PublicPropertyDetailView property={poisoned} />,
    );
    const metadata = buildPublicPropertyMetadata(poisoned);
    const jsonLd = buildPublicPropertyBreadcrumbJsonLd(poisoned);
    const output = [
      container.innerHTML,
      JSON.stringify(metadata),
      JSON.stringify(jsonLd),
    ].join(" ");

    expect(output).not.toContain(sensitiveAddress);
    expect(output).not.toContain(String(sensitiveLatitude));
    expect(output).not.toContain('"@type":"Product"');
    expect(metadata.alternates?.canonical).toBe(
      "/satilik/ankara/cankaya/daire/bahceli-aile-dairesi",
    );
  });

  it("marks filtered listings as noindex while preserving link discovery", () => {
    const metadata = buildPublicPropertyListingMetadata({
      listingType: "SATILIK",
      page: {
        items: [],
        query: { city: "ankara", page: 1 },
        page: 1,
        total: 0,
        canonicalPath: "/satilik?city=ankara",
        indexability: "NOINDEX",
      },
    });

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});

type PublicPropertyDetail = typeof publicPropertyDetailFixture;
