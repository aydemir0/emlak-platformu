import type { MetadataRoute } from "next";

const PRIVATE_ROUTE_PREFIXES = [
  "/admin",
  "/admin/",
  "/auth",
  "/auth/",
  "/crm",
  "/crm/",
  "/customers",
  "/customers/",
  "/leads",
  "/leads/",
  "/customer-requests",
  "/customer-requests/",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PRIVATE_ROUTE_PREFIXES],
    },
  };
}
