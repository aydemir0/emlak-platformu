import { describe, expect, it } from "vitest";

import { err, ok } from "@/application/result";

describe("application result", () => {
  it("represents success and failure without provider exceptions", () => {
    expect(ok({ id: "safe" })).toEqual({ ok: true, value: { id: "safe" } });
    expect(err("FORBIDDEN")).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});
