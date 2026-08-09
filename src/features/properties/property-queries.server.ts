import "server-only";

import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresPropertyReadRepository } from "@/infrastructure/properties/postgres-property-read-repository.server";

const repository = new PostgresPropertyReadRepository();

import type { PropertyListQuery } from "@/application/properties/property-ports";

export async function listProperties(
  page = 1,
  filters: Omit<PropertyListQuery, "limit" | "offset"> = {},
) {
  const actor = await requireStaffPrincipal();
  const limit = 25;
  return repository.list(actor, {
    ...filters,
    limit,
    offset: (Math.max(1, page) - 1) * limit,
  });
}

export async function getProperty(propertyId: string) {
  const actor = await requireStaffPrincipal();
  return repository.get(actor, propertyId);
}

export async function getPropertyReferenceData() {
  await requireStaffPrincipal();
  return repository.getReferenceData();
}

export async function getPropertyEditorData(propertyId: string) {
  const actor = await requireStaffPrincipal();
  const [property, references] = await Promise.all([
    repository.get(actor, propertyId),
    repository.getReferenceData(),
  ]);
  return { property, references };
}

export async function getPropertyListPageData(
  page: number,
  filters: Omit<PropertyListQuery, "limit" | "offset">,
) {
  const actor = await requireStaffPrincipal();
  const limit = 25;
  const [properties, references] = await Promise.all([
    repository.list(actor, {
      ...filters,
      limit,
      offset: (Math.max(1, page) - 1) * limit,
    }),
    repository.getReferenceData(),
  ]);
  return {
    ...properties,
    references,
    page: Math.max(1, page),
    pageSize: limit,
  };
}
