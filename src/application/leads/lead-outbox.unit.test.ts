import { describe, expect, it } from "vitest";
import { dispatchLeadOutboxMessage } from "@/application/leads/lead-outbox";
describe("lead outbox boundary", () => {
  it("allows only PII-minimized notification and analytics contracts", async () => {
    const delivered: string[] = [];
    await dispatchLeadOutboxMessage(
      {
        eventName: "lead.analytics_requested",
        payload: {
          source: "property_detail",
          duplicateCandidateDetected: false,
        },
        correlationId: "10000000-0000-4000-8000-000000000001",
        idempotencyKey: "key",
      },
      {
        notification: async () => {},
        analytics: async (e) => {
          delivered.push(e.eventName);
        },
      },
    );
    expect(delivered).toEqual(["lead.analytics_requested"]);
  });
  it("surfaces provider failure after commit for retry without changing authoritative state", async () => {
    await expect(
      dispatchLeadOutboxMessage(
        {
          eventName: "lead.notification_requested",
          payload: {
            source: "property_detail",
            duplicateCandidateDetected: false,
          },
          correlationId: "10000000-0000-4000-8000-000000000001",
          idempotencyKey: "key",
        },
        {
          notification: async () => {
            throw new Error("down");
          },
          analytics: async () => {},
        },
      ),
    ).rejects.toThrow("down");
  });
  it("rejects PII payloads", async () => {
    await expect(
      dispatchLeadOutboxMessage(
        {
          eventName: "lead.analytics_requested",
          payload: { email: "x@example.test" },
          correlationId: "10000000-0000-4000-8000-000000000001",
          idempotencyKey: "key",
        },
        { notification: async () => {}, analytics: async () => {} },
      ),
    ).rejects.toThrow("LEAD_OUTBOX_PII");
  });
});
