export type LeadOutboxMessage = Readonly<{
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

export class LeadOutboxPiiError extends Error {
  constructor() {
    super("LEAD_OUTBOX_PII");
    this.name = "LeadOutboxPiiError";
  }
}

function assertPayloadValue(value: unknown, key?: string): void {
  if (key && forbidden.test(key)) throw new LeadOutboxPiiError();
  if (typeof value === "string" && /@|\+\d{6,}/.test(value))
    throw new LeadOutboxPiiError();
  if (Array.isArray(value)) {
    value.forEach((item) => assertPayloadValue(item));
    return;
  }
  if (value && typeof value === "object") {
    for (const [nestedKey, nestedValue] of Object.entries(value))
      assertPayloadValue(nestedValue, nestedKey);
  }
}
function assertPayload(payload: Record<string, unknown>) {
  for (const [key, value] of Object.entries(payload)) {
    if (forbidden.test(key)) throw new LeadOutboxPiiError();
    assertPayloadValue(value, key);
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
