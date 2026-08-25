import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/config/env.server.runtime", () => ({
  getServerEnv: () => ({ APP_BASE_URL: "https://emlak.example.test" }),
}));

const { countSitemapPages, listSitemapEntries } = vi.hoisted(() => ({
  countSitemapPages: vi.fn(),
  listSitemapEntries: vi.fn(),
}));

vi.mock(
  "@/infrastructure/public-properties/postgres-public-property-read-repository.server",
  () => ({
    PostgresPublicPropertyReadRepository: class {
      countSitemapPages = countSitemapPages;
      listSitemapEntries = listSitemapEntries;
    },
  }),
);

import sitemap, { generateSitemaps } from "./sitemap";

describe("public property sitemap", () => {
  it("generates one bounded sitemap id per repository page", async () => {
    countSitemapPages.mockResolvedValue(3);

    await expect(generateSitemaps()).resolves.toEqual([
      { id: 0 },
      { id: 1 },
      { id: 2 },
    ]);
  });

  it("publishes only the requested page of canonical entries", async () => {
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

    const entries = await sitemap({ id: Promise.resolve("2") });

    expect(entries).toEqual([
      expect.objectContaining({
        url: `https://emlak.example.test${canonicalUrl}`,
        lastModified,
      }),
    ]);
    expect(entries.map((entry) => entry.url)).not.toContain(oldUrl);
    expect(listSitemapEntries).toHaveBeenCalledWith(2);
  });
});
