import { describe, expect, it } from "vitest";
import { ApplicationError } from "@/application/errors/application-error";
import { appointmentUiError } from "./appointment-ui-error";

describe("appointmentUiError", () => {
  it.each([
    [
      "APPOINTMENT_TIME_CONFLICT",
      "Bu danışmanın seçilen saatte başka bir randevusu var.",
    ],
    [
      "APPOINTMENT_CONFLICT",
      "Randevu değişti. Sayfayı yenileyip tekrar deneyin.",
    ],
    [
      "APPOINTMENT_INVALID_TRANSITION",
      "Bu işlem randevunun mevcut durumunda yapılamaz.",
    ],
    ["APPOINTMENT_VALIDATION_FAILED", "Randevu bilgileri geçerli değil."],
    [
      "APPOINTMENT_NOT_FOUND",
      "Randevu bulunamadı veya bu işlem için yetkiniz yok.",
    ],
    [
      "APPOINTMENT_FORBIDDEN",
      "Randevu bulunamadı veya bu işlem için yetkiniz yok.",
    ],
  ] as const)("maps %s to a safe appointment message", (code, message) => {
    expect(appointmentUiError(new ApplicationError(code, code))).toBe(message);
  });

  it("maps unexpected errors to a generic message", () => {
    expect(appointmentUiError(new Error("internal detail"))).toBe(
      "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
    );
  });
});
