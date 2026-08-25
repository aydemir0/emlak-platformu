"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { refreshCustomerRequestMatches } from "@/application/matching/matching-use-cases";
import {
  ApplicationError,
  isReportableOperationalFailure,
} from "@/application/errors/application-error";
import { getServerEnv } from "@/config/env.server.runtime";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresMatchingUnitOfWork } from "@/infrastructure/matching/postgres-matching.server";
import { reportUnexpectedError } from "@/infrastructure/observability/runtime-observability.server";
import { createRequestContext } from "@/lib/request-context";

export async function calculateMatchesAction(form: FormData) {
  const customerRequestId = z.uuid().parse(form.get("customerRequestId"));
  const requestHeaders = await headers();
  const requestContext = createRequestContext(requestHeaders);
  try {
    const actor = await requireStaffPrincipal();
    const candidateLimit = getServerEnv().MATCHING_CANDIDATE_LIMIT;
    await refreshCustomerRequestMatches(
      new PostgresMatchingUnitOfWork(),
      {
        actor,
        ...requestContext,
      },
      {
        customerRequestId,
        candidateLimit,
      },
    );
  } catch (error) {
    if (isReportableOperationalFailure(error)) {
      reportUnexpectedError(error, {
        correlationId: requestContext.correlationId,
        operation: "matching.calculate",
      });
    }
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
