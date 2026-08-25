import { describe, expect, it } from "vitest";

import robots from "./robots";

describe("robots policy", () => {
  it("keeps public eligible pages crawlable while excluding private boundaries", () => {
    const policy = robots();
    const rules = Array.isArray(policy.rules) ? policy.rules : [policy.rules];
    const disallow = rules.flatMap((rule) => rule.disallow ?? []);

    expect(disallow).toEqual(
      expect.arrayContaining([
        "/admin/",
        "/admin",
        "/auth/",
        "/auth",
        "/crm/",
        "/crm",
        "/customers/",
        "/customers",
        "/leads/",
        "/leads",
        "/customer-requests/",
        "/customer-requests",
      ]),
    );
    expect(disallow).not.toContain("/");
  });
});
