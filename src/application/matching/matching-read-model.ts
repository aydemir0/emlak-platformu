import type { StaffPrincipal } from "@/application/auth/staff-principal";

export type MatchingCriterionView = Readonly<{
  state: "MISSING" | "FLEXIBLE" | "CONSTRAINED";
  value: string | null;
}>;

export type MatchingResultView = Readonly<{
  propertyId: string;
  propertyTitle: string | null;
  propertyReference: string | null;
  status: "PROPOSED" | "REVIEWED" | "STALE";
  totalScore: number;
  components: Readonly<Record<string, number>>;
  reasonCodes: readonly string[];
}>;

export type MatchingRequestView = Readonly<{
  id: string;
  profile: Readonly<{
    listingType: MatchingCriterionView;
    location: MatchingCriterionView;
    budget: MatchingCriterionView;
    propertyType: MatchingCriterionView;
    rooms: MatchingCriterionView;
    netArea: MatchingCriterionView;
    features: MatchingCriterionView;
  }>;
  results: readonly MatchingResultView[];
}>;

export interface MatchingReadRepository {
  get(
    actor: StaffPrincipal,
    customerRequestId: string,
  ): Promise<MatchingRequestView | null>;
}
