import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/application/errors/application-error";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  changeLeadStatus: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/application/leads/lead-crm-use-cases", () => ({
  addLeadNote: vi.fn(),
  assignLeadAdvisor: vi.fn(),
  changeLeadStatus: mocks.changeLeadStatus,
}));
vi.mock("@/infrastructure/auth/require-staff-principal.server", () => ({
  requireStaffPrincipal: vi.fn(async () => ({
    identityId: "10000000-0000-4000-8000-000000000001",
    authUserId: "20000000-0000-4000-8000-000000000001",
    role: "ADMIN",
    aal: "aal2",
  })),
}));
vi.mock("@/infrastructure/leads/postgres-lead-crm.server", () => ({
  PostgresLeadCrmUnitOfWork: class {},
}));

import { leadStatusAction } from "@/features/leads/lead-actions.server";

function statusForm() {
  const form = new FormData();
  form.set("leadId", "30000000-0000-4000-8000-000000000001");
  form.set("expectedVersion", "1");
  form.set("idempotencyKey", "40000000-0000-4000-8000-000000000001");
  form.set("status", "CONTACTED");
  return form;
}

describe("lead CRM action boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["LEAD_NOT_FOUND", "LEAD_FORBIDDEN"] as const)(
    "normalizes %s to the same non-enumerating outward error",
    async (code) => {
      mocks.changeLeadStatus.mockRejectedValueOnce(
        new ApplicationError(code, "internal-only detail"),
      );

      await expect(leadStatusAction(statusForm())).rejects.toMatchObject({
        code: "LEAD_NOT_FOUND",
        message: "LEAD_NOT_FOUND",
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it.each(["LEAD_CONFLICT", "LEAD_INVALID_TRANSITION"] as const)(
    "preserves the %s business distinction",
    async (code) => {
      mocks.changeLeadStatus.mockRejectedValueOnce(
        new ApplicationError(code, code),
      );
      await expect(leadStatusAction(statusForm())).rejects.toMatchObject({
        code,
      });
    },
  );
});
