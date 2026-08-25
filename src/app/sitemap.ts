import type { MetadataRoute } from "next";

import { getServerEnv } from "@/config/env.server.runtime";
import { PostgresPublicPropertyReadRepository } from "@/infrastructure/public-properties/postgres-public-property-read-repository.server";

export async function generateSitemaps() {
  const pageCount =
    await new PostgresPublicPropertyReadRepository().countSitemapPages();
  return Array.from({ length: pageCount }, (_, id) => ({ id }));
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const appBaseUrl = getServerEnv().APP_BASE_URL;
  const page = Number(await props.id);
  const entries =
    await new PostgresPublicPropertyReadRepository().listSitemapEntries(page);

  return entries.map((entry) => ({
    url: new URL(entry.path, appBaseUrl).toString(),
    lastModified: entry.lastModified,
  }));
}
