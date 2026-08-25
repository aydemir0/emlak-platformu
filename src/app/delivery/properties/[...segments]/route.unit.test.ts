import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();

vi.mock("@/infrastructure/property-media/media-storage-factory.server", () => ({
  getMediaStorage: () => ({ get }),
}));

import { GET } from "@/app/delivery/properties/[...segments]/route";

const propertyId = "10000000-0000-4000-8000-000000000001";
const mediaId = "20000000-0000-4000-8000-000000000002";
const segments = [propertyId, mediaId, "1", "property-v1", "640.webp"];

describe("public media delivery route", () => {
  beforeEach(() => get.mockReset());

  it("serves only an immutable public raster variant", async () => {
    get.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      metadata: {
        key: `delivery/properties/${segments.join("/")}`,
        size: 3,
        etag: '"etag"',
        contentType: "image/webp",
        uploadedAt: new Date("2026-08-25T00:00:00Z"),
      },
    });

    const response = await GET(new Request("http://localhost/media"), {
      params: Promise.resolve({ segments }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.arrayBuffer()).toEqual(
      new Uint8Array([1, 2, 3]).buffer,
    );
  });

  it.each([
    ["private original", ["..", "private", "originals", "source"]],
    [
      "unsupported format",
      [propertyId, mediaId, "1", "property-v1", "640.svg"],
    ],
    [
      "malformed recipe path",
      [propertyId, mediaId, "1", "../private", "640.webp"],
    ],
  ])("rejects %s without reading storage", async (_name, unsafeSegments) => {
    const response = await GET(new Request("http://localhost/media"), {
      params: Promise.resolve({ segments: unsafeSegments }),
    });

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("returns a non-cacheable 404 when the variant is absent", async () => {
    get.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/media"), {
      params: Promise.resolve({ segments }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
