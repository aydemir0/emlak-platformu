import type {
  PublicPropertyReadRepository,
  PublicRouteResolution,
} from "@/application/public-properties/public-property-read-ports";

export async function getPublicProperty(
  repository: PublicPropertyReadRepository,
  route: string,
): Promise<PublicRouteResolution> {
  return repository.getByRoute(route);
}
