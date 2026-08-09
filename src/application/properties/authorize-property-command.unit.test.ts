import { describe, expect, it } from "vitest";

import { authorizePropertyCommand } from "@/application/properties/authorize-property-command";

const admin = {
  active: true,
  role: "ADMIN" as const,
  aal: "aal2" as const,
  permissions: new Set<string>(),
  advisorId: null,
};

describe("property command authorization", () => {
  it("allows an AAL2 ADMIN and rejects AAL1", () => {
    expect(() =>
      authorizePropertyCommand(admin, "update", { assigned: false }),
    ).not.toThrow();
    expect(() =>
      authorizePropertyCommand({ ...admin, aal: "aal1" }, "update", {
        assigned: false,
      }),
    ).toThrow("MFA_REQUIRED");
  });

  it("allows an assigned ADVISOR but denies cross-advisor access", () => {
    const advisor = {
      active: true,
      role: "ADVISOR" as const,
      aal: "aal1" as const,
      permissions: new Set<string>(),
      advisorId: "a1",
    };
    expect(() =>
      authorizePropertyCommand(advisor, "update", { assigned: true }),
    ).not.toThrow();
    expect(() =>
      authorizePropertyCommand(advisor, "update", { assigned: false }),
    ).toThrow("PROPERTY_FORBIDDEN");
  });

  it("requires explicit publish permission and never lets ADVISOR delete or restore", () => {
    const advisor = {
      active: true,
      role: "ADVISOR" as const,
      aal: "aal1" as const,
      permissions: new Set<string>(),
      advisorId: "a1",
    };
    expect(() =>
      authorizePropertyCommand(advisor, "publish", { assigned: true }),
    ).toThrow("PROPERTY_FORBIDDEN");
    expect(() =>
      authorizePropertyCommand(
        { ...advisor, permissions: new Set(["properties.publish"]) },
        "publish",
        { assigned: true },
      ),
    ).not.toThrow();
    expect(() =>
      authorizePropertyCommand(advisor, "delete", { assigned: true }),
    ).toThrow("PROPERTY_FORBIDDEN");
    expect(() =>
      authorizePropertyCommand(advisor, "restore", { assigned: true }),
    ).toThrow("PROPERTY_FORBIDDEN");
    expect(() =>
      authorizePropertyCommand(advisor, "assign", { assigned: true }),
    ).toThrow("PROPERTY_FORBIDDEN");
  });
});
