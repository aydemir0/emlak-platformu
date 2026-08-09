import { createHash } from "node:crypto";

import type {
  MediaStorage,
  StoredObject,
  StoredObjectMetadata,
} from "@/application/property-media/media-storage";

const ALLOWED_PREFIXES = [
  "private/quarantine/",
  "private/originals/",
  "delivery/properties/",
] as const;

function assertControlledKey(value: string): void {
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("..") ||
    value.includes("\\") ||
    !ALLOWED_PREFIXES.some((prefix) => value.startsWith(prefix))
  ) {
    throw new Error("MEDIA_VALIDATION_FAILED");
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export class DeterministicMediaStorage implements MediaStorage {
  private readonly objects = new Map<string, StoredObject>();
  private readonly now: () => Date;

  constructor(now: Date | (() => Date) = () => new Date()) {
    this.now = typeof now === "function" ? now : () => now;
  }

  async presignPut(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
    maximumBytes: number;
  }) {
    assertControlledKey(input.key);
    if (
      input.expiresInSeconds <= 0 ||
      input.maximumBytes <= 0 ||
      !input.contentType.startsWith("image/")
    ) {
      throw new Error("MEDIA_VALIDATION_FAILED");
    }
    return {
      method: "PUT" as const,
      url: `https://upload.invalid/${encodeURIComponent(input.key)}`,
      headers: {
        "content-type": input.contentType,
        "if-none-match": "*",
      },
      expiresAt: new Date(this.now().getTime() + input.expiresInSeconds * 1000),
    };
  }

  async head(key: string): Promise<StoredObjectMetadata | null> {
    assertControlledKey(key);
    return this.objects.get(key)?.metadata ?? null;
  }

  async get(key: string, maximumBytes: number): Promise<StoredObject | null> {
    assertControlledKey(key);
    const object = this.objects.get(key);
    if (!object) return null;
    if (maximumBytes <= 0 || object.metadata.size > maximumBytes) {
      throw new Error("MEDIA_VALIDATION_FAILED");
    }
    return {
      bytes: object.bytes.slice(),
      metadata: object.metadata,
    };
  }

  async put(input: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    checksumSha256: string;
    cacheControl?: string;
    ifAbsent: boolean;
  }): Promise<StoredObjectMetadata> {
    assertControlledKey(input.key);
    if (
      input.bytes.byteLength === 0 ||
      sha256(input.bytes) !== input.checksumSha256
    ) {
      throw new Error("MEDIA_VALIDATION_FAILED");
    }
    if (input.ifAbsent && this.objects.has(input.key)) {
      throw new Error("MEDIA_CONFLICT");
    }
    const metadata = {
      key: input.key,
      size: input.bytes.byteLength,
      etag: input.checksumSha256,
      checksumSha256: input.checksumSha256,
      contentType: input.contentType,
      uploadedAt: this.now(),
    };
    this.objects.set(input.key, {
      bytes: input.bytes.slice(),
      metadata,
    });
    return metadata;
  }

  async delete(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      assertControlledKey(key);
      this.objects.delete(key);
    }
  }

  async list(prefix: string, cursor: string | undefined, limit: number) {
    assertControlledKey(prefix);
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1_000) {
      throw new Error("MEDIA_VALIDATION_FAILED");
    }
    if (cursor) assertControlledKey(cursor);
    const candidates = [...this.objects.values()]
      .map((object) => object.metadata)
      .filter(
        (object) =>
          object.key.startsWith(prefix) && (!cursor || object.key > cursor),
      )
      .sort((left, right) => left.key.localeCompare(right.key));
    const objects = candidates.slice(0, limit);
    return {
      objects,
      ...(candidates.length > limit ? { cursor: objects.at(-1)!.key } : {}),
    };
  }
}
