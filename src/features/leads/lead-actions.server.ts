"use server";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addLeadNote,
  assignLeadAdvisor,
  changeLeadStatus,
} from "@/application/leads/lead-crm-use-cases";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresLeadCrmUnitOfWork } from "@/infrastructure/leads/postgres-lead-crm.server";
const uow = new PostgresLeadCrmUnitOfWork();
async function context(form: FormData) {
  const h = await headers();
  return {
    actor: await requireStaffPrincipal(),
    correlationId: randomUUID(),
    requestId: h.get("x-request-id") ?? randomUUID(),
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
}
export async function leadNoteAction(form: FormData) {
  const f = fields(form);
  await addLeadNote(uow, await context(form), {
    ...f,
    summary: z.string().trim().min(1).max(4000).parse(form.get("summary")),
  });
  revalidatePath(`/admin/leads/${f.leadId}`);
}
export async function leadAssignmentAction(form: FormData) {
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
}
