import type { PublicPropertyPage } from "@/application/public-properties/public-property-contracts";
import type {
  PublicPropertyListQuery,
  PublicPropertyReadRepository,
} from "@/application/public-properties/public-property-read-ports";

export async function listPublicProperties(
  repository: PublicPropertyReadRepository,
  query: PublicPropertyListQuery,
): Promise<PublicPropertyPage> {
  return repository.list(query);
}
