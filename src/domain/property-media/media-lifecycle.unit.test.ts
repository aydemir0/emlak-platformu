import { describe, expect, it } from "vitest";

import { assertMediaTransition } from "@/domain/property-media/media-lifecycle";

describe("property media lifecycle", () => {
  it.each([
    ["UPLOADED", "PROCESSING"],
    ["UPLOADED", "DELETED"],
    ["PROCESSING", "READY"],
    ["PROCESSING", "FAILED"],
    ["PROCESSING", "DELETED"],
    ["READY", "PROCESSING"],
    ["READY", "DELETED"],
    ["FAILED", "PROCESSING"],
    ["FAILED", "DELETED"],
    ["DELETED", "UPLOADED"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(() => assertMediaTransition(from, to)).not.toThrow();
  });

  it.each([
    ["UPLOADED", "READY"],
    ["READY", "UPLOADED"],
    ["FAILED", "READY"],
    ["DELETED", "READY"],
    ["READY", "READY"],
  ] as const)("rejects %s -> %s", (from, to) => {
    expect(() => assertMediaTransition(from, to)).toThrow(
      "MEDIA_INVALID_TRANSITION",
    );
  });
});
