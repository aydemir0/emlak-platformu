import { randomUUID } from "node:crypto";

import { ApplicationError } from "@/application/errors/application-error";
import { authorizePropertyCommand } from "@/application/properties/authorize-property-command";
import type {
  CreatePropertyDraftInput,
  PropertyCommandContext,
} from "@/application/properties/property-contracts";
import type { PropertyRecord } from "@/domain/properties/property";
import type { PropertyUnitOfWork } from "@/application/properties/property-ports";
import { validatePropertyDetails } from "@/domain/properties/property-validation";
import { writeAuditAndOutbox } from "@/application/properties/property-command-helpers";

export async function createPropertyDraft(
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: CreatePropertyDraftInput,
): Promise<PropertyRecord> {
  const errors = validatePropertyDetails(input);
  if (!input.title.trim() || errors.length) {
    throw new ApplicationError(
      "PROPERTY_VALIDATION_FAILED",
      errors.join("; ") || "title is required",
    );
  }
  return uow.transaction(async (tx) => {
    const facts = await tx.loadAuthorizationFacts(context);
    authorizePropertyCommand(facts, "create", {
      assigned: facts.role === "ADMIN",
    });
    if (!(await tx.referencesExist(input))) {
      throw new ApplicationError(
        "PROPERTY_REFERENCE_DATA_MISSING",
        "PROPERTY_REFERENCE_DATA_MISSING",
      );
    }
    const id = randomUUID();
    const property = await tx.insertProperty({
      ...input,
      id,
      publicId: id,
      currentState: "DRAFT",
      version: 1n,
    });
    await writeAuditAndOutbox(
      tx,
      context,
      property.id,
      "property.draft_created",
      1n,
    );
    return property;
  });
}
