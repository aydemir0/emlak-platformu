import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PropertyMediaManager } from "@/features/property-media/components/property-media-manager";

describe("PropertyMediaManager", () => {
  it("renders a real empty state and a constrained multi-file chooser", () => {
    render(
      <PropertyMediaManager
        propertyId="11111111-1111-4111-8111-111111111111"
        initialPropertyVersion="1"
        initialItems={[]}
      />,
    );
    expect(screen.getByText("Henüz görsel eklenmedi.")).toBeInTheDocument();
    const input = screen.getByLabelText("Görsel seç") as HTMLInputElement;
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe("image/jpeg,image/png,image/webp");
  });

  it("shows processing state without inventing preview data", () => {
    render(
      <PropertyMediaManager
        propertyId="11111111-1111-4111-8111-111111111111"
        initialPropertyVersion="2"
        initialItems={[
          {
            id: "22222222-2222-4222-8222-222222222222",
            state: "PROCESSING",
            visibility: "PRIVATE",
            sortOrder: 1,
            isCover: true,
            version: "2",
            failureCode: null,
            failureRetryable: null,
          },
        ]}
      />,
    );
    expect(screen.getByText("PROCESSING")).toBeInTheDocument();
    expect(screen.getByText("Kapak")).toBeInTheDocument();
  });
});
