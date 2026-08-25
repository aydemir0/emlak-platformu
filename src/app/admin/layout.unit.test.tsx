import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/application/errors/application-error";

vi.mock("server-only", () => ({}));

const { redirect, reportUnexpectedError, requireStaffPrincipal } = vi.hoisted(
  () => ({
    redirect: vi.fn(),
    reportUnexpectedError: vi.fn(),
    requireStaffPrincipal: vi.fn(),
  }),
);

vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ "x-correlation-id": "edge_request-42.prod" }),
  ),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/infrastructure/auth/require-staff-principal.server", () => ({
  requireStaffPrincipal,
}));
vi.mock("@/infrastructure/observability/runtime-observability.server", () => ({
  reportUnexpectedError,
}));

import * as adminLayout from "./layout";

describe("admin route metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirect.mockImplementation((location: string) => {
      throw new Error(`NEXT_REDIRECT:${location}`);
    });
  });

  it("declares noindex metadata for otherwise authorized admin screens", () => {
    expect("metadata" in adminLayout).toBe(true);
    expect(adminLayout.metadata).toMatchObject({
      robots: { index: false, follow: false },
    });
  });

  it.each(["UNAUTHENTICATED", "MFA_REQUIRED", "FORBIDDEN"] as const)(
    "redirects the known %s authentication denial",
    async (code) => {
      requireStaffPrincipal.mockRejectedValueOnce(
        new ApplicationError(code, code),
      );

      await expect(
        adminLayout.default({ children: <div>private</div> }),
      ).rejects.toThrow("NEXT_REDIRECT:/");

      expect(redirect).toHaveBeenCalledOnce();
      expect(reportUnexpectedError).not.toHaveBeenCalled();
    },
  );

  it("reports and rethrows an authentication dependency failure", async () => {
    const error = new ApplicationError(
      "DEPENDENCY_UNAVAILABLE",
      "database detail",
    );
    requireStaffPrincipal.mockRejectedValueOnce(error);

    await expect(
      adminLayout.default({ children: <div>private</div> }),
    ).rejects.toBe(error);

    expect(redirect).not.toHaveBeenCalled();
    expect(reportUnexpectedError).toHaveBeenCalledOnce();
    expect(reportUnexpectedError).toHaveBeenCalledWith(error, {
      correlationId: "edge_request-42.prod",
      operation: "admin.layout.authenticate",
    });
  });
});
