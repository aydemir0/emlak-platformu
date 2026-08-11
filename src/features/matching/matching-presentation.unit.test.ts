import { describe, expect, it } from "vitest";

import {
  matchingCriterionLabel,
  matchingReasonLabel,
} from "@/features/matching/matching-presentation";

describe("matching presentation", () => {
  it("distinguishes missing, flexible and constrained profile states", () => {
    expect(matchingCriterionLabel({ state: "MISSING", value: null })).toBe(
      "Belirtilmemiş",
    );
    expect(matchingCriterionLabel({ state: "FLEXIBLE", value: null })).toBe(
      "Esnek",
    );
    expect(
      matchingCriterionLabel({ state: "CONSTRAINED", value: "2–3 oda" }),
    ).toBe("2–3 oda");
  });
  it("maps known reason codes and safely falls back for an unknown code", () => {
    expect(matchingReasonLabel("BUDGET_IN_RANGE")).toBe("Bütçe aralığında");
    expect(matchingReasonLabel("UNEXPECTED_CODE")).toBe(
      "Eşleşme gerekçesi mevcut",
    );
  });
});
