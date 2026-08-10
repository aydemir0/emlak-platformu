import { describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/application/errors/application-error";

vi.mock("server-only", () => ({}));

const { createPublicLead } = vi.hoisted(() => ({ createPublicLead: vi.fn() }));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/application/leads/create-public-lead", () => ({ createPublicLead }));
vi.mock("@/config/env.server.runtime", () => ({
  getServerEnv: () => ({
    LEAD_INTAKE_HMAC_SECRET: "a".repeat(32),
    LEAD_RATE_LIMIT_MAX_ATTEMPTS: 5,
    LEAD_RATE_LIMIT_WINDOW_SECONDS: 900,
  }),
}));
vi.mock(
  "@/infrastructure/leads/postgres-public-lead-unit-of-work.server",
  () => ({
    PostgresPublicLeadUnitOfWork: class {},
  }),
);

import { createPublicLeadAction } from "@/features/leads/public-lead-actions.server";

function formData() {
  const values = new FormData();
  values.set("propertyId", "public-property-id");
  values.set("email", "person@example.test");
  values.set("consentAccepted", "on");
  values.set("idempotencyKey", "10000000-0000-4000-8000-000000000001");
  return values;
}

describe("public lead action", () => {
  it("returns the same generic acceptance envelope for an invisible property", async () => {
    createPublicLead.mockRejectedValueOnce(
      new ApplicationError("LEAD_NOT_FOUND", "LEAD_NOT_FOUND"),
    );

    await expect(
      createPublicLeadAction({ accepted: false }, formData()),
    ).resolves.toEqual({
      accepted: true,
    });
  });

  it("returns a validation state for a malformed public submission", async () => {
    const invalid = formData();
    invalid.delete("email");

    await expect(
      createPublicLeadAction({ accepted: false }, invalid),
    ).resolves.toEqual({
      accepted: false,
      error: "LEAD_VALIDATION_FAILED",
    });
  });
});
