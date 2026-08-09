import { ApplicationError } from "@/application/errors/application-error";

export type PropertyCommand =
  | "create"
  | "update"
  | "price"
  | "assign"
  | "transition"
  | "publish"
  | "unpublish"
  | "delete"
  | "restore";

export type PropertyAuthorizationFacts = Readonly<{
  active: boolean;
  role: "ADMIN" | "ADVISOR";
  aal: "aal1" | "aal2";
  permissions: ReadonlySet<string>;
  advisorId: string | null;
}>;

export function authorizePropertyCommand(
  actor: PropertyAuthorizationFacts,
  command: PropertyCommand,
  scope: Readonly<{ assigned: boolean }>,
): void {
  if (!actor.active) {
    throw new ApplicationError("PROPERTY_FORBIDDEN", "PROPERTY_FORBIDDEN");
  }
  if (actor.role === "ADMIN") {
    if (actor.aal !== "aal2") {
      throw new ApplicationError("MFA_REQUIRED", "MFA_REQUIRED");
    }
    return;
  }
  if (
    command === "delete" ||
    command === "restore" ||
    command === "assign" ||
    !scope.assigned
  ) {
    throw new ApplicationError("PROPERTY_FORBIDDEN", "PROPERTY_FORBIDDEN");
  }
  if (
    (command === "publish" || command === "unpublish") &&
    !actor.permissions.has("properties.publish")
  ) {
    throw new ApplicationError("PROPERTY_FORBIDDEN", "PROPERTY_FORBIDDEN");
  }
}
