"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApplicationError } from "@/application/errors/application-error";
import {
  addLeadNote,
  assignLeadAdvisor,
  changeLeadStatus,
} from "@/application/leads/lead-crm-use-cases";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresLeadCrmUnitOfWork } from "@/infrastructure/leads/postgres-lead-crm.server";
import { createRequestContext } from "@/lib/request-context";
const uow = new PostgresLeadCrmUnitOfWork();

async function deliverLeadMutation(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (
      error instanceof ApplicationError &&
      (error.code === "LEAD_NOT_FOUND" || error.code === "LEAD_FORBIDDEN")
    ) {
      throw new ApplicationError("LEAD_NOT_FOUND", "LEAD_NOT_FOUND", {
        correlationId: error.correlationId,
        cause: error,
      });
    }
    throw error;
  }
}
async function context(form: FormData) {
  const h = await headers();
  const requestContext = createRequestContext(h);
  return {
    actor: await requireStaffPrincipal(),
    ...requestContext,
    idempotencyKey: z.uuid().parse(form.get("idempotencyKey")),
  };
}
function fields(form: FormData) {
  return z
    .object({
      leadId: z.uuid(),
      expectedVersion: z.coerce.bigint().positive(),
      idempotencyKey: z.uuid(),
    })
    .parse(Object.fromEntries(form));
}
export async function leadStatusAction(form: FormData) {
  await deliverLeadMutation(async () => {
    const f = fields(form);
    await changeLeadStatus(uow, await context(form), {
      ...f,
      status: z
        .enum([
          "NEW",
          "CONTACTED",
          "QUALIFIED",
          "VIEWING",
          "NEGOTIATION",
          "WON",
          "LOST",
        ])
        .parse(form.get("status")),
    });
    revalidatePath(`/admin/leads/${f.leadId}`);
    revalidatePath("/admin/leads");
  });
}
export async function leadNoteAction(form: FormData) {
  await deliverLeadMutation(async () => {
    const f = fields(form);
    await addLeadNote(uow, await context(form), {
      ...f,
      summary: z.string().trim().min(1).max(4000).parse(form.get("summary")),
    });
    revalidatePath(`/admin/leads/${f.leadId}`);
  });
}
export async function leadAssignmentAction(form: FormData) {
  await deliverLeadMutation(async () => {
    const f = fields(form);
    const advisor = z
      .preprocess((v) => (v === "" ? null : v), z.uuid().nullable())
      .parse(form.get("advisorId"));
    await assignLeadAdvisor(uow, await context(form), {
      ...f,
      advisorId: advisor,
    });
    revalidatePath(`/admin/leads/${f.leadId}`);
    revalidatePath("/admin/leads");
  });
}
