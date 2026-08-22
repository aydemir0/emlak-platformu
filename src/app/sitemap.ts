import type { MetadataRoute } from "next";

import { getServerEnv } from "@/config/env.server.runtime";
import { PostgresPublicPropertyReadRepository } from "@/infrastructure/public-properties/postgres-public-property-read-repository.server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appBaseUrl = getServerEnv().APP_BASE_URL;
  const entries =
    await new PostgresPublicPropertyReadRepository().listSitemapEntries();

  return entries.map((entry) => ({
    url: new URL(entry.path, appBaseUrl).toString(),
    lastModified: entry.lastModified,
  }));
}
