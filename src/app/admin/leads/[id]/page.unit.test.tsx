import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/infrastructure/auth/require-staff-principal.server", () => ({
  requireStaffPrincipal: vi.fn().mockResolvedValue({ role: "ADMIN" }),
}));
vi.mock("@/infrastructure/leads/postgres-lead-crm.server", () => ({
  PostgresLeadCrmReadRepository: class {
    get = vi.fn().mockResolvedValue({
      id: "10000000-0000-4000-8000-000000000001",
      version: 1n,
      status: "NEW",
      name: "Lead",
      email: null,
      phone: null,
      property_title: null,
      advisor_name: null,
      assigned_advisor_id: null,
      appointments: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          status: "CONFIRMED",
          starts_at: new Date("2099-01-01T10:00:00Z"),
          ends_at: new Date("2099-01-01T11:00:00Z"),
          scheduled_timezone: "Europe/Istanbul",
          advisor_name: "Advisor",
          property_title: "Property",
        },
        {
          id: "30000000-0000-4000-8000-000000000001",
          status: "COMPLETED",
          starts_at: new Date("2020-01-01T10:00:00Z"),
          ends_at: new Date("2020-01-01T11:00:00Z"),
          scheduled_timezone: "Europe/Istanbul",
          advisor_name: "Advisor",
          property_title: "Property",
        },
      ],
      timeline: [
        {
          source: "lead",
          eventType: "NOTE_ADDED",
          summary: "Safe note",
          occurredAt: new Date(),
          appointmentId: null,
        },
        {
          source: "appointment",
          eventType: "CONFIRMED",
          summary: null,
          occurredAt: new Date(),
          appointmentId: "20000000-0000-4000-8000-000000000001",
        },
      ],
    });
    advisors = vi.fn().mockResolvedValue([]);
  },
}));
vi.mock("@/features/leads/lead-actions.server", () => ({
  leadAssignmentAction: vi.fn(),
  leadNoteAction: vi.fn(),
  leadStatusAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import LeadDetail from "./page";

describe("lead detail appointment sections", () => {
  it("renders upcoming, past, and privacy-safe combined timeline entries", async () => {
    render(
      await LeadDetail({
        params: Promise.resolve({ id: "10000000-0000-4000-8000-000000000001" }),
      }),
    );
    expect(screen.getByText("Yaklaşan randevular")).toBeInTheDocument();
    expect(screen.getByText("Son / geçmiş randevular")).toBeInTheDocument();
    expect(screen.getByText("RANDEVU · CONFIRMED")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Randevuyu aç" })).toHaveAttribute(
      "href",
      "/admin/appointments/20000000-0000-4000-8000-000000000001",
    );
    expect(screen.getByText("Safe note")).toBeInTheDocument();
  });
});
