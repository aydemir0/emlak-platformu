"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ApplicationError } from "@/application/errors/application-error";
import { convertLeadToCustomer } from "@/application/leads/convert-lead-to-customer";
import type { LeadConversionActionState } from "@/features/leads/lead-conversion-presentation";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresLeadConversionUnitOfWork } from "@/infrastructure/leads/postgres-lead-conversion-unit-of-work.server";

const unitOfWork = new PostgresLeadConversionUnitOfWork();
const conversionFormSchema = z.object({
  leadId: z.uuid(),
  explicitCustomerId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.uuid().optional(),
  ),
  createInitialRequest: z.preprocess((value) => value === "on", z.boolean()),
  idempotencyKey: z.uuid(),
});

function errorCode(error: unknown): string {
  if (error instanceof ApplicationError) return error.code;
  if (error instanceof z.ZodError) return "LEAD_CONVERSION_FAILED";
  return "LEAD_CONVERSION_FAILED";
}

export async function convertLeadToCustomerAction(
  _previous: LeadConversionActionState,
  formData: FormData,
): Promise<LeadConversionActionState> {
  try {
    const input = conversionFormSchema.parse(Object.fromEntries(formData));
    const requestHeaders = await headers();
    const result = await convertLeadToCustomer(
      unitOfWork,
      {
        actor: await requireStaffPrincipal(),
        correlationId: randomUUID(),
        requestId: requestHeaders.get("x-request-id") ?? randomUUID(),
        idempotencyKey: input.idempotencyKey,
      },
      input,
    );
    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${input.leadId}`);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: errorCode(error) };
  }
}
