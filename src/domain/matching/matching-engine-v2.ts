import { createHash } from "node:crypto";

export const MATCHING_RULE_VERSION = "matching-v2" as const;

export type Preference<T> =
  { mode: "MISSING" | "FLEXIBLE" } | { mode: "CONSTRAINED"; value: T };

export type Range = { min?: bigint; max?: bigint };
export type LocationPreference = { cityId: string; districtId?: string };

export type MatchingProfileV2 = {
  listingTypeId: string;
  location: Preference<LocationPreference>;
  budget: Preference<Range & { currencyCode: string }>;
  propertyTypes: Preference<readonly string[]>;
  rooms: Preference<Range>;
  netAreaDeciSqm: Preference<Range>;
  features: Preference<{
    preferred: readonly string[];
    required: readonly string[];
    avoided: readonly string[];
  }>;
};

export type PropertyMatchCandidateV2 = {
  id: string;
  listingTypeId?: string;
  cityId?: string;
  districtId?: string;
  priceAmountMinor?: bigint;
  currencyCode?: string;
  propertyTypeId?: string;
  bedroomCount?: bigint;
  netAreaDeciSqm?: bigint;
  featureIds: readonly string[];
};

export type MatchingReasonCode =
  | "LISTING_TYPE_MISMATCH"
  | "REQUIRED_FEATURE_MISSING"
  | "LOCATION_EXACT"
  | "LOCATION_SAME_CITY"
  | "LOCATION_OUTSIDE"
  | "LOCATION_NOT_CONSTRAINED"
  | "LOCATION_PROPERTY_DATA_MISSING"
  | "BUDGET_IN_RANGE"
  | "BUDGET_NEAR_RANGE"
  | "BUDGET_OUTSIDE_RANGE"
  | "BUDGET_NOT_CONSTRAINED"
  | "BUDGET_PROPERTY_DATA_MISSING"
  | "BUDGET_CURRENCY_MISMATCH"
  | "PROPERTY_TYPE_MATCH"
  | "PROPERTY_TYPE_MISMATCH"
  | "PROPERTY_TYPE_NOT_CONSTRAINED"
  | "PROPERTY_TYPE_PROPERTY_DATA_MISSING"
  | "ROOMS_IN_RANGE"
  | "ROOMS_NEAR_RANGE"
  | "ROOMS_OUTSIDE_RANGE"
  | "ROOMS_NOT_CONSTRAINED"
  | "ROOMS_PROPERTY_DATA_MISSING"
  | "AREA_IN_RANGE"
  | "AREA_NEAR_RANGE"
  | "AREA_OUTSIDE_RANGE"
  | "AREA_NOT_CONSTRAINED"
  | "AREA_PROPERTY_DATA_MISSING"
  | "FEATURES_FULL_OVERLAP"
  | "FEATURES_PARTIAL_OVERLAP"
  | "FEATURES_NO_OVERLAP"
  | "FEATURES_AVOIDED_PRESENT"
  | "FEATURES_NOT_CONSTRAINED";

export type ScoreComponents = {
  location: number;
  budget: number;
  propertyType: number;
  rooms: number;
  netArea: number;
  features: number;
};

export type MatchingReason = {
  component: keyof ScoreComponents | "hardConstraint";
  code: MatchingReasonCode;
  points: number;
};

export type MatchResult = {
  status: "MATCHED";
  ruleVersion: typeof MATCHING_RULE_VERSION;
  propertyId: string;
  totalScore: number;
  components: ScoreComponents;
  reasons: readonly MatchingReason[];
};

export type RejectedMatchResult = {
  status: "REJECTED";
  ruleVersion: typeof MATCHING_RULE_VERSION;
  propertyId: string;
  reason: Extract<
    MatchingReasonCode,
    "LISTING_TYPE_MISMATCH" | "REQUIRED_FEATURE_MISSING"
  >;
};

export type MatchingResult = MatchResult | RejectedMatchResult;

export class MatchingInputError extends Error {
  constructor(
    readonly code:
      | "INVALID_RANGE"
      | "INVALID_NUMBER"
      | "UNSUPPORTED_CURRENCY"
      | "CONTRADICTORY_FEATURES"
      | "INVALID_LISTING_TYPE",
  ) {
    super(code);
    this.name = "MatchingInputError";
  }
}

const componentOrder: (keyof ScoreComponents)[] = [
  "location",
  "budget",
  "propertyType",
  "rooms",
  "netArea",
  "features",
];

const currency = (value: string) => /^[A-Z]{3}$/.test(value);
const distinct = (items: readonly string[]) => [...new Set(items)].sort();
const constrained = <T>(
  value: Preference<T>,
): value is { mode: "CONSTRAINED"; value: T } => value.mode === "CONSTRAINED";

function validateRange(range: Range) {
  if (
    (range.min !== undefined && range.min < 0n) ||
    (range.max !== undefined && range.max < 0n)
  ) {
    throw new MatchingInputError("INVALID_NUMBER");
  }
  if (
    range.min !== undefined &&
    range.max !== undefined &&
    range.min > range.max
  ) {
    throw new MatchingInputError("INVALID_RANGE");
  }
}

function validate(
  profile: MatchingProfileV2,
  candidate: PropertyMatchCandidateV2,
) {
  if (!profile.listingTypeId.trim())
    throw new MatchingInputError("INVALID_LISTING_TYPE");
  for (const preference of [
    profile.budget,
    profile.rooms,
    profile.netAreaDeciSqm,
  ]) {
    if (constrained(preference)) validateRange(preference.value);
  }
  if (
    constrained(profile.budget) &&
    !currency(profile.budget.value.currencyCode)
  ) {
    throw new MatchingInputError("UNSUPPORTED_CURRENCY");
  }
  for (const value of [
    candidate.priceAmountMinor,
    candidate.bedroomCount,
    candidate.netAreaDeciSqm,
  ]) {
    if (value !== undefined && value < 0n)
      throw new MatchingInputError("INVALID_NUMBER");
  }
  if (
    candidate.currencyCode !== undefined &&
    !currency(candidate.currencyCode)
  ) {
    throw new MatchingInputError("UNSUPPORTED_CURRENCY");
  }
  if (constrained(profile.features)) {
    const { preferred, required, avoided } = profile.features.value;
    const conflict = [preferred, required, avoided].some((set, index, all) =>
      distinct(set).some((id) =>
        all.some(
          (other, otherIndex) => otherIndex !== index && other.includes(id),
        ),
      ),
    );
    if (conflict) throw new MatchingInputError("CONTRADICTORY_FEATURES");
  }
}

function outsideDistance(value: bigint, range: Range) {
  if (range.min !== undefined && value < range.min)
    return { distance: range.min - value, reference: range.min };
  if (range.max !== undefined && value > range.max)
    return { distance: value - range.max, reference: range.max };
  return null;
}

function toleranceScore(weight: number, value: bigint, range: Range): number {
  const outside = outsideDistance(value, range);
  if (!outside) return weight;
  const tolerance = [1n, (outside.reference * 10n) / 100n].reduce((a, b) =>
    a > b ? a : b,
  );
  if (outside.distance >= tolerance) return 0;
  return Number((BigInt(weight) * (tolerance - outside.distance)) / tolerance);
}

function reason(
  component: MatchingReason["component"],
  code: MatchingReasonCode,
  points: number,
): MatchingReason {
  return { component, code, points };
}

function scoreLocation(
  profile: Preference<LocationPreference>,
  candidate: PropertyMatchCandidateV2,
) {
  if (!constrained(profile))
    return reason("location", "LOCATION_NOT_CONSTRAINED", 30);
  if (!candidate.cityId)
    return reason("location", "LOCATION_PROPERTY_DATA_MISSING", 0);
  const { cityId, districtId } = profile.value;
  if (candidate.cityId !== cityId)
    return reason("location", "LOCATION_OUTSIDE", 0);
  if (!districtId || candidate.districtId === districtId)
    return reason("location", "LOCATION_EXACT", 30);
  return reason("location", "LOCATION_SAME_CITY", 18);
}

function scoreBudget(
  profile: Preference<Range & { currencyCode: string }>,
  candidate: PropertyMatchCandidateV2,
) {
  if (!constrained(profile))
    return reason("budget", "BUDGET_NOT_CONSTRAINED", 25);
  if (candidate.priceAmountMinor === undefined || !candidate.currencyCode)
    return reason("budget", "BUDGET_PROPERTY_DATA_MISSING", 0);
  if (candidate.currencyCode !== profile.value.currencyCode)
    return reason("budget", "BUDGET_CURRENCY_MISMATCH", 0);
  const points = toleranceScore(25, candidate.priceAmountMinor, profile.value);
  return reason(
    "budget",
    points === 25
      ? "BUDGET_IN_RANGE"
      : points
        ? "BUDGET_NEAR_RANGE"
        : "BUDGET_OUTSIDE_RANGE",
    points,
  );
}

function scoreType(
  profile: Preference<readonly string[]>,
  candidate: PropertyMatchCandidateV2,
) {
  if (!constrained(profile))
    return reason("propertyType", "PROPERTY_TYPE_NOT_CONSTRAINED", 15);
  if (!candidate.propertyTypeId)
    return reason("propertyType", "PROPERTY_TYPE_PROPERTY_DATA_MISSING", 0);
  const points = distinct(profile.value).includes(candidate.propertyTypeId)
    ? 15
    : 0;
  return reason(
    "propertyType",
    points ? "PROPERTY_TYPE_MATCH" : "PROPERTY_TYPE_MISMATCH",
    points,
  );
}

function scoreRooms(
  profile: Preference<Range>,
  candidate: PropertyMatchCandidateV2,
) {
  if (!constrained(profile))
    return reason("rooms", "ROOMS_NOT_CONSTRAINED", 10);
  if (candidate.bedroomCount === undefined)
    return reason("rooms", "ROOMS_PROPERTY_DATA_MISSING", 0);
  const outside = outsideDistance(candidate.bedroomCount, profile.value);
  const points = outside ? (outside.distance === 1n ? 5 : 0) : 10;
  return reason(
    "rooms",
    points === 10
      ? "ROOMS_IN_RANGE"
      : points
        ? "ROOMS_NEAR_RANGE"
        : "ROOMS_OUTSIDE_RANGE",
    points,
  );
}

function scoreArea(
  profile: Preference<Range>,
  candidate: PropertyMatchCandidateV2,
) {
  if (!constrained(profile))
    return reason("netArea", "AREA_NOT_CONSTRAINED", 10);
  if (candidate.netAreaDeciSqm === undefined)
    return reason("netArea", "AREA_PROPERTY_DATA_MISSING", 0);
  const points = toleranceScore(10, candidate.netAreaDeciSqm, profile.value);
  return reason(
    "netArea",
    points === 10
      ? "AREA_IN_RANGE"
      : points
        ? "AREA_NEAR_RANGE"
        : "AREA_OUTSIDE_RANGE",
    points,
  );
}

function scoreFeatures(
  profile: Preference<{
    preferred: readonly string[];
    required: readonly string[];
    avoided: readonly string[];
  }>,
  candidate: PropertyMatchCandidateV2,
) {
  if (!constrained(profile))
    return reason("features", "FEATURES_NOT_CONSTRAINED", 10);
  const candidateIds = new Set(candidate.featureIds);
  const preferred = distinct(profile.value.preferred);
  if (distinct(profile.value.avoided).some((id) => candidateIds.has(id)))
    return reason("features", "FEATURES_AVOIDED_PRESENT", 0);
  if (!preferred.length) return reason("features", "FEATURES_FULL_OVERLAP", 10);
  const points = Math.floor(
    (10 * preferred.filter((id) => candidateIds.has(id)).length) /
      preferred.length,
  );
  return reason(
    "features",
    points === 10
      ? "FEATURES_FULL_OVERLAP"
      : points
        ? "FEATURES_PARTIAL_OVERLAP"
        : "FEATURES_NO_OVERLAP",
    points,
  );
}

export function scoreMatchingV2(
  profile: MatchingProfileV2,
  candidate: PropertyMatchCandidateV2,
): MatchingResult {
  validate(profile, candidate);
  if (candidate.listingTypeId !== profile.listingTypeId)
    return {
      status: "REJECTED",
      ruleVersion: MATCHING_RULE_VERSION,
      propertyId: candidate.id,
      reason: "LISTING_TYPE_MISMATCH",
    };
  if (constrained(profile.features)) {
    const candidateIds = new Set(candidate.featureIds);
    if (
      distinct(profile.features.value.required).some(
        (id) => !candidateIds.has(id),
      )
    ) {
      return {
        status: "REJECTED",
        ruleVersion: MATCHING_RULE_VERSION,
        propertyId: candidate.id,
        reason: "REQUIRED_FEATURE_MISSING",
      };
    }
  }
  const reasons = [
    scoreLocation(profile.location, candidate),
    scoreBudget(profile.budget, candidate),
    scoreType(profile.propertyTypes, candidate),
    scoreRooms(profile.rooms, candidate),
    scoreArea(profile.netAreaDeciSqm, candidate),
    scoreFeatures(profile.features, candidate),
  ];
  const components = Object.fromEntries(
    reasons.map(({ component, points }) => [component, points]),
  ) as ScoreComponents;
  const totalScore = reasons.reduce((sum, item) => sum + item.points, 0);
  return {
    status: "MATCHED",
    ruleVersion: MATCHING_RULE_VERSION,
    propertyId: candidate.id,
    totalScore,
    components,
    reasons,
  };
}

export function compareMatchesV2(
  left: MatchResult,
  right: MatchResult,
): number {
  if (left.totalScore !== right.totalScore)
    return right.totalScore - left.totalScore;
  for (const component of componentOrder)
    if (left.components[component] !== right.components[component])
      return right.components[component] - left.components[component];
  return left.propertyId < right.propertyId
    ? -1
    : left.propertyId > right.propertyId
      ? 1
      : 0;
}

export function matchingFingerprintV2(
  profile: MatchingProfileV2,
  candidate: PropertyMatchCandidateV2,
): string {
  validate(profile, candidate);
  const normalize = (value: unknown): unknown => {
    if (typeof value === "bigint") return value.toString();
    if (Array.isArray(value))
      return value
        .map(normalize)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)]),
      );
    return value;
  };
  return createHash("sha256")
    .update(
      JSON.stringify(
        normalize({ ruleVersion: MATCHING_RULE_VERSION, profile, candidate }),
      ),
    )
    .digest("hex");
}
