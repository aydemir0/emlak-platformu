import type { StaffPrincipal } from "@/application/auth/staff-principal";
import { ApplicationError } from "@/application/errors/application-error";
import {
  conversionEligibility,
  mapLeadToInitialRequest,
  normalizeConversionEmail,
  normalizeConversionPhone,
  resolveCustomerIdentity,
  LeadConversionPolicyError,
  type ContactIdentity,
  type IdentityResolution,
} from "@/domain/leads/lead-conversion-policy";
import type { LeadState } from "@/domain/leads/lead-lifecycle";

export type LeadConversionCommandContext = Readonly<{
  actor: StaffPrincipal;
  correlationId: string;
  requestId: string;
  idempotencyKey: string;
}>;

export type LeadForConversion = Readonly<{
  id: string;
  status: LeadState;
  assignedAdvisorId: string | null;
  deletedAt: Date | null;
  name: string | null;
  email: string | null;
  phone: string | null;
}>;

export type PersistedLeadConversion = Readonly<{
  leadId: string;
  customerId: string;
  customerRequestId: string | null;
  outcome: string;
  resolutionKind: ResolutionKind | null;
  convertedAt: Date;
}>;

export type ResolutionKind =
  "CREATED_NEW_CUSTOMER" | "LINKED_EXPLICIT_CUSTOMER" | "LINKED_EXACT_IDENTITY";
export type ResolutionEvidenceCode =
  | "EXPLICIT_CUSTOMER_SELECTION"
  | "EXACT_EMAIL"
  | "EXACT_PHONE"
  | "EXACT_EMAIL_AND_PHONE";

export type LeadConversionResult = Readonly<{
  leadId: string;
  customerId: string;
  customerRequestId: string | null;
  outcome: string;
  createdCustomer: boolean;
  resolutionKind: ResolutionKind | null;
  convertedAt: Date;
}>;

export interface LeadConversionTransaction {
  lockLead(id: string): Promise<LeadForConversion | null>;
  findExistingConversion(
    leadId: string,
  ): Promise<PersistedLeadConversion | null>;
  currentAdvisorId(identityId: string): Promise<string | null>;
  canManageCustomer(
    customerId: string,
    actor: StaffPrincipal,
    advisorId: string | null,
  ): Promise<boolean>;
  findTrustedIdentityCandidates(
    identities: readonly ContactIdentity[],
  ): Promise<
    readonly Readonly<{ identity: ContactIdentity; customerId: string }>[]
  >;
  createCustomer(
    values: Readonly<{
      displayName: string;
      assignedAdvisorId: string | null;
    }>,
  ): Promise<Readonly<{ id: string }>>;
  createCustomerContactPoints(
    customerId: string,
    contacts: readonly Readonly<{
      channel: ContactIdentity["channel"];
      displayValue: string;
      normalizedValue: string;
    }>[],
  ): Promise<void>;
  createInitialRequest(customerId: string): Promise<Readonly<{ id: string }>>;
  insertConversion(
    values: Readonly<{
      leadId: string;
      customerId: string;
      customerRequestId: string | null;
      actorUserIdentityId: string;
      outcome: "WON";
      resolutionKind: ResolutionKind;
      resolutionEvidenceCode: ResolutionEvidenceCode;
      idempotencyKey: string;
      correlationId: string;
    }>,
  ): Promise<PersistedLeadConversion>;
  transitionLeadToWon(leadId: string): Promise<boolean>;
  insertActivity(
    values: Readonly<{
      leadId: string;
      correlationId: string;
      sourceIdempotencyKey: string;
      details: Readonly<{
        createdCustomer: boolean;
        initialRequestCreated: boolean;
        resolutionKind: ResolutionKind;
      }>;
    }>,
  ): Promise<void>;
  insertAudit(
    values: Readonly<{
      actorUserIdentityId: string;
      leadId: string;
      correlationId: string;
      requestId: string;
      changeSummary: Readonly<{
        createdCustomer: boolean;
        initialRequestCreated: boolean;
        resolutionKind: ResolutionKind;
      }>;
    }>,
  ): Promise<void>;
}

export interface LeadConversionUnitOfWork {
  transaction<T>(
    work: (tx: LeadConversionTransaction) => Promise<T>,
  ): Promise<T>;
  recordAuthorizationDenial(
    values: Readonly<{
      actorUserIdentityId: string;
      action: "lead.conversion_denied";
      targetId: string;
      reasonCode: "LEAD_FORBIDDEN" | "CUSTOMER_LINK_NOT_AUTHORIZED";
      correlationId: string;
      requestId: string;
    }>,
  ): Promise<void>;
}

export type ConvertLeadToCustomerInput = Readonly<{
  leadId: string;
  explicitCustomerId?: string;
  createInitialRequest: boolean;
}>;

function identitiesFromLead(
  lead: LeadForConversion,
): readonly ContactIdentity[] {
  try {
    return [
      ...(lead.email
        ? [
            {
              channel: "EMAIL" as const,
              normalizedValue: normalizeConversionEmail(lead.email),
            },
          ]
        : []),
      ...(lead.phone
        ? [
            {
              channel: "PHONE" as const,
              normalizedValue: normalizeConversionPhone(lead.phone),
            },
          ]
        : []),
    ];
  } catch (error) {
    if (error instanceof LeadConversionPolicyError) {
      throw new ApplicationError(
        "LEAD_CONVERSION_FAILED",
        "LEAD_CONVERSION_FAILED",
      );
    }
    throw error;
  }
}

function evidenceFor(
  resolutionKind: ResolutionKind,
  identities: readonly ContactIdentity[],
): ResolutionEvidenceCode {
  if (resolutionKind === "LINKED_EXPLICIT_CUSTOMER") {
    return "EXPLICIT_CUSTOMER_SELECTION";
  }
  const hasEmail = identities.some((identity) => identity.channel === "EMAIL");
  const hasPhone = identities.some((identity) => identity.channel === "PHONE");
  if (hasEmail && hasPhone) return "EXACT_EMAIL_AND_PHONE";
  return hasEmail ? "EXACT_EMAIL" : "EXACT_PHONE";
}

function safeResult(conversion: PersistedLeadConversion): LeadConversionResult {
  return {
    leadId: conversion.leadId,
    customerId: conversion.customerId,
    customerRequestId: conversion.customerRequestId,
    outcome: conversion.outcome,
    createdCustomer: conversion.resolutionKind === "CREATED_NEW_CUSTOMER",
    resolutionKind: conversion.resolutionKind,
    convertedAt: conversion.convertedAt,
  };
}

async function authorizeLead(
  tx: LeadConversionTransaction,
  context: LeadConversionCommandContext,
  leadId: string,
): Promise<{ lead: LeadForConversion; advisorId: string | null }> {
  const lead = await tx.lockLead(leadId);
  if (!lead || lead.deletedAt) {
    throw new ApplicationError("LEAD_NOT_FOUND", "LEAD_NOT_FOUND");
  }
  const advisorId =
    context.actor.role === "ADVISOR"
      ? await tx.currentAdvisorId(context.actor.identityId)
      : null;
  if (
    context.actor.role === "ADVISOR" &&
    (!advisorId || lead.assignedAdvisorId !== advisorId)
  ) {
    throw new ApplicationError("LEAD_FORBIDDEN", "LEAD_FORBIDDEN");
  }
  return { lead, advisorId };
}

function assertNewConversion(lead: LeadForConversion): void {
  const eligibility = conversionEligibility({
    leadStatus: lead.status,
    hasConversion: false,
  });
  if (eligibility.kind === "INTEGRITY_CONFLICT") {
    throw new ApplicationError(
      "LEAD_CONVERSION_INTEGRITY_CONFLICT",
      "LEAD_CONVERSION_INTEGRITY_CONFLICT",
    );
  }
  if (eligibility.kind !== "NEW_CONVERSION_REQUIRED") {
    throw new ApplicationError(
      "LEAD_CONVERSION_NOT_ALLOWED",
      "LEAD_CONVERSION_NOT_ALLOWED",
    );
  }
}

function displayNameForNewCustomer(lead: LeadForConversion): string {
  const name = lead.name?.trim();
  if (name) return name;
  // `display_name` is mandatory. A supplied contact value is a real structured
  // lead value, unlike a fabricated name, and is retained in the CRM boundary.
  return lead.email?.trim() || lead.phone?.trim() || "";
}

async function recordDenial(
  uow: LeadConversionUnitOfWork,
  context: LeadConversionCommandContext,
  leadId: string,
  error: unknown,
): Promise<void> {
  if (
    error instanceof ApplicationError &&
    (error.code === "LEAD_FORBIDDEN" ||
      error.code === "CUSTOMER_LINK_NOT_AUTHORIZED")
  ) {
    await uow.recordAuthorizationDenial({
      actorUserIdentityId: context.actor.identityId,
      action: "lead.conversion_denied",
      targetId: leadId,
      reasonCode:
        error.code === "LEAD_FORBIDDEN"
          ? "LEAD_FORBIDDEN"
          : "CUSTOMER_LINK_NOT_AUTHORIZED",
      correlationId: context.correlationId,
      requestId: context.requestId,
    });
  }
}

export async function convertLeadToCustomer(
  uow: LeadConversionUnitOfWork,
  context: LeadConversionCommandContext,
  input: ConvertLeadToCustomerInput,
): Promise<LeadConversionResult> {
  try {
    return await uow.transaction(async (tx) => {
      const { lead, advisorId } = await authorizeLead(
        tx,
        context,
        input.leadId,
      );
      const existing = await tx.findExistingConversion(lead.id);
      if (existing) {
        if (
          input.explicitCustomerId &&
          input.explicitCustomerId !== existing.customerId
        ) {
          throw new ApplicationError(
            "LEAD_CONVERSION_NOT_ALLOWED",
            "LEAD_CONVERSION_NOT_ALLOWED",
          );
        }
        return safeResult(existing);
      }
      assertNewConversion(lead);

      const identities = identitiesFromLead(lead);
      const trustedCandidates = input.explicitCustomerId
        ? []
        : await tx.findTrustedIdentityCandidates(identities);
      const resolution: IdentityResolution = input.explicitCustomerId
        ? resolveCustomerIdentity({
            explicitCustomerId: input.explicitCustomerId,
            candidates: [],
          })
        : resolveCustomerIdentity({
            candidates: trustedCandidates,
          });
      if (resolution.kind === "IDENTITY_CONFLICT") {
        throw new ApplicationError(
          "CUSTOMER_IDENTITY_CONFLICT",
          "CUSTOMER_IDENTITY_CONFLICT",
        );
      }

      const resolutionKind: ResolutionKind =
        resolution.kind === "CREATE_NEW_CUSTOMER"
          ? "CREATED_NEW_CUSTOMER"
          : input.explicitCustomerId
            ? "LINKED_EXPLICIT_CUSTOMER"
            : "LINKED_EXACT_IDENTITY";
      const customer =
        resolution.kind === "CREATE_NEW_CUSTOMER"
          ? await tx.createCustomer({
              displayName: displayNameForNewCustomer(lead),
              assignedAdvisorId:
                context.actor.role === "ADVISOR" ? advisorId : null,
            })
          : { id: resolution.customerId };

      if (
        resolution.kind !== "CREATE_NEW_CUSTOMER" &&
        !(await tx.canManageCustomer(customer.id, context.actor, advisorId))
      ) {
        throw new ApplicationError(
          "CUSTOMER_LINK_NOT_AUTHORIZED",
          "CUSTOMER_LINK_NOT_AUTHORIZED",
        );
      }
      if (resolution.kind === "CREATE_NEW_CUSTOMER") {
        await tx.createCustomerContactPoints(
          customer.id,
          identities.map((identity) => ({
            channel: identity.channel,
            displayValue:
              identity.channel === "EMAIL"
                ? lead.email!.trim()
                : lead.phone!.trim(),
            normalizedValue: identity.normalizedValue,
          })),
        );
      }

      const proposedRequest = mapLeadToInitialRequest();
      const request = input.createInitialRequest
        ? await tx.createInitialRequest(customer.id)
        : null;
      // Keep the mapper in the command path: it is the authoritative explicit
      // assertion that every initial Matching V2 criterion is MISSING today.
      void proposedRequest;
      const details = {
        createdCustomer: resolutionKind === "CREATED_NEW_CUSTOMER",
        initialRequestCreated: request !== null,
        resolutionKind,
      } as const;
      const conversion = await tx.insertConversion({
        leadId: lead.id,
        customerId: customer.id,
        customerRequestId: request?.id ?? null,
        actorUserIdentityId: context.actor.identityId,
        outcome: "WON",
        resolutionKind,
        resolutionEvidenceCode: evidenceFor(
          resolutionKind,
          resolutionKind === "LINKED_EXACT_IDENTITY"
            ? trustedCandidates.map((candidate) => candidate.identity)
            : identities,
        ),
        idempotencyKey: context.idempotencyKey,
        correlationId: context.correlationId,
      });
      if (!(await tx.transitionLeadToWon(lead.id))) {
        throw new ApplicationError(
          "LEAD_CONVERSION_FAILED",
          "LEAD_CONVERSION_FAILED",
        );
      }
      await tx.insertActivity({
        leadId: lead.id,
        correlationId: context.correlationId,
        sourceIdempotencyKey: `${context.idempotencyKey}:conversion`,
        details,
      });
      await tx.insertAudit({
        actorUserIdentityId: context.actor.identityId,
        leadId: lead.id,
        correlationId: context.correlationId,
        requestId: context.requestId,
        changeSummary: details,
      });
      return safeResult(conversion);
    });
  } catch (error) {
    await recordDenial(uow, context, input.leadId, error);
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError(
      "LEAD_CONVERSION_FAILED",
      "LEAD_CONVERSION_FAILED",
      { cause: error },
    );
  }
}
