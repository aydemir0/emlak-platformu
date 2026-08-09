import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { DeterministicMediaStorage } from "@/infrastructure/property-media/deterministic-media-storage";

const key =
  "private/quarantine/properties/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002/1/source";
const bytes = new TextEncoder().encode("safe-test-image-bytes");
const checksum = createHash("sha256").update(bytes).digest("hex");

describe("media storage contract", () => {
  it("issues a single-key PUT capability with deterministic expiry", async () => {
    const storage = new DeterministicMediaStorage(
      new Date("2026-08-09T12:00:00.000Z"),
    );
    const grant = await storage.presignPut({
      key,
      contentType: "image/jpeg",
      expiresInSeconds: 300,
      maximumBytes: 15 * 1024 * 1024,
    });
    expect(grant).toEqual({
      method: "PUT",
      url: `https://upload.invalid/${encodeURIComponent(key)}`,
      headers: { "content-type": "image/jpeg", "if-none-match": "*" },
      expiresAt: new Date("2026-08-09T12:05:00.000Z"),
    });
  });

  it("round-trips bounded bytes and authoritative metadata", async () => {
    const storage = new DeterministicMediaStorage();
    await storage.put({
      key,
      bytes,
      contentType: "image/jpeg",
      checksumSha256: checksum,
      ifAbsent: true,
    });
    expect(await storage.head(key)).toMatchObject({
      key,
      size: bytes.byteLength,
      checksumSha256: checksum,
      contentType: "image/jpeg",
    });
    expect((await storage.get(key, bytes.byteLength))?.bytes).toEqual(bytes);
    await expect(storage.get(key, bytes.byteLength - 1)).rejects.toThrow(
      "MEDIA_VALIDATION_FAILED",
    );
  });

  it("never overwrites an immutable key and delete is idempotent", async () => {
    const storage = new DeterministicMediaStorage();
    const input = {
      key,
      bytes,
      contentType: "image/jpeg",
      checksumSha256: checksum,
      ifAbsent: true,
    } as const;
    await storage.put(input);
    await expect(storage.put(input)).rejects.toThrow("MEDIA_CONFLICT");
    await storage.delete([key]);
    await storage.delete([key]);
    expect(await storage.head(key)).toBeNull();
  });

  it("paginates only within a controlled prefix", async () => {
    const storage = new DeterministicMediaStorage();
    for (const suffix of ["a", "b", "c"]) {
      await storage.put({
        key: `private/quarantine/${suffix}`,
        bytes,
        contentType: "image/jpeg",
        checksumSha256: checksum,
        ifAbsent: true,
      });
    }
    const first = await storage.list("private/quarantine/", undefined, 2);
    expect(first.objects.map((object) => object.key)).toEqual([
      "private/quarantine/a",
      "private/quarantine/b",
    ]);
    expect(first.cursor).toBe("private/quarantine/b");
    const second = await storage.list("private/quarantine/", first.cursor, 2);
    expect(second.objects.map((object) => object.key)).toEqual([
      "private/quarantine/c",
    ]);
    await expect(storage.list("../", undefined, 2)).rejects.toThrow(
      "MEDIA_VALIDATION_FAILED",
    );
  });
});
