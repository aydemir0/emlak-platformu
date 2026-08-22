import { describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/application/errors/application-error";

vi.mock("server-only", () => ({}));

const { convertLeadToCustomer } = vi.hoisted(() => ({
  convertLeadToCustomer: vi.fn(),
}));
const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
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

import { convertLeadToCustomerAction } from "@/features/leads/lead-conversion-actions.server";

function formData() {
  const form = new FormData();
  form.set("leadId", "30000000-0000-4000-8000-000000000001");
  form.set("idempotencyKey", "40000000-0000-4000-8000-000000000001");
  return form;
}

describe("lead conversion server action", () => {
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
});
