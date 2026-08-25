import { describe, expect, it } from "vitest";

import { getR2Addressing } from "./r2-addressing";

describe("R2 addressing", () => {
  it("keeps browser uploads aligned with the virtual-hosted S3 presign origin", () => {
    expect(
      getR2Addressing({
        accountId: "production-account-id",
        bucketName: "production-media-bucket",
      }),
    ).toEqual({
      endpoint: "https://production-account-id.r2.cloudflarestorage.com",
      uploadOrigin:
        "https://production-media-bucket.production-account-id.r2.cloudflarestorage.com",
    });
  });

  it("fails closed when a configured identity cannot form DNS labels", () => {
    expect(
      getR2Addressing({
        accountId: "production-account-id",
        bucketName: "bad/bucket",
      }),
    ).toBeNull();
    expect(
      getR2Addressing({
        accountId: "bad/account",
        bucketName: "production-media-bucket",
      }),
    ).toBeNull();
  });
});
