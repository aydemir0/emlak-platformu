import type {
  LeadConversionResult,
  ResolutionKind,
} from "@/application/leads/convert-lead-to-customer";

export type LeadConversionActionState = Readonly<{
  ok: boolean;
  result?: LeadConversionResult;
  error?: string;
}>;

export const initialLeadConversionActionState: LeadConversionActionState = {
  ok: false,
};

const resolutionLabels: Record<ResolutionKind, string> = {
  CREATED_NEW_CUSTOMER: "Yeni müşteri kaydı oluşturuldu",
  LINKED_EXPLICIT_CUSTOMER: "Seçilen müşteri kaydına bağlandı",
  LINKED_EXACT_IDENTITY:
    "Doğrulanmış iletişim bilgisiyle mevcut kayda bağlandı",
};

const errorMessages: Record<string, string> = {
  LEAD_NOT_FOUND: "Lead kaydı bulunamadı veya erişilemiyor.",
  LEAD_CONVERSION_NOT_ALLOWED:
    "Bu lead mevcut yaşam döngüsü durumunda dönüştürülemez.",
  LEAD_CONVERSION_INTEGRITY_CONFLICT:
    "Lead durumu ve dönüşüm kaydı tutarsız. Yönetici incelemesi gerekiyor.",
  CUSTOMER_IDENTITY_CONFLICT:
    "Doğrulanmış iletişim bilgileri birden fazla müşteriyle eşleşiyor. Açık müşteri seçimi gerekiyor.",
  CUSTOMER_LINK_NOT_AUTHORIZED: "Seçilen müşteri kaydına erişim yetkiniz yok.",
  LEAD_CONVERSION_FAILED: "Dönüştürme tamamlanamadı. Lütfen tekrar deneyin.",
};

export function resolutionKindLabel(kind: string | null | undefined): string {
  return kind && kind in resolutionLabels
    ? resolutionLabels[kind as ResolutionKind]
    : "Dönüşüm sonucu kaydedildi";
}

export function leadConversionErrorMessage(code: string | undefined): string {
  return code
    ? (errorMessages[code] ?? errorMessages.LEAD_CONVERSION_FAILED)
    : "";
}
