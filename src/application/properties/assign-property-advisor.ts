import { ApplicationError } from "@/application/errors/application-error";
import {
  executeAuditedPropertyCommand,
  loadAuthorizedProperty,
  writeAuditAndOutbox,
} from "@/application/properties/property-command-helpers";
import type { PropertyCommandContext } from "@/application/properties/property-contracts";
import type { PropertyUnitOfWork } from "@/application/properties/property-ports";

export async function assignAdvisor(
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: Readonly<{
    propertyId: string;
    advisorId: string;
    assignmentRole: string;
    isPrimary: boolean;
    reason: string | null;
  }>,
): Promise<void> {
  if (!input.assignmentRole.trim()) {
    throw new ApplicationError(
      "PROPERTY_VALIDATION_FAILED",
      "assignment role is required",
    );
  }
  await executeAuditedPropertyCommand(
    uow,
    context,
    input.propertyId,
    "property.advisor_assign",
    async (tx) => {
      const property = await loadAuthorizedProperty(
        tx,
        context,
        input.propertyId,
        "assign",
        true,
      );
      if (!(await tx.referencesExist({ advisorId: input.advisorId }))) {
        throw new ApplicationError(
          "PROPERTY_REFERENCE_DATA_MISSING",
          "PROPERTY_REFERENCE_DATA_MISSING",
        );
      }
      await tx.insertAdvisorAssignment({
        ...input,
        assignedByUserIdentityId: context.actor.identityId,
      });
      await writeAuditAndOutbox(
        tx,
        context,
        input.propertyId,
        "property.advisor_assigned",
        property.version,
      );
    },
  );
}
