import type { MatchingCriterionView } from "@/application/matching/matching-read-model";

export const matchingReasonLabel = (code: string) =>
  ({
    LOCATION_EXACT: "Konum tam uyumlu",
    LOCATION_SAME_CITY: "Aynı şehirde",
    BUDGET_IN_RANGE: "Bütçe aralığında",
    PROPERTY_TYPE_MATCH: "Emlak türü uyumlu",
    ROOMS_IN_RANGE: "Oda aralığında",
    AREA_IN_RANGE: "Net alan aralığında",
    FEATURES_FULL_OVERLAP: "Özellikler uyumlu",
  })[code] ?? "Eşleşme gerekçesi mevcut";

export const matchingCriterionLabel = (criterion: MatchingCriterionView) => {
  if (criterion.state === "MISSING") return "Belirtilmemiş";
  if (criterion.state === "FLEXIBLE") return "Esnek";
  return criterion.value ?? "Kısıtlı";
};
