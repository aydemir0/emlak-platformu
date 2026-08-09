import { ApplicationError } from "@/application/errors/application-error";
import type { MediaStorage } from "@/application/property-media/media-storage";
import type { MediaWorkerRepository } from "@/application/property-media/media-worker-ports";

const RECONCILABLE_PREFIXES = [
  "private/quarantine/properties/",
  "private/originals/properties/",
  "delivery/properties/",
] as const;

export async function reconcileMediaStorage(
  repository: MediaWorkerRepository,
  storage: MediaStorage,
  input: Readonly<{
    prefix: string;
    cursor?: string;
    limit: number;
    now: Date;
    graceSeconds: number;
  }>,
): Promise<{ inspected: number; deleted: number; cursor?: string }> {
  if (
    !RECONCILABLE_PREFIXES.includes(
      input.prefix as (typeof RECONCILABLE_PREFIXES)[number],
    ) ||
    !Number.isSafeInteger(input.limit) ||
    input.limit <= 0 ||
    input.limit > 250 ||
    !Number.isSafeInteger(input.graceSeconds) ||
    input.graceSeconds < 0
  ) {
    throw new ApplicationError(
      "MEDIA_VALIDATION_FAILED",
      "MEDIA_VALIDATION_FAILED",
    );
  }
  const page = await storage.list(input.prefix, input.cursor, input.limit);
  const cutoff = input.now.getTime() - input.graceSeconds * 1000;
  const orphanKeys: string[] = [];
  const authoritativeKeys = await repository.findAuthoritativeObjectKeys(
    page.objects.map((object) => object.key),
  );
  for (const object of page.objects) {
    if (
      object.uploadedAt.getTime() <= cutoff &&
      !authoritativeKeys.has(object.key)
    ) {
      orphanKeys.push(object.key);
    }
  }
  if (orphanKeys.length) await storage.delete(orphanKeys);
  return {
    inspected: page.objects.length,
    deleted: orphanKeys.length,
    ...(page.cursor ? { cursor: page.cursor } : {}),
  };
}
