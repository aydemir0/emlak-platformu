import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/application/errors/application-error";

vi.mock("server-only", () => ({}));

const { refreshCustomerRequestMatches } = vi.hoisted(() => ({
  refreshCustomerRequestMatches: vi.fn(),
}));
const { redirect, revalidatePath } = vi.hoisted(() => ({
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));
const { requestHeaders } = vi.hoisted(() => ({
  requestHeaders: { current: new Headers() },
}));
const { reportUnexpectedError } = vi.hoisted(() => ({
  reportUnexpectedError: vi.fn(),
}));
const { requireStaffPrincipal } = vi.hoisted(() => ({
  requireStaffPrincipal: vi.fn(),
}));
const { getServerEnv } = vi.hoisted(() => ({ getServerEnv: vi.fn() }));
const { unitOfWorkConstruction } = vi.hoisted(() => ({
  unitOfWorkConstruction: { count: 0 },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => requestHeaders.current),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/application/matching/matching-use-cases", () => ({
  refreshCustomerRequestMatches,
}));
vi.mock("@/config/env.server.runtime", () => ({
  getServerEnv,
}));
vi.mock("@/infrastructure/auth/require-staff-principal.server", () => ({
  requireStaffPrincipal,
}));
vi.mock("@/infrastructure/matching/postgres-matching.server", () => ({
  PostgresMatchingUnitOfWork: class {
    constructor() {
      unitOfWorkConstruction.count += 1;
    }
  },
}));
vi.mock("@/infrastructure/observability/runtime-observability.server", () => ({
  reportUnexpectedError,
}));

import { calculateMatchesAction } from "@/features/matching/matching-actions.server";

describe("matching server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirect.mockImplementation((location: string) => {
      throw new Error(`NEXT_REDIRECT:${location}`);
    });
    requireStaffPrincipal.mockReset();
    requireStaffPrincipal.mockResolvedValue({
      identityId: "10000000-0000-4000-8000-000000000001",
      authUserId: "20000000-0000-4000-8000-000000000001",
      role: "ADMIN",
      aal: "aal2",
    });
    getServerEnv.mockReset();
    getServerEnv.mockReturnValue({ MATCHING_CANDIDATE_LIMIT: 500 });
  });

  it("does not construct the database-backed unit of work while loading the action module", () => {
    expect(unitOfWorkConstruction.count).toBe(0);
  });

  it("authenticates before environment lookup, unit-of-work construction, or matching", async () => {
    requireStaffPrincipal.mockRejectedValueOnce(
      new ApplicationError("UNAUTHENTICATED", "Authentication required"),
    );
    const form = new FormData();
    form.set("customerRequestId", "30000000-0000-4000-8000-000000000001");

    await expect(calculateMatchesAction(form)).rejects.toThrow(
      "NEXT_REDIRECT:",
    );

    expect(getServerEnv).not.toHaveBeenCalled();
    expect(unitOfWorkConstruction.count).toBe(0);
    expect(refreshCustomerRequestMatches).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports an unexpected matching failure before returning the failed redirect", async () => {
    const error = new Error("postgres://user:password@db.internal/app");
    requestHeaders.current = new Headers({
      "x-correlation-id": "edge_request-42.prod",
    });
    refreshCustomerRequestMatches.mockRejectedValueOnce(error);
    const form = new FormData();
    form.set("customerRequestId", "30000000-0000-4000-8000-000000000001");

    await expect(calculateMatchesAction(form)).rejects.toThrow(
      "NEXT_REDIRECT:",
    );

    expect(reportUnexpectedError).toHaveBeenCalledWith(error, {
      correlationId: "edge_request-42.prod",
      operation: "matching.calculate",
    });
    expect(redirect).toHaveBeenCalledWith(
      "/admin/customer-requests/30000000-0000-4000-8000-000000000001?matching=failed",
    );
    expect(redirect).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a typed persistence failure exactly once", async () => {
    const error = new ApplicationError(
      "MATCHING_PERSISTENCE_FAILED",
      "database detail",
    );
    requestHeaders.current = new Headers({
      "x-correlation-id": "edge_request-42.prod",
    });
    refreshCustomerRequestMatches.mockRejectedValueOnce(error);
    const form = new FormData();
    form.set("customerRequestId", "30000000-0000-4000-8000-000000000001");

    await expect(calculateMatchesAction(form)).rejects.toThrow(
      "NEXT_REDIRECT:",
    );

    expect(reportUnexpectedError).toHaveBeenCalledOnce();
    expect(reportUnexpectedError).toHaveBeenCalledWith(error, {
      correlationId: "edge_request-42.prod",
      operation: "matching.calculate",
    });
  });
});
