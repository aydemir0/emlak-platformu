import "server-only";

import type { MediaStorage } from "@/application/property-media/media-storage";
import { getServerEnv } from "@/config/env.server.runtime";
import { DeterministicMediaStorage } from "@/infrastructure/property-media/deterministic-media-storage";
import { R2MediaStorage } from "@/infrastructure/property-media/r2-media-storage.server";

let localStorage: MediaStorage | undefined;

export function getMediaStorage(): MediaStorage {
  const config = getServerEnv().R2;
  if (config) {
    return new R2MediaStorage({
      accountId: config.accountId,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      bucket: config.bucketName,
    });
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  }
  localStorage ??= new DeterministicMediaStorage();
  return localStorage;
}
