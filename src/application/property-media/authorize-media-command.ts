import { ApplicationError } from "@/application/errors/application-error";
import { authorizePropertyCommand } from "@/application/properties/authorize-property-command";
import type { MediaCommandContext } from "@/application/property-media/media-contracts";
import type { MediaTransaction } from "@/application/property-media/media-ports";

export type MediaCommand = "manage" | "delete" | "restore";

export async function authorizeMediaCommand(
  tx: MediaTransaction,
  context: MediaCommandContext,
  propertyId: string,
  command: MediaCommand,
  lockProperty = false,
): Promise<void> {
  const facts = await tx.loadAuthorizationFacts(context);
  const assigned =
    facts.advisorId !== null &&
    (await tx.isAdvisorAssigned(propertyId, facts.advisorId));
  try {
    authorizePropertyCommand(facts, command === "manage" ? "update" : command, {
      assigned,
    });
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw new ApplicationError("MEDIA_FORBIDDEN", "MEDIA_FORBIDDEN");
    }
    throw error;
  }
  if (!(await tx.propertyIsCommandable(propertyId, { lock: lockProperty }))) {
    throw new ApplicationError("MEDIA_NOT_FOUND", "MEDIA_NOT_FOUND");
  }
}
