import { ApplicationError } from "@/application/errors/application-error";
import {
  authorizePropertyCommand,
  type PropertyCommand,
} from "@/application/properties/authorize-property-command";
import type { PropertyCommandContext } from "@/application/properties/property-contracts";
import type {
  PropertyTransaction,
  PropertyUnitOfWork,
} from "@/application/properties/property-ports";
import type { PropertyRecord } from "@/domain/properties/property";

export async function loadAuthorizedProperty(
  tx: PropertyTransaction,
  context: PropertyCommandContext,
  propertyId: string,
  command: PropertyCommand,
  lock = false,
): Promise<PropertyRecord> {
  const facts = await tx.loadAuthorizationFacts(context);
  const property = await tx.getProperty(propertyId, { lock });
  if (!property) {
    throw new ApplicationError("PROPERTY_NOT_FOUND", "PROPERTY_NOT_FOUND");
  }
  if (property.deletedAt && command !== "restore" && command !== "delete") {
    throw new ApplicationError("PROPERTY_NOT_FOUND", "PROPERTY_NOT_FOUND");
  }
  const assigned =
    facts.role === "ADVISOR" && facts.advisorId
      ? await tx.isAdvisorAssigned(propertyId, facts.advisorId)
      : false;
  authorizePropertyCommand(facts, command, { assigned });
  return property;
}

export function assertExpectedVersion(
  property: PropertyRecord,
  expected: bigint,
): void {
  if (property.version !== expected) {
    throw new ApplicationError("PROPERTY_CONFLICT", "PROPERTY_CONFLICT");
  }
}

export function assertUpdated(updated: boolean): void {
  if (!updated) {
    throw new ApplicationError("PROPERTY_CONFLICT", "PROPERTY_CONFLICT");
  }
}

export async function writeAuditAndOutbox(
  tx: PropertyTransaction,
  context: PropertyCommandContext,
  propertyId: string,
  action: string,
  version: bigint,
): Promise<void> {
  await tx.insertAuditLog({
    actorUserIdentityId: context.actor.identityId,
    action,
    targetTable: "properties",
    targetId: propertyId,
    outcome: "SUCCEEDED",
    correlationId: context.correlationId,
    requestId: context.requestId,
  });
  await tx.insertOutboxMessage({
    eventType: action,
    eventVersion: 1,
    domainName: "properties",
    aggregateType: "property",
    aggregateId: propertyId,
    aggregateVersion: version,
    correlationId: context.correlationId,
    idempotencyKey: `${context.idempotencyKey}:outbox`,
    payload: { propertyId, version: version.toString() },
  });
}

export async function executeAuditedPropertyCommand<T>(
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  propertyId: string,
  action: string,
  work: (tx: PropertyTransaction) => Promise<T>,
): Promise<T> {
  try {
    return await uow.transaction(work);
  } catch (error) {
    if (
      error instanceof ApplicationError &&
      error.code === "PROPERTY_FORBIDDEN"
    ) {
      await uow.recordDeniedCommand(context, propertyId, action, error.code);
    }
    throw error;
  }
}
