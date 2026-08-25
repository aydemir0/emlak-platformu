import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useActionState: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: mocks.useActionState,
}));
vi.mock("@/features/leads/public-lead-actions.server", () => ({
  createPublicLeadAction: vi.fn(),
}));

import { PublicLeadContactForm } from "@/features/leads/components/public-lead-contact-form";

describe("public lead contact form", () => {
  afterEach(cleanup);

  it.each(["preview", "production"])(
    "shows an explicit unavailable outcome and disables resubmission in %s",
    () => {
      mocks.useActionState.mockReturnValue([
        { accepted: false, error: "LEAD_INTAKE_UNAVAILABLE" },
        vi.fn(),
        false,
      ]);

      render(
        <PublicLeadContactForm propertyId="30000000-0000-4000-8000-000000000001" />,
      );

      expect(screen.queryByText("Talebiniz alındı.")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(
        "İletişim formu şu anda kullanılamıyor.",
      );
      expect(
        screen.getByRole("button", { name: "Danışmana ulaş" }),
      ).toBeDisabled();
    },
  );
});
