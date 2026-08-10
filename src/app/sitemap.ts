import type { MetadataRoute } from "next";

import { PostgresPublicPropertyReadRepository } from "@/infrastructure/public-properties/postgres-public-property-read-repository.server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries =
    await new PostgresPublicPropertyReadRepository().listSitemapEntries();

  return entries.map((entry) => ({
    url: entry.path,
    lastModified: entry.lastModified,
  }));
}
