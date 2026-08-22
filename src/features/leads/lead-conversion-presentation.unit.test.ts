import { describe, expect, it } from "vitest";

import {
  leadConversionErrorMessage,
  resolutionKindLabel,
} from "@/features/leads/lead-conversion-presentation";

describe("lead conversion presentation", () => {
  it("maps every persisted resolution kind and fails safely for an unknown code", () => {
    expect(resolutionKindLabel("CREATED_NEW_CUSTOMER")).toContain("Yeni");
    expect(resolutionKindLabel("LINKED_EXPLICIT_CUSTOMER")).toContain(
      "Seçilen",
    );
    expect(resolutionKindLabel("LINKED_EXACT_IDENTITY")).toContain(
      "Doğrulanmış",
    );
    expect(resolutionKindLabel("FUTURE_VALUE")).toBe(
      "Dönüşüm sonucu kaydedildi",
    );
  });

  it("keeps typed errors safe and generic at the UI boundary", () => {
    expect(leadConversionErrorMessage("CUSTOMER_IDENTITY_CONFLICT")).toContain(
      "birden fazla",
    );
    expect(
      leadConversionErrorMessage("CUSTOMER_LINK_NOT_AUTHORIZED"),
    ).not.toMatch(/UUID|SQL|email|telefon/i);
    expect(leadConversionErrorMessage("unknown")).toBe(
      "Dönüştürme tamamlanamadı. Lütfen tekrar deneyin.",
    );
  });
});
