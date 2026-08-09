import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { R2MediaStorage } from "@/infrastructure/property-media/r2-media-storage.server";

const key =
  "private/quarantine/properties/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002/1/source";

describe("Cloudflare R2 media storage adapter", () => {
  it("presigns only one exact PutObject command for five minutes", async () => {
    const signer = vi.fn().mockResolvedValue("https://signed.invalid/token");
    const storage = new R2MediaStorage(
      {
        accountId: "account-id",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        bucket: "private-media",
      },
      {
        client: { send: vi.fn() },
        signer,
        now: () => new Date("2026-08-09T12:00:00Z"),
      },
    );
    const grant = await storage.presignPut({
      key,
      contentType: "image/jpeg",
      expiresInSeconds: 300,
      maximumBytes: 15 * 1024 * 1024,
    });
    const command = signer.mock.calls[0]?.[1] as {
      constructor: { name: string };
      input: Record<string, unknown>;
    };
    expect(command.constructor.name).toBe("PutObjectCommand");
    expect(command.input).toMatchObject({
      Bucket: "private-media",
      Key: key,
      ContentType: "image/jpeg",
      ContentLength: 15 * 1024 * 1024,
      IfNoneMatch: "*",
    });
    expect(signer.mock.calls[0]?.[2]).toEqual({ expiresIn: 300 });
    expect(grant).toEqual({
      method: "PUT",
      url: "https://signed.invalid/token",
      headers: { "content-type": "image/jpeg", "if-none-match": "*" },
      expiresAt: new Date("2026-08-09T12:05:00Z"),
    });
  });

  it("passes provider continuation tokens through without treating them as object keys", async () => {
    const send = vi.fn().mockResolvedValue({ Contents: [] });
    const storage = new R2MediaStorage(
      {
        accountId: "account-id",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        bucket: "private-media",
      },
      { client: { send }, signer: vi.fn() },
    );
    await storage.list(
      "private/quarantine/",
      "opaque+/continuation==token",
      100,
    );
    const command = send.mock.calls[0]?.[0] as {
      input: Record<string, unknown>;
    };
    expect(command.input).toMatchObject({
      Prefix: "private/quarantine/",
      ContinuationToken: "opaque+/continuation==token",
      MaxKeys: 100,
    });
  });

  it("uses an immutable conditional PutObject with exact safe metadata", async () => {
    const bytes = new TextEncoder().encode("variant");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const send = vi.fn().mockResolvedValue({
      ETag: '"etag"',
      ChecksumSHA256: checksum,
    });
    const storage = new R2MediaStorage(
      {
        accountId: "account-id",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        bucket: "private-media",
      },
      { client: { send }, signer: vi.fn(), now: () => new Date(0) },
    );
    await storage.put({
      key,
      bytes,
      contentType: "image/webp",
      checksumSha256: checksum,
      cacheControl: "public, max-age=31536000, immutable",
      ifAbsent: true,
    });
    const command = send.mock.calls[0]?.[0] as {
      constructor: { name: string };
      input: Record<string, unknown>;
    };
    expect(command.constructor.name).toBe("PutObjectCommand");
    expect(command.input).toMatchObject({
      Bucket: "private-media",
      Key: key,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
      IfNoneMatch: "*",
    });
    expect(command.input).not.toHaveProperty("ACL");
  });
});
