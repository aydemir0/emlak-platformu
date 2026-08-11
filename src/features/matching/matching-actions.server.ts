"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { refreshCustomerRequestMatches } from "@/application/matching/matching-use-cases";
import { getServerEnv } from "@/config/env.server.runtime";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresMatchingUnitOfWork } from "@/infrastructure/matching/postgres-matching.server";

const unitOfWork = new PostgresMatchingUnitOfWork();

export async function calculateMatchesAction(form: FormData) {
  const customerRequestId = z.uuid().parse(form.get("customerRequestId"));
  const requestHeaders = await headers();
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
  revalidatePath(`/admin/customer-requests/${customerRequestId}`);
}
