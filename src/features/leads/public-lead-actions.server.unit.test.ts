import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApplicationError } from "@/application/errors/application-error";

vi.mock("server-only", () => ({}));

const { createPublicLead } = vi.hoisted(() => ({ createPublicLead: vi.fn() }));
const { reportUnexpectedError } = vi.hoisted(() => ({
  reportUnexpectedError: vi.fn(),
}));
const { requestHeaders } = vi.hoisted(() => ({
  requestHeaders: { current: new Headers() },
}));
const { serverEnv } = vi.hoisted(() => ({
  serverEnv: {
    current: {
      APP_ENV: "test",
      LEAD_INTAKE_HMAC_SECRET: "a".repeat(32),
      LEAD_RATE_LIMIT_MAX_ATTEMPTS: 5,
      LEAD_RATE_LIMIT_WINDOW_SECONDS: 900,
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => requestHeaders.current),
}));
vi.mock("@/application/leads/create-public-lead", () => ({ createPublicLead }));
vi.mock("@/config/env.server.runtime", () => ({
  getServerEnv: () => serverEnv.current,
}));
vi.mock(
  "@/infrastructure/leads/postgres-public-lead-unit-of-work.server",
  () => ({
    PostgresPublicLeadUnitOfWork: class {},
  }),
);
vi.mock("@/infrastructure/observability/runtime-observability.server", () => ({
  reportUnexpectedError,
}));

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
  beforeEach(() => {
    requestHeaders.current = new Headers();
    serverEnv.current.APP_ENV = "test";
    createPublicLead.mockReset();
    reportUnexpectedError.mockClear();
  });

  it.each(["preview", "production"] as const)(
    "reports intake unavailable in %s when no challenge provider is configured",
    async (appEnvironment) => {
      serverEnv.current.APP_ENV = appEnvironment;
      const submitted = formData();
      submitted.set("challengeToken", "unverified-client-claim");

      await expect(
        createPublicLeadAction({ accepted: false }, submitted),
      ).resolves.toEqual({
        accepted: false,
        error: "LEAD_INTAKE_UNAVAILABLE",
      });

      expect(createPublicLead).not.toHaveBeenCalled();
    },
  );

  it("keeps honeypot rejection non-enumerating when production intake is unavailable", async () => {
    serverEnv.current.APP_ENV = "production";
    const submitted = formData();
    submitted.set("companyWebsite", "https://bot.example.test");

    await expect(
      createPublicLeadAction({ accepted: false }, submitted),
    ).resolves.toEqual({ accepted: true });

    expect(createPublicLead).not.toHaveBeenCalled();
  });

  it("allows local and test intake without claiming that a challenge was verified", async () => {
    await expect(
      createPublicLeadAction({ accepted: false }, formData()),
    ).resolves.toEqual({ accepted: true });

    expect(createPublicLead).toHaveBeenCalledOnce();
  });

  it("silently accepts a filled honeypot without creating a lead", async () => {
    const submitted = formData();
    submitted.set("companyWebsite", "https://bot.example.test");

    await expect(
      createPublicLeadAction({ accepted: false }, submitted),
    ).resolves.toEqual({ accepted: true });

    expect(createPublicLead).not.toHaveBeenCalled();
  });

  it("does not let forged forwarding headers choose the durable abuse key", async () => {
    requestHeaders.current = new Headers({
      "x-forwarded-for": "198.51.100.10",
    });
    await createPublicLeadAction({ accepted: false }, formData());
    const firstSignal = createPublicLead.mock.calls[0]?.[1]?.abuseNetworkSignal;

    createPublicLead.mockClear();
    requestHeaders.current = new Headers({
      "x-forwarded-for": "203.0.113.25",
    });
    await createPublicLeadAction({ accepted: false }, formData());
    const secondSignal =
      createPublicLead.mock.calls[0]?.[1]?.abuseNetworkSignal;

    expect(firstSignal).toMatch(/^[0-9a-f]{64}$/);
    expect(secondSignal).toBe(firstSignal);
  });

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

    expect(reportUnexpectedError).not.toHaveBeenCalled();
  });

  it("reports a downstream Zod failure after successful form parsing", async () => {
    const downstreamError = z
      .object({ persistedId: z.uuid() })
      .safeParse({}).error;
    requestHeaders.current = new Headers({
      "x-correlation-id": "edge_request-42.prod",
    });
    createPublicLead.mockRejectedValueOnce(downstreamError);

    await expect(
      createPublicLeadAction({ accepted: false }, formData()),
    ).resolves.toEqual({
      accepted: false,
      error: "LEAD_VALIDATION_FAILED",
    });

    expect(reportUnexpectedError).toHaveBeenCalledWith(downstreamError, {
      correlationId: "edge_request-42.prod",
      operation: "lead.public-create",
    });
  });

  it("reports unexpected failures with correlation but without form data", async () => {
    const error = new Error("postgres://user:password@db.internal/app");
    requestHeaders.current = new Headers({
      "x-correlation-id": "edge_request-42.prod",
    });
    createPublicLead.mockRejectedValueOnce(error);

    await expect(
      createPublicLeadAction({ accepted: false }, formData()),
    ).resolves.toEqual({ accepted: false, error: "LEAD_VALIDATION_FAILED" });

    expect(reportUnexpectedError).toHaveBeenCalledWith(error, {
      correlationId: "edge_request-42.prod",
      operation: "lead.public-create",
    });
  });
});
