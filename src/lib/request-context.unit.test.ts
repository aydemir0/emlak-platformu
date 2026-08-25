import { describe, expect, it } from "vitest";

import { createRequestContext } from "@/lib/request-context";

describe("request context", () => {
  it("preserves a bounded opaque correlation identifier from a delivery boundary", () => {
    expect(
      createRequestContext(
        new Headers({
          "x-correlation-id": "edge_request-42.prod",
          "x-request-id": "request_42",
        }),
      ),
    ).toEqual({
      correlationId: "edge_request-42.prod",
      requestId: "request_42",
    });
  });

  it("preserves a valid incoming correlation identifier", () => {
    const id = "e4b20451-e725-46f2-97fe-e10ba499b094";
    expect(
      createRequestContext(
        new Headers({ "x-correlation-id": id, "x-request-id": id }),
      ),
    ).toEqual({
      correlationId: id,
      requestId: id,
    });
  });

  it("replaces an untrusted malformed identifier with a UUID", () => {
    expect(
      createRequestContext(new Headers({ "x-correlation-id": "unsafe value" }))
        .correlationId,
    ).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("replaces an overlong request identifier with a server-generated UUID", () => {
    expect(
      createRequestContext(new Headers({ "x-request-id": "a".repeat(129) }))
        .requestId,
    ).toMatch(/^[0-9a-f-]{36}$/);
  });
});
