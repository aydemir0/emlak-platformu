import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  lead: {
    id: "10000000-0000-4000-8000-000000000001",
    version: 1n,
    status: "NEW",
    name: "Lead",
    email: null,
    phone: null,
    property_title: null,
    advisor_name: null,
    assigned_advisor_id: null,
    conversion_customer_id: null as string | null,
    conversion_customer_request_id: null as string | null,
    conversion_outcome: null as string | null,
    conversion_resolution_kind: null as string | null,
    conversion_converted_at: null as Date | null,
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
  },
}));

vi.mock("@/infrastructure/auth/require-staff-principal.server", () => ({
  requireStaffPrincipal: vi.fn().mockResolvedValue({ role: "ADMIN" }),
}));
vi.mock("@/infrastructure/leads/postgres-lead-crm.server", () => ({
  PostgresLeadCrmReadRepository: class {
    get = vi.fn().mockImplementation(async () => fixture.lead);
    advisors = vi.fn().mockResolvedValue([]);
  },
}));
vi.mock("@/features/leads/lead-actions.server", () => ({
  leadAssignmentAction: vi.fn(),
  leadNoteAction: vi.fn(),
  leadStatusAction: vi.fn(),
}));
vi.mock("@/features/leads/components/lead-conversion-form", () => ({
  LeadConversionForm: () => <div>Conversion form</div>,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import LeadDetail from "./page";

describe("lead detail appointment sections", () => {
  afterEach(() => {
    cleanup();
    fixture.lead.status = "NEW";
    fixture.lead.conversion_customer_id = null;
    fixture.lead.conversion_customer_request_id = null;
    fixture.lead.conversion_outcome = null;
    fixture.lead.conversion_resolution_kind = null;
    fixture.lead.conversion_converted_at = null;
  });

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

  it("shows the conversion form only for an eligible, unconverted lead", async () => {
    fixture.lead.status = "QUALIFIED";
    fixture.lead.conversion_customer_id = null;
    render(
      await LeadDetail({
        params: Promise.resolve({ id: fixture.lead.id }),
      }),
    );
    expect(screen.getByText("Conversion form")).toBeInTheDocument();
  });

  it("shows a distinct unavailable state for a denied lifecycle", async () => {
    fixture.lead.status = "NEW";
    render(
      await LeadDetail({
        params: Promise.resolve({ id: fixture.lead.id }),
      }),
    );
    expect(
      screen.getByText(
        "Bu lead mevcut yaşam döngüsü durumunda müşteriye dönüştürülemez.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Conversion form")).not.toBeInTheDocument();
  });

  it("does not offer WON through the ordinary status form", async () => {
    fixture.lead.status = "NEGOTIATION";
    render(
      await LeadDetail({
        params: Promise.resolve({ id: fixture.lead.id }),
      }),
    );
    expect(
      screen.queryByRole("option", { name: "WON" }),
    ).not.toBeInTheDocument();
  });

  it("shows an immutable conversion outcome instead of another action", async () => {
    fixture.lead.status = "WON";
    fixture.lead.conversion_customer_id =
      "40000000-0000-4000-8000-000000000001";
    fixture.lead.conversion_customer_request_id =
      "50000000-0000-4000-8000-000000000001";
    fixture.lead.conversion_outcome = "SUCCEEDED";
    fixture.lead.conversion_resolution_kind = "CREATED_NEW_CUSTOMER";
    fixture.lead.conversion_converted_at = new Date("2026-08-12T12:00:00Z");
    render(
      await LeadDetail({
        params: Promise.resolve({ id: fixture.lead.id }),
      }),
    );
    expect(
      screen.getByText("Dönüşüm kaydı değiştirilemez."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Conversion form")).not.toBeInTheDocument();
  });

  it("flags WON leads without persisted conversion provenance", async () => {
    fixture.lead.status = "WON";
    fixture.lead.conversion_customer_id = null;
    render(
      await LeadDetail({
        params: Promise.resolve({ id: fixture.lead.id }),
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Dönüşüm tutarsızlığı");
  });
});
