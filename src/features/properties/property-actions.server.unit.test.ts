import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/application/errors/application-error";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  updateProperty: vi.fn(),
  revalidatePath: vi.fn(),
  reportUnexpectedError: vi.fn(),
  requestHeaders: { current: new Headers() },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => mocks.requestHeaders.current),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/application/properties/create-property-draft", () => ({
  createPropertyDraft: vi.fn(),
}));
vi.mock("@/application/properties/update-property", () => ({
  updateProperty: mocks.updateProperty,
}));
vi.mock("@/application/properties/change-property-price", () => ({
  changePropertyPrice: vi.fn(),
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
  "@/infrastructure/properties/postgres-property-unit-of-work.server",
  () => ({ PostgresPropertyUnitOfWork: class {} }),
);
vi.mock("@/infrastructure/observability/runtime-observability.server", () => ({
  reportUnexpectedError: mocks.reportUnexpectedError,
}));
vi.mock("@/features/properties/property-form-schema", () => ({
  formDataToRecord: (formData: FormData) => Object.fromEntries(formData),
  parsePropertyForm: vi.fn(() => ({ title: "Test property" })),
}));

import { updatePropertyAction } from "@/features/properties/property-actions.server";

function propertyForm() {
  const form = new FormData();
  form.set("propertyId", "30000000-0000-4000-8000-000000000001");
  form.set("expectedVersion", "1");
  form.set("idempotencyKey", "40000000-0000-4000-8000-000000000001");
  return form;
}

describe("property server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestHeaders.current = new Headers({
      "x-correlation-id": "edge_request-42.prod",
    });
  });

  it("does not disclose whether a direct property id exists", async () => {
    const states = [];
    for (const code of ["PROPERTY_NOT_FOUND", "PROPERTY_FORBIDDEN"] as const) {
      mocks.updateProperty.mockRejectedValueOnce(
        new ApplicationError(code, "internal-only detail"),
      );
      states.push(await updatePropertyAction({ ok: false }, propertyForm()));
    }

    expect(states).toEqual([
      {
        ok: false,
        error: { code: "PROPERTY_NOT_FOUND", message: "PROPERTY_NOT_FOUND" },
      },
      {
        ok: false,
        error: { code: "PROPERTY_NOT_FOUND", message: "PROPERTY_NOT_FOUND" },
      },
    ]);
    expect(mocks.reportUnexpectedError).not.toHaveBeenCalled();
  });

  it("reports an unexpected property dependency failure exactly once", async () => {
    const error = new Error("postgres://user:password@db.internal/app");
    mocks.updateProperty.mockRejectedValueOnce(error);

    await expect(
      updatePropertyAction({ ok: false }, propertyForm()),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Operation could not be completed",
      },
    });

    expect(mocks.reportUnexpectedError).toHaveBeenCalledOnce();
    expect(mocks.reportUnexpectedError).toHaveBeenCalledWith(error, {
      correlationId: "edge_request-42.prod",
      operation: "property.update",
    });
  });

  it("does not report a property validation failure", async () => {
    mocks.updateProperty.mockRejectedValueOnce(
      new ApplicationError(
        "PROPERTY_VALIDATION_FAILED",
        "PROPERTY_VALIDATION_FAILED",
      ),
    );

    await updatePropertyAction({ ok: false }, propertyForm());

    expect(mocks.reportUnexpectedError).not.toHaveBeenCalled();
  });
});
