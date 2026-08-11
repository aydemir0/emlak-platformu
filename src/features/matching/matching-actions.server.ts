"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { refreshCustomerRequestMatches } from "@/application/matching/matching-use-cases";
import { ApplicationError } from "@/application/errors/application-error";
import { getServerEnv } from "@/config/env.server.runtime";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresMatchingUnitOfWork } from "@/infrastructure/matching/postgres-matching.server";

const unitOfWork = new PostgresMatchingUnitOfWork();

export async function calculateMatchesAction(form: FormData) {
  const customerRequestId = z.uuid().parse(form.get("customerRequestId"));
  const requestHeaders = await headers();
  try {
    await refreshCustomerRequestMatches(
      unitOfWork,
      {
        actor: await requireStaffPrincipal(),
        correlationId: randomUUID(),
        requestId: requestHeaders.get("x-request-id") ?? randomUUID(),
      },
      {
        customerRequestId,
        candidateLimit: getServerEnv().MATCHING_CANDIDATE_LIMIT,
      },
    );
  } catch (error) {
    let state = "failed";
    if (error instanceof ApplicationError) {
      if (error.code === "MATCHING_CANDIDATE_LIMIT_EXCEEDED") state = "limit";
      if (error.code === "MATCHING_INPUT_INVALID") state = "invalid";
      if (error.code === "MATCHING_CONCURRENCY_CONFLICT") state = "conflict";
    }
    redirect(`/admin/customer-requests/${customerRequestId}?matching=${state}`);
  }
  revalidatePath(`/admin/customer-requests/${customerRequestId}`);
  redirect(`/admin/customer-requests/${customerRequestId}?matching=success`);
}
