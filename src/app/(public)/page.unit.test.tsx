import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PublicHomePage from "@/app/(public)/page";

describe("public home foundation", () => {
  it("renders a server-safe architecture smoke page without fake listings", () => {
    render(<PublicHomePage />);
    expect(
      screen.getByRole("heading", { name: "Emlak Platformu" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/₺|satılık daire/i)).not.toBeInTheDocument();
  });
});
