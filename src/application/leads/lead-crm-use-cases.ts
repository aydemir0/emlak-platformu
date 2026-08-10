import { ApplicationError } from "@/application/errors/application-error";
import type { StaffPrincipal } from "@/application/auth/staff-principal";
import {
  assertLeadTransition,
  type LeadState,
} from "@/domain/leads/lead-lifecycle";

export type LeadCommandContext = Readonly<{
  actor: StaffPrincipal;
  correlationId: string;
  requestId: string;
  idempotencyKey: string;
}>;
export type LeadRecord = Readonly<{
  id: string;
  status: LeadState;
  version: bigint;
  assignedAdvisorId: string | null;
  deletedAt: Date | null;
}>;
export interface LeadCrmTransaction {
  getLead(id: string, options: { lock: boolean }): Promise<LeadRecord | null>;
  currentAdvisorId(identityId: string): Promise<string | null>;
  advisorExists(id: string): Promise<boolean>;
  updateStatus(
    id: string,
    expectedVersion: bigint,
    status: LeadState,
  ): Promise<boolean>;
  updateAssignment(
    id: string,
    expectedVersion: bigint,
    advisorId: string | null,
  ): Promise<boolean>;
  insertActivity(values: Record<string, unknown>): Promise<void>;
  insertAssignmentHistory(values: Record<string, unknown>): Promise<void>;
  insertAudit(values: Record<string, unknown>): Promise<void>;
}
export interface LeadCrmUnitOfWork {
  transaction<T>(work: (tx: LeadCrmTransaction) => Promise<T>): Promise<T>;
}
async function authorized(
  tx: LeadCrmTransaction,
  context: LeadCommandContext,
  leadId: string,
) {
  const lead = await tx.getLead(leadId, { lock: true });
  if (!lead || lead.deletedAt)
    throw new ApplicationError("LEAD_NOT_FOUND", "LEAD_NOT_FOUND");
  if (context.actor.role === "ADVISOR") {
    const advisorId = await tx.currentAdvisorId(context.actor.identityId);
    if (!advisorId || lead.assignedAdvisorId !== advisorId)
      throw new ApplicationError("LEAD_FORBIDDEN", "LEAD_FORBIDDEN");
  }
  return lead;
}
function version(lead: LeadRecord, expected: bigint) {
  if (lead.version !== expected)
    throw new ApplicationError("LEAD_CONFLICT", "LEAD_CONFLICT");
}
async function audit(
  tx: LeadCrmTransaction,
  context: LeadCommandContext,
  leadId: string,
  action: string,
  changeSummary: Record<string, unknown>,
) {
  await tx.insertAudit({
    action,
    targetId: leadId,
    correlationId: context.correlationId,
    requestId: context.requestId,
    changeSummary,
  });
}
export async function changeLeadStatus(
  uow: LeadCrmUnitOfWork,
  context: LeadCommandContext,
  input: Readonly<{
    leadId: string;
    expectedVersion: bigint;
    status: LeadState;
  }>,
) {
  return uow.transaction(async (tx) => {
    const lead = await authorized(tx, context, input.leadId);
    version(lead, input.expectedVersion);
    try {
      assertLeadTransition(lead.status, input.status);
    } catch {
      throw new ApplicationError(
        "LEAD_INVALID_TRANSITION",
        "LEAD_INVALID_TRANSITION",
      );
    }
    if (!(await tx.updateStatus(lead.id, lead.version, input.status)))
      throw new ApplicationError("LEAD_CONFLICT", "LEAD_CONFLICT");
    await tx.insertActivity({
      leadId: lead.id,
      activityType: "STATUS_CHANGED",
      occurredAt: new Date(),
      correlationId: context.correlationId,
      sourceIdempotencyKey: context.idempotencyKey,
      details: { from: lead.status, to: input.status },
    });
    await audit(tx, context, lead.id, "lead.status_changed", {
      from: lead.status,
      to: input.status,
    });
  });
}
export async function addLeadNote(
  uow: LeadCrmUnitOfWork,
  context: LeadCommandContext,
  input: Readonly<{ leadId: string; expectedVersion: bigint; summary: string }>,
) {
  if (!input.summary.trim() || input.summary.trim().length > 4000)
    throw new ApplicationError(
      "LEAD_VALIDATION_FAILED",
      "LEAD_VALIDATION_FAILED",
    );
  return uow.transaction(async (tx) => {
    const lead = await authorized(tx, context, input.leadId);
    version(lead, input.expectedVersion);
    await tx.insertActivity({
      leadId: lead.id,
      activityType: "NOTE_ADDED",
      summary: input.summary.trim(),
      occurredAt: new Date(),
      correlationId: context.correlationId,
      sourceIdempotencyKey: context.idempotencyKey,
      details: {},
    });
    await audit(tx, context, lead.id, "lead.note_added", {});
  });
}
export async function assignLeadAdvisor(
  uow: LeadCrmUnitOfWork,
  context: LeadCommandContext,
  input: Readonly<{
    leadId: string;
    expectedVersion: bigint;
    advisorId: string | null;
  }>,
) {
  if (context.actor.role !== "ADMIN")
    throw new ApplicationError("LEAD_FORBIDDEN", "LEAD_FORBIDDEN");
  return uow.transaction(async (tx) => {
    const lead = await authorized(tx, context, input.leadId);
    version(lead, input.expectedVersion);
    if (input.advisorId && !(await tx.advisorExists(input.advisorId)))
      throw new ApplicationError(
        "LEAD_VALIDATION_FAILED",
        "LEAD_VALIDATION_FAILED",
      );
    if (lead.assignedAdvisorId === input.advisorId)
      throw new ApplicationError("LEAD_CONFLICT", "LEAD_CONFLICT");
    if (!(await tx.updateAssignment(lead.id, lead.version, input.advisorId)))
      throw new ApplicationError("LEAD_CONFLICT", "LEAD_CONFLICT");
    const values = {
      leadId: lead.id,
      fromAdvisorId: lead.assignedAdvisorId,
      toAdvisorId: input.advisorId,
      assignedByUserIdentityId: context.actor.identityId,
      correlationId: context.correlationId,
      sourceIdempotencyKey: context.idempotencyKey,
      occurredAt: new Date(),
    };
    await tx.insertActivity({
      ...values,
      activityType: "ASSIGNMENT_CHANGED",
      details: {
        fromAdvisorId: lead.assignedAdvisorId,
        toAdvisorId: input.advisorId,
      },
    });
    await tx.insertAssignmentHistory(values);
    await audit(tx, context, lead.id, "lead.assignment_changed", {
      fromAdvisorId: lead.assignedAdvisorId,
      toAdvisorId: input.advisorId,
    });
  });
}
