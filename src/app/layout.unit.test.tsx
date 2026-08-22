import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/config/env.server.runtime", () => ({
  getServerEnv: () => ({ APP_BASE_URL: "https://emlak.example.test" }),
}));

import { metadata } from "./layout";

describe("root metadata", () => {
  it("uses the validated application origin as metadataBase", () => {
    expect(metadata.metadataBase).toEqual(
      new URL("https://emlak.example.test"),
    );
  });
});
