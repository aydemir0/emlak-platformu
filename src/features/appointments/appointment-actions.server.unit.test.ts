import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/application/errors/application-error";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  mutateAppointment: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/application/appointments/appointment-use-cases", () => ({
  createAppointment: vi.fn(),
  mutateAppointment: mocks.mutateAppointment,
}));
vi.mock("@/infrastructure/auth/require-staff-principal.server", () => ({
  requireStaffPrincipal: vi.fn(async () => ({
    identityId: "10000000-0000-4000-8000-000000000001",
    authUserId: "20000000-0000-4000-8000-000000000001",
    role: "ADMIN",
    aal: "aal2",
  })),
}));
vi.mock("@/infrastructure/appointments/postgres-appointments.server", () => ({
  PostgresAppointmentUnitOfWork: class {},
}));

import { appointmentConfirmAction } from "@/features/appointments/appointment-actions.server";

function appointmentForm() {
  const form = new FormData();
  form.set("appointmentId", "30000000-0000-4000-8000-000000000001");
  form.set("expectedVersion", "1");
  form.set("idempotencyKey", "40000000-0000-4000-8000-000000000001");
  return form;
}

describe("appointment action boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["APPOINTMENT_NOT_FOUND", "APPOINTMENT_FORBIDDEN"] as const)(
    "normalizes %s to the same non-enumerating outward error",
    async (code) => {
      mocks.mutateAppointment.mockRejectedValueOnce(
        new ApplicationError(code, "internal-only detail"),
      );

      await expect(
        appointmentConfirmAction(appointmentForm()),
      ).rejects.toMatchObject({
        code: "APPOINTMENT_NOT_FOUND",
        message: "APPOINTMENT_NOT_FOUND",
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it.each([
    "APPOINTMENT_CONFLICT",
    "APPOINTMENT_INVALID_TRANSITION",
    "APPOINTMENT_TIME_CONFLICT",
  ] as const)("preserves the %s business distinction", async (code) => {
    mocks.mutateAppointment.mockRejectedValueOnce(
      new ApplicationError(code, code),
    );
    await expect(
      appointmentConfirmAction(appointmentForm()),
    ).rejects.toMatchObject({ code });
  });
});
