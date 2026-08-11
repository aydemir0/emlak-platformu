import { ApplicationError } from "@/application/errors/application-error";

export function appointmentUiError(error: unknown): string {
  if (!(error instanceof ApplicationError)) {
    return "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
  }

  switch (error.code) {
    case "APPOINTMENT_TIME_CONFLICT":
      return "Bu danışmanın seçilen saatte başka bir randevusu var.";
    case "APPOINTMENT_CONFLICT":
      return "Randevu değişti. Sayfayı yenileyip tekrar deneyin.";
    case "APPOINTMENT_INVALID_TRANSITION":
      return "Bu işlem randevunun mevcut durumunda yapılamaz.";
    case "APPOINTMENT_VALIDATION_FAILED":
      return "Randevu bilgileri geçerli değil.";
    case "APPOINTMENT_NOT_FOUND":
    case "APPOINTMENT_FORBIDDEN":
      return "Randevu bulunamadı veya bu işlem için yetkiniz yok.";
    default:
      return "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
  }
}
