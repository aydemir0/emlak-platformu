type LeadOutboxMessage = Readonly<{
  eventName: "lead.notification_requested" | "lead.analytics_requested";
  payload: Record<string, unknown>;
  correlationId: string;
  idempotencyKey: string;
}>;
export type LeadOutboxConsumers = Readonly<{
  notification: (message: LeadOutboxMessage) => Promise<void>;
  analytics: (message: LeadOutboxMessage) => Promise<void>;
}>;
const forbidden = /(email|phone|name|message|address|raw.*lead|contact)/i;
function assertPayload(payload: Record<string, unknown>) {
  for (const key of Object.keys(payload)) {
    if (forbidden.test(key)) throw new Error("LEAD_OUTBOX_PII");
  }
  for (const value of Object.values(payload)) {
    if (typeof value === "string" && /@|\+\d{6,}/.test(value))
      throw new Error("LEAD_OUTBOX_PII");
  }
}
export async function dispatchLeadOutboxMessage(
  message: LeadOutboxMessage,
  consumers: LeadOutboxConsumers,
) {
  assertPayload(message.payload);
  if (message.eventName === "lead.notification_requested")
    return consumers.notification(message);
  return consumers.analytics(message);
}
