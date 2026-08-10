import { randomUUID } from "node:crypto";

import { ApplicationError } from "@/application/errors/application-error";

export type PublicLeadContact = Readonly<{
  channel: "EMAIL" | "PHONE";
  rawValue: string;
  normalizedValue: string | null;
  normalizationAlgorithm: string;
  normalizationVersion: string;
}>;

export type CreatePublicLeadInput = Readonly<{
  propertyId: string;
  email?: string;
  phone?: string;
  name?: string;
  message?: string;
  consentAccepted: boolean;
  idempotencyKey: string;
  idempotencyFingerprint: string;
  correlationId: string;
  requestId: string;
  abuseNetworkSignal: string;
}>;

export interface PublicLeadTransaction {
  findPublicEligibleProperty(
    publicId: string,
    options: { lock: boolean },
  ): Promise<Readonly<{ id: string; publicId: string }> | null>;
  findByIdempotencyKey(
    idempotencyKey: string,
    options: { lock: boolean },
  ): Promise<Readonly<{ leadId: string; fingerprint: string | null }> | null>;
  acquireRateLimit(
    input: Readonly<{ abuseNetworkSignal: string; now: Date }>,
  ): Promise<boolean>;
  findDuplicateCandidateIds(
    propertyId: string,
    contacts: readonly PublicLeadContact[],
  ): Promise<readonly string[]>;
  insertLead(
    values: Record<string, unknown>,
  ): Promise<Readonly<{ id: string }>>;
  insertContactIntake(values: Record<string, unknown>): Promise<void>;
  insertLeadActivity(values: Record<string, unknown>): Promise<void>;
  insertAuditLog(values: Record<string, unknown>): Promise<void>;
  insertOutboxMessage(values: Record<string, unknown>): Promise<void>;
}

export interface PublicLeadUnitOfWork {
  transaction<T>(work: (tx: PublicLeadTransaction) => Promise<T>): Promise<T>;
}

function optionalText(
  value: string | undefined,
  maximum: number,
): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maximum) {
    throw new ApplicationError(
      "LEAD_VALIDATION_FAILED",
      "LEAD_VALIDATION_FAILED",
    );
  }
  return trimmed;
}

function normalizeEmail(raw: string): string {
  const normalized = raw.toLocaleLowerCase("en-US");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ApplicationError(
      "LEAD_VALIDATION_FAILED",
      "LEAD_VALIDATION_FAILED",
    );
  }
  return normalized;
}

function normalizePhone(raw: string): string | null {
  // No region is inferred: only an explicitly international number is normalized.
  if (!/^\+[0-9 .()-]{6,31}$/.test(raw)) {
    throw new ApplicationError(
      "LEAD_VALIDATION_FAILED",
      "LEAD_VALIDATION_FAILED",
    );
  }
  const normalized = `+${raw.slice(1).replaceAll(/[^0-9]/g, "")}`;
  return normalized.length >= 8 && normalized.length <= 16 ? normalized : null;
}

function normalizeContacts(
  input: CreatePublicLeadInput,
): readonly PublicLeadContact[] {
  const email = optionalText(input.email, 320);
  const phone = optionalText(input.phone, 64);
  if (email === null && phone === null) {
    throw new ApplicationError(
      "LEAD_VALIDATION_FAILED",
      "LEAD_VALIDATION_FAILED",
    );
  }
  return [
    ...(email === null
      ? []
      : [
          {
            channel: "EMAIL" as const,
            rawValue: email,
            normalizedValue: normalizeEmail(email),
            normalizationAlgorithm: "email-basic",
            normalizationVersion: "v1",
          },
        ]),
    ...(phone === null
      ? []
      : [
          {
            channel: "PHONE" as const,
            rawValue: phone,
            normalizedValue: normalizePhone(phone),
            normalizationAlgorithm: "phone-e164-strict",
            normalizationVersion: "v1",
          },
        ]),
  ];
}

function assertInput(input: CreatePublicLeadInput): void {
  if (
    !input.propertyId.trim() ||
    !input.idempotencyKey.trim() ||
    !input.consentAccepted
  ) {
    throw new ApplicationError(
      "LEAD_VALIDATION_FAILED",
      "LEAD_VALIDATION_FAILED",
    );
  }
  if (
    !/^[0-9a-f]{64}$/.test(input.idempotencyFingerprint) ||
    !/^[0-9a-f]{64}$/.test(input.abuseNetworkSignal)
  ) {
    throw new ApplicationError(
      "LEAD_VALIDATION_FAILED",
      "LEAD_VALIDATION_FAILED",
    );
  }
}

export async function createPublicLead(
  uow: PublicLeadUnitOfWork,
  input: CreatePublicLeadInput,
): Promise<Readonly<{ kind: "ACCEPTED" }>> {
  assertInput(input);
  const contacts = normalizeContacts(input);
  const name = optionalText(input.name, 160);
  const message = optionalText(input.message, 4_000);
  const email =
    contacts.find((contact) => contact.channel === "EMAIL")?.rawValue ?? null;
  const phone =
    contacts.find((contact) => contact.channel === "PHONE")?.rawValue ?? null;
  const now = new Date();

  return uow.transaction(async (tx) => {
    const property = await tx.findPublicEligibleProperty(input.propertyId, {
      lock: true,
    });
    if (!property)
      throw new ApplicationError("LEAD_NOT_FOUND", "LEAD_NOT_FOUND");
    const existing = await tx.findByIdempotencyKey(input.idempotencyKey, {
      lock: true,
    });
    if (existing) {
      if (existing.fingerprint === input.idempotencyFingerprint)
        return { kind: "ACCEPTED" };
      throw new ApplicationError("LEAD_CONFLICT", "LEAD_CONFLICT");
    }
    if (
      !(await tx.acquireRateLimit({
        abuseNetworkSignal: input.abuseNetworkSignal,
        now,
      }))
    ) {
      throw new ApplicationError("LEAD_FORBIDDEN", "LEAD_FORBIDDEN");
    }
    const duplicateCandidateIds = await tx.findDuplicateCandidateIds(
      property.id,
      contacts,
    );
    const lead = await tx.insertLead({
      id: randomUUID(),
      submissionId: randomUUID(),
      propertyId: property.id,
      assignedAdvisorId: null,
      status: "NEW",
      source: "property_detail",
      name,
      email,
      phone,
      message,
      consentKind: "CONTACT",
      consentedAt: now,
      idempotencyKey: input.idempotencyKey,
      idempotencyFingerprint: input.idempotencyFingerprint,
      abuseNetworkSignal: input.abuseNetworkSignal,
    });
    for (const contact of contacts)
      await tx.insertContactIntake({
        leadId: lead.id,
        ...contact,
        source: "PUBLIC_FORM",
      });
    await tx.insertLeadActivity({
      leadId: lead.id,
      activityType: "CREATED",
      occurredAt: now,
      correlationId: input.correlationId,
      sourceIdempotencyKey: `${input.idempotencyKey}:created`,
      details: { source: "property_detail" },
    });
    if (duplicateCandidateIds.length)
      await tx.insertLeadActivity({
        leadId: lead.id,
        activityType: "DUPLICATE_CANDIDATE_DETECTED",
        occurredAt: now,
        correlationId: input.correlationId,
        sourceIdempotencyKey: `${input.idempotencyKey}:duplicate-candidate`,
        details: { candidateLeadIds: duplicateCandidateIds },
      });
    await tx.insertAuditLog({
      action: "lead.public_intake_accepted",
      targetType: "lead",
      targetId: lead.id,
      outcome: "succeeded",
      correlationId: input.correlationId,
      requestId: input.requestId,
      changeSummary: {
        source: "property_detail",
        contactChannels: contacts.map((contact) => contact.channel),
      },
    });
    for (const eventName of [
      "lead.notification_requested",
      "lead.analytics_requested",
    ] as const) {
      await tx.insertOutboxMessage({
        eventName,
        owningDomain: "leads",
        aggregateType: "lead",
        eventVersion: 1,
        aggregateId: lead.id,
        correlationId: input.correlationId,
        idempotencyKey: `${input.idempotencyKey}:${eventName}`,
        payload: {
          source: "property_detail",
          duplicateCandidateDetected: duplicateCandidateIds.length > 0,
        },
      });
    }
    return { kind: "ACCEPTED" };
  });
}
