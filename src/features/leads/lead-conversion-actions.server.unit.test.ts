import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/application/errors/application-error";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const { convertLeadToCustomer } = vi.hoisted(() => ({
  convertLeadToCustomer: vi.fn(),
}));
const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const { reportUnexpectedError } = vi.hoisted(() => ({
  reportUnexpectedError: vi.fn(),
}));
const { requestHeaders } = vi.hoisted(() => ({
  requestHeaders: { current: new Headers() },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => requestHeaders.current),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/application/leads/convert-lead-to-customer", () => ({
  convertLeadToCustomer,
}));
vi.mock("@/infrastructure/auth/require-staff-principal.server", () => ({
  requireStaffPrincipal: vi.fn(async () => ({
    identityId: "10000000-0000-4000-8000-000000000001",
    authUserId: "20000000-0000-4000-8000-000000000001",
    role: "ADMIN",
    aal: "aal2",
  })),
}));
vi.mock(
  "@/infrastructure/leads/postgres-lead-conversion-unit-of-work.server",
  () => ({ PostgresLeadConversionUnitOfWork: class {} }),
);
vi.mock("@/infrastructure/observability/runtime-observability.server", () => ({
  reportUnexpectedError,
}));

import { convertLeadToCustomerAction } from "@/features/leads/lead-conversion-actions.server";

function formData() {
  const form = new FormData();
  form.set("leadId", "30000000-0000-4000-8000-000000000001");
  form.set("idempotencyKey", "40000000-0000-4000-8000-000000000001");
  return form;
}

describe("lead conversion server action", () => {
  beforeEach(() => {
    requestHeaders.current = new Headers();
    reportUnexpectedError.mockClear();
  });

  it("calls the application boundary with server-derived authority and revalidates on success", async () => {
    convertLeadToCustomer.mockResolvedValueOnce({
      leadId: "30000000-0000-4000-8000-000000000001",
      customerId: "50000000-0000-4000-8000-000000000001",
      customerRequestId: null,
      outcome: "WON",
      createdCustomer: true,
      resolutionKind: "CREATED_NEW_CUSTOMER",
      convertedAt: new Date(),
    });
    await expect(
      convertLeadToCustomerAction({ ok: false }, formData()),
    ).resolves.toMatchObject({ ok: true, result: { createdCustomer: true } });
    expect(convertLeadToCustomer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actor: expect.anything() }),
      expect.objectContaining({ createInitialRequest: false }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/leads");
  });

  it("maps identity and authorization failures to stable safe codes", async () => {
    convertLeadToCustomer.mockRejectedValueOnce(
      new ApplicationError("CUSTOMER_IDENTITY_CONFLICT", "internal"),
    );
    await expect(
      convertLeadToCustomerAction({ ok: false }, formData()),
    ).resolves.toEqual({ ok: false, error: "CUSTOMER_IDENTITY_CONFLICT" });
    convertLeadToCustomer.mockRejectedValueOnce(
      new ApplicationError("CUSTOMER_LINK_NOT_AUTHORIZED", "internal"),
    );
    await expect(
      convertLeadToCustomerAction({ ok: false }, formData()),
    ).resolves.toEqual({ ok: false, error: "CUSTOMER_LINK_NOT_AUTHORIZED" });
  });

  it("does not disclose whether a direct lead id exists", async () => {
    const states = [];
    for (const code of ["LEAD_NOT_FOUND", "LEAD_FORBIDDEN"] as const) {
      convertLeadToCustomer.mockRejectedValueOnce(
        new ApplicationError(code, "internal-only detail"),
      );
      states.push(await convertLeadToCustomerAction({ ok: false }, formData()));
    }

    expect(states).toEqual([
      { ok: false, error: "LEAD_NOT_FOUND" },
      { ok: false, error: "LEAD_NOT_FOUND" },
    ]);
  });

  it("propagates the validated delivery request context to the application boundary", async () => {
    requestHeaders.current = new Headers({
      "x-correlation-id": "edge_request-42.prod",
      "x-request-id": "request_42",
    });
    convertLeadToCustomer.mockResolvedValueOnce({
      leadId: "30000000-0000-4000-8000-000000000001",
      customerId: "50000000-0000-4000-8000-000000000001",
      customerRequestId: null,
      outcome: "WON",
      createdCustomer: true,
      resolutionKind: "CREATED_NEW_CUSTOMER",
      convertedAt: new Date(),
    });

    await convertLeadToCustomerAction({ ok: false }, formData());

    expect(convertLeadToCustomer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        correlationId: "edge_request-42.prod",
        requestId: "request_42",
      }),
      expect.anything(),
    );
  });

  it("emits a sanitized diagnostic for an unexpected application failure", async () => {
    const error = new Error("postgres://user:password@db.internal/app");
    requestHeaders.current = new Headers({
      "x-correlation-id": "edge_request-42.prod",
    });
    convertLeadToCustomer.mockRejectedValueOnce(error);

    await expect(
      convertLeadToCustomerAction({ ok: false }, formData()),
    ).resolves.toEqual({ ok: false, error: "LEAD_CONVERSION_FAILED" });

    expect(reportUnexpectedError).toHaveBeenCalledWith(error, {
      correlationId: "edge_request-42.prod",
      operation: "lead.convert",
    });
  });

  it("returns the stable validation error without reporting an expected Zod failure", async () => {
    const invalid = formData();
    invalid.delete("leadId");

    await expect(
      convertLeadToCustomerAction({ ok: false }, invalid),
    ).resolves.toEqual({ ok: false, error: "LEAD_CONVERSION_FAILED" });

    expect(reportUnexpectedError).not.toHaveBeenCalled();
  });

  it("reports a downstream Zod failure after successful command parsing", async () => {
    const downstreamError = z
      .object({ persistedId: z.uuid() })
      .safeParse({}).error;
    requestHeaders.current = new Headers({
      "x-correlation-id": "edge_request-42.prod",
    });
    convertLeadToCustomer.mockRejectedValueOnce(downstreamError);

    await expect(
      convertLeadToCustomerAction({ ok: false }, formData()),
    ).resolves.toEqual({ ok: false, error: "LEAD_CONVERSION_FAILED" });

    expect(reportUnexpectedError).toHaveBeenCalledWith(downstreamError, {
      correlationId: "edge_request-42.prod",
      operation: "lead.convert",
    });
  });

  it("reports a typed conversion failure exactly once", async () => {
    const error = new ApplicationError(
      "LEAD_CONVERSION_FAILED",
      "database detail",
    );
    requestHeaders.current = new Headers({
      "x-correlation-id": "edge_request-42.prod",
    });
    convertLeadToCustomer.mockRejectedValueOnce(error);

    await expect(
      convertLeadToCustomerAction({ ok: false }, formData()),
    ).resolves.toEqual({ ok: false, error: "LEAD_CONVERSION_FAILED" });

    expect(reportUnexpectedError).toHaveBeenCalledOnce();
    expect(reportUnexpectedError).toHaveBeenCalledWith(error, {
      correlationId: "edge_request-42.prod",
      operation: "lead.convert",
    });
  });
});
