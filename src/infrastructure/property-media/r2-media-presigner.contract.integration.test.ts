import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getR2Addressing } from "@/config/r2-addressing";
import { createR2S3Client } from "@/infrastructure/property-media/r2-media-storage.server";

const config = {
  accountId: "media-account-123",
  accessKeyId: "AKIATESTACCESSKEY",
  secretAccessKey: "testing-only-r2-secret-access-key",
  bucket: "private-media",
};

describe("R2 PutObject presigner addressing contract", () => {
  it("uses the configured virtual-hosted R2 upload origin without network I/O", async () => {
    const addressing = getR2Addressing({
      accountId: config.accountId,
      bucketName: config.bucket,
    });
    expect(addressing).not.toBeNull();

    const client = createR2S3Client(config);
    try {
      const signedUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: "private/quarantine/properties/10000000-0000-4000-8000-000000000001/source",
          ContentType: "image/jpeg",
          ContentLength: 1,
          IfNoneMatch: "*",
        }),
        { expiresIn: 300 },
      );

      expect(new URL(signedUrl).origin).toBe(addressing?.uploadOrigin);
    } finally {
      client.destroy();
    }
  });
});
