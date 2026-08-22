import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/config/env.server.runtime", () => ({
  getServerEnv: () => ({ APP_BASE_URL: "https://emlak.example.test" }),
}));

const { listSitemapEntries } = vi.hoisted(() => ({
  listSitemapEntries: vi.fn(),
}));

vi.mock(
  "@/infrastructure/public-properties/postgres-public-property-read-repository.server",
  () => ({
    PostgresPublicPropertyReadRepository: class {
      listSitemapEntries = listSitemapEntries;
    },
  }),
);

import sitemap from "./sitemap";

describe("public property sitemap", () => {
  it("publishes only public repository canonical entries", async () => {
    const canonicalUrl = "/satilik/ankara/cankaya/daire/yeni-ilan";
    const oldUrl = "/satilik/ankara/cankaya/daire/eski-ilan";
    const lastModified = new Date("2026-08-10T08:00:00.000Z");
    listSitemapEntries.mockResolvedValue([
      {
        path: canonicalUrl,
        listingType: "SATILIK",
        citySlug: "ankara",
        districtSlug: "cankaya",
        propertyTypeSlug: "daire",
        slug: "yeni-ilan",
        lastModified,
      },
    ]);

    const entries = await sitemap();

    expect(entries).toEqual([
      expect.objectContaining({
        url: `https://emlak.example.test${canonicalUrl}`,
        lastModified,
      }),
    ]);
    expect(entries.map((entry) => entry.url)).not.toContain(oldUrl);
  });
});
