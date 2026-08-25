import { ApplicationError } from "@/application/errors/application-error";
import type { StaffPrincipal } from "@/application/auth/staff-principal";
import {
  compareMatchesV2,
  matchingFingerprintV2,
  scoreMatchingV2,
  type MatchResult,
  type MatchingProfileV2,
  type PropertyMatchCandidateV2,
} from "@/domain/matching/matching-engine-v2";
import { MATCHING_CANDIDATE_LIMIT_MAXIMUM } from "@/domain/matching/matching-policy";

export type MatchingCommandContext = Readonly<{
  actor: StaffPrincipal;
  correlationId: string;
  requestId: string;
}>;

export type MatchingProfileRecord = Readonly<{
  requestId: string;
  customerId: string;
  version: bigint;
  profile: MatchingProfileV2;
}>;

export type PersistedMatch = Readonly<{
  propertyId: string;
  propertyVersion: bigint;
  fingerprint: string;
}>;

export interface MatchingTransaction {
  loadAuthorizedProfile(
    actor: StaffPrincipal,
    customerRequestId: string,
  ): Promise<MatchingProfileRecord | null>;
  loadCandidates(
    actor: StaffPrincipal,
    profile: MatchingProfileRecord,
    limitPlusOne: number,
  ): Promise<readonly (PropertyMatchCandidateV2 & { version: bigint })[]>;
  loadCurrentMatches(
    customerRequestId: string,
  ): Promise<readonly PersistedMatch[]>;
  persistGeneration(
    input: Readonly<{
      profile: MatchingProfileRecord;
      matches: readonly (MatchResult & {
        propertyVersion: bigint;
        fingerprint: string;
      })[];
      correlationId: string;
      requestId: string;
    }>,
  ): Promise<void>;
}

export interface MatchingUnitOfWork {
  transaction<T>(
    work: (transaction: MatchingTransaction) => Promise<T>,
  ): Promise<T>;
}

export type MatchingResultSummary = Readonly<{
  propertyId: string;
  ruleVersion: "matching-v2";
  totalScore: number;
  components: MatchResult["components"];
  reasons: MatchResult["reasons"];
}>;

function sameGeneration(
  current: readonly PersistedMatch[],
  next: readonly {
    propertyId: string;
    propertyVersion: bigint;
    fingerprint: string;
  }[],
) {
  if (current.length !== next.length) return false;
  const currentByProperty = new Map(
    current.map((match) => [match.propertyId, match]),
  );
  return next.every((match) => {
    const existing = currentByProperty.get(match.propertyId);
    return (
      existing?.propertyVersion === match.propertyVersion &&
      existing.fingerprint === match.fingerprint
    );
  });
}

export async function refreshCustomerRequestMatches(
  uow: MatchingUnitOfWork,
  context: MatchingCommandContext,
  input: Readonly<{ customerRequestId: string; candidateLimit: number }>,
): Promise<readonly MatchingResultSummary[]> {
  if (
    !Number.isSafeInteger(input.candidateLimit) ||
    input.candidateLimit <= 0 ||
    input.candidateLimit > MATCHING_CANDIDATE_LIMIT_MAXIMUM
  ) {
    throw new ApplicationError(
      "MATCHING_INPUT_INVALID",
      "MATCHING_INPUT_INVALID",
    );
  }

  return uow.transaction(async (transaction) => {
    const profile = await transaction.loadAuthorizedProfile(
      context.actor,
      input.customerRequestId,
    );
    if (!profile) {
      // Direct identifiers remain non-enumerating across staff scope boundaries.
      throw new ApplicationError(
        "MATCHING_REQUEST_NOT_FOUND",
        "MATCHING_REQUEST_NOT_FOUND",
      );
    }
    const candidates = await transaction.loadCandidates(
      context.actor,
      profile,
      input.candidateLimit + 1,
    );
    if (candidates.length > input.candidateLimit) {
      throw new ApplicationError(
        "MATCHING_CANDIDATE_LIMIT_EXCEEDED",
        "MATCHING_CANDIDATE_LIMIT_EXCEEDED",
      );
    }
    const matches = candidates
      .map((candidate) => ({
        candidate,
        result: scoreMatchingV2(profile.profile, candidate),
        fingerprint: matchingFingerprintV2(profile.profile, candidate),
      }))
      .filter(
        (
          item,
        ): item is {
          candidate: PropertyMatchCandidateV2 & { version: bigint };
          result: MatchResult;
          fingerprint: string;
        } => item.result.status === "MATCHED",
      )
      .sort((left, right) => compareMatchesV2(left.result, right.result));
    const generation = matches.map(({ candidate, result, fingerprint }) => ({
      ...result,
      propertyVersion: candidate.version,
      fingerprint,
    }));
    const current = await transaction.loadCurrentMatches(profile.requestId);
    if (!sameGeneration(current, generation)) {
      await transaction.persistGeneration({
        profile,
        matches: generation,
        correlationId: context.correlationId,
        requestId: context.requestId,
      });
    }
    return generation.map((match) => ({
      propertyId: match.propertyId,
      ruleVersion: match.ruleVersion,
      totalScore: match.totalScore,
      components: match.components,
      reasons: match.reasons,
    }));
  });
}
