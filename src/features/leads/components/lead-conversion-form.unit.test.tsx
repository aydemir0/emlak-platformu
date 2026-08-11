import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/leads/lead-conversion-actions.server", () => ({
  convertLeadToCustomerAction: vi.fn(),
}));

import { LeadConversionForm } from "@/features/leads/components/lead-conversion-form";

describe("LeadConversionForm", () => {
  it("starts in automatic mode, exposes the initial request option, and reveals explicit input only on request", () => {
    render(
      <LeadConversionForm
        leadId="10000000-0000-4000-8000-000000000001"
        idempotencyKey="20000000-0000-4000-8000-000000000001"
      />,
    );
    expect(
      screen.getByText("Doğrulanmış iletişim bilgileriyle otomatik çözümle"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("İlk müşteri talebini oluştur"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Mevcut müşteri referansı"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByLabelText("Yetkili mevcut müşteri referansını kullan"),
    );
    expect(screen.getByLabelText("Mevcut müşteri referansı")).toBeRequired();
  });
});
