import "server-only";

import type { Pool, PoolClient } from "pg";

import type { StaffPrincipal } from "@/application/auth/staff-principal";
import type {
  MatchingProfileRecord,
  MatchingTransaction,
  MatchingUnitOfWork,
  PersistedMatch,
} from "@/application/matching/matching-use-cases";
import type {
  MatchingReadRepository,
  MatchingRequestView,
} from "@/application/matching/matching-read-model";
import { ApplicationError } from "@/application/errors/application-error";
import {
  MATCHING_RULE_VERSION,
  type MatchingProfileV2,
  type Preference,
  type PropertyMatchCandidateV2,
} from "@/domain/matching/matching-engine-v2";
import { MATCHING_CANDIDATE_LIMIT_MAXIMUM } from "@/domain/matching/matching-policy";
import { getDatabasePool } from "@/infrastructure/postgres/pool.server";

type State = "MISSING" | "FLEXIBLE" | "CONSTRAINED";
const states: readonly State[] = ["MISSING", "FLEXIBLE", "CONSTRAINED"];
const asBigInt = (value: unknown) =>
  value === null || value === undefined ? undefined : BigInt(String(value));
const state = (value: unknown): State => {
  if (typeof value !== "string" || !states.includes(value as State)) {
    throw new ApplicationError(
      "MATCHING_INPUT_INVALID",
      "MATCHING_INPUT_INVALID",
    );
  }
  return value as State;
};
function preference<T>(mode: State, value: T | undefined): Preference<T> {
  if (mode !== "CONSTRAINED") return { mode };
  if (value === undefined) {
    throw new ApplicationError(
      "MATCHING_INPUT_INVALID",
      "MATCHING_INPUT_INVALID",
    );
  }
  return { mode, value };
}

function profileFromRow(
  row: Record<string, unknown>,
  featureRows: readonly Record<string, unknown>[],
): MatchingProfileV2 {
  const range = (min: unknown, max: unknown) => {
    const minimum = asBigInt(min);
    const maximum = asBigInt(max);
    return minimum === undefined && maximum === undefined
      ? undefined
      : { min: minimum, max: maximum };
  };
  const featureSets = {
    preferred: [] as string[],
    required: [] as string[],
    avoided: [] as string[],
  };
  for (const feature of featureRows) {
    const priority = feature.priority;
    if (priority === "preferred")
      featureSets.preferred.push(String(feature.feature_id));
    if (priority === "required")
      featureSets.required.push(String(feature.feature_id));
    if (priority === "avoid")
      featureSets.avoided.push(String(feature.feature_id));
  }
  const location = row.location_id
    ? {
        cityId: String(row.location_city_id ?? row.location_id),
        ...(row.location_district_id
          ? { districtId: String(row.location_district_id) }
          : {}),
      }
    : undefined;
  const budgetRange = range(row.budget_min_minor, row.budget_max_minor);
  const budget =
    budgetRange && row.currency_code
      ? { ...budgetRange, currencyCode: String(row.currency_code) }
      : undefined;
  return {
    listingTypeId: String(row.listing_type_id ?? ""),
    location: preference(state(row.matching_location_state), location),
    budget: preference(state(row.matching_budget_state), budget),
    propertyTypes: preference(
      state(row.matching_property_type_state),
      row.property_type_id ? [String(row.property_type_id)] : undefined,
    ),
    rooms: preference(
      state(row.matching_rooms_state),
      range(row.bedrooms_min, row.bedrooms_max),
    ),
    netAreaDeciSqm: preference(
      state(row.matching_net_area_state),
      range(row.net_area_min, row.net_area_max),
    ),
    features: preference(state(row.matching_features_state), featureSets),
  };
}

class PostgresMatchingTransaction implements MatchingTransaction {
  constructor(private readonly client: PoolClient) {}

  async loadAuthorizedProfile(
    actor: StaffPrincipal,
    customerRequestId: string,
  ): Promise<MatchingProfileRecord | null> {
    await this.client.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [customerRequestId],
    );
    const request = await this.client.query(
      `select cr.*,case when l.level='CITY' then l.id else parent.id end location_city_id,
              case when l.level='DISTRICT' then l.id else null end location_district_id
         from public.customer_requests cr
         join public.customers c on c.id=cr.customer_id and c.deleted_at is null
         left join public.locations l on l.id=cr.location_id
         left join public.locations parent on parent.id=l.parent_id and parent.level='CITY'
         left join public.advisors mine on mine.user_identity_id=$1 and mine.status='active' and mine.deleted_at is null
        where cr.id=$2 and cr.status='ACTIVE' and cr.deleted_at is null
          and ($3='ADMIN' or c.assigned_advisor_id=mine.id)
        for update of cr`,
      [actor.identityId, customerRequestId, actor.role],
    );
    const row = request.rows[0];
    if (!row) return null;
    const features = await this.client.query(
      "select crf.feature_id,crf.priority from public.customer_request_features crf join public.property_features f on f.id=crf.feature_id and f.status='active' and f.deleted_at is null where crf.customer_request_id=$1",
      [customerRequestId],
    );
    try {
      return {
        requestId: row.id,
        customerId: row.customer_id,
        version: BigInt(row.version),
        profile: profileFromRow(row, features.rows),
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        "MATCHING_INPUT_INVALID",
        "MATCHING_INPUT_INVALID",
        { cause: error },
      );
    }
  }

  async loadCandidates(
    actor: StaffPrincipal,
    profile: MatchingProfileRecord,
    limitPlusOne: number,
  ) {
    const required =
      profile.profile.features.mode === "CONSTRAINED"
        ? profile.profile.features.value.required
        : [];
    const candidates = await this.client.query(
      `select p.id,p.version::text,p.listing_type_id,p.property_type_id,p.price_amount_minor::text,p.currency_code,
              p.bedroom_count::text,round(p.net_area_sqm * 10)::bigint::text net_area_deci_sqm,
              case when l.level='CITY' then l.id else parent.id end city_id,
              case when l.level='DISTRICT' then l.id else null end district_id
         from public.properties p
         join public.locations l on l.id=p.location_id
         left join public.locations parent on parent.id=l.parent_id and parent.level='CITY'
         left join public.advisors mine on mine.user_identity_id=$1 and mine.status='active' and mine.deleted_at is null
        where p.deleted_at is null and p.current_state='ACTIVE' and p.listing_type_id=$2
          and ($3='ADMIN' or exists (select 1 from public.property_advisor_assignments paa where paa.property_id=p.id and paa.advisor_id=mine.id and paa.ended_at is null))
          and not exists (
            select 1 from unnest($4::uuid[]) required(feature_id)
             where not exists (select 1 from public.property_feature_assignments pfa where pfa.property_id=p.id and pfa.feature_id=required.feature_id)
          )
        order by p.id asc limit $5`,
      [
        actor.identityId,
        profile.profile.listingTypeId,
        actor.role,
        required,
        limitPlusOne,
      ],
    );
    const ids = candidates.rows.map((row) => row.id);
    const features = ids.length
      ? await this.client.query(
          "select pfa.property_id,pfa.feature_id from public.property_feature_assignments pfa join public.property_features f on f.id=pfa.feature_id and f.status='active' and f.deleted_at is null where pfa.property_id=any($1::uuid[])",
          [ids],
        )
      : { rows: [] as Record<string, unknown>[] };
    const byProperty = new Map<string, string[]>();
    for (const row of features.rows) {
      const propertyId = String(row.property_id);
      byProperty.set(propertyId, [
        ...(byProperty.get(propertyId) ?? []),
        String(row.feature_id),
      ]);
    }
    return candidates.rows.map(
      (row) =>
        ({
          id: row.id,
          version: BigInt(row.version),
          listingTypeId: row.listing_type_id,
          cityId: row.city_id ?? undefined,
          districtId: row.district_id ?? undefined,
          priceAmountMinor: asBigInt(row.price_amount_minor),
          currencyCode: row.currency_code ?? undefined,
          propertyTypeId: row.property_type_id ?? undefined,
          bedroomCount: asBigInt(row.bedroom_count),
          netAreaDeciSqm: asBigInt(row.net_area_deci_sqm),
          featureIds: byProperty.get(row.id) ?? [],
        }) satisfies PropertyMatchCandidateV2 & { version: bigint },
    );
  }

  async loadCurrentMatches(
    customerRequestId: string,
  ): Promise<readonly PersistedMatch[]> {
    const result = await this.client.query(
      "select property_id,property_version::text,basis_fingerprint from public.property_customer_matches where customer_request_id=$1 and status in ('PROPOSED','REVIEWED') and deleted_at is null for update",
      [customerRequestId],
    );
    return result.rows.map((row) => ({
      propertyId: row.property_id,
      propertyVersion: BigInt(row.property_version),
      fingerprint: row.basis_fingerprint,
    }));
  }

  async persistGeneration(
    input: Parameters<MatchingTransaction["persistGeneration"]>[0],
  ) {
    await this.client.query(
      "update public.property_customer_matches set status='STALE',updated_at=now(),version=version+1 where customer_request_id=$1 and status in ('PROPOSED','REVIEWED') and deleted_at is null",
      [input.profile.requestId],
    );
    if (input.matches.length === 0) return;
    const payload = input.matches.map((match) => ({
      propertyId: match.propertyId,
      propertyVersion: match.propertyVersion.toString(),
      fingerprint: match.fingerprint,
      totalScore: match.totalScore / 100,
      reasons: match.reasons.map((reason) => ({
        code: reason.code,
        contribution: reason.points / 100,
      })),
    }));
    const persisted = await this.client.query<{ persisted_count: number }>(
      `with input_matches as (
        select * from jsonb_to_recordset($1::jsonb) as item(
          "propertyId" uuid,"propertyVersion" bigint,fingerprint text,"totalScore" numeric,reasons jsonb
        )
      ), upserted_matches as (
        insert into public.property_customer_matches(
          property_id,customer_id,customer_request_id,rule_version,property_version,
          request_version,basis_fingerprint,status,source,score,generated_at
        )
        select "propertyId",$2,$3,$4,"propertyVersion",$5,fingerprint,
          'PROPOSED','RULES',"totalScore",now()
        from input_matches
        on conflict (property_id,customer_id,customer_request_id,rule_version,property_version,request_version,basis_fingerprint)
        do update set status='PROPOSED',score=excluded.score,generated_at=excluded.generated_at,
          updated_at=now(),version=public.property_customer_matches.version+1
        returning id,property_id,property_version,basis_fingerprint
      ), input_reasons as (
        select persisted.id,reason.code,reason.contribution
        from upserted_matches persisted
        join input_matches item on item."propertyId"=persisted.property_id
          and item."propertyVersion"=persisted.property_version
          and item.fingerprint=persisted.basis_fingerprint
        cross join lateral jsonb_to_recordset(item.reasons) as reason(code text,contribution numeric)
      ), upserted_reasons as (
        insert into public.property_customer_match_reasons(
          property_customer_match_id,reason_code,contribution,explanation
        )
        select id,code,contribution,null from input_reasons
        on conflict (property_customer_match_id,reason_code)
        do update set contribution=excluded.contribution,explanation=null
        returning 1
      )
      select count(*)::int as persisted_count from upserted_matches`,
      [
        JSON.stringify(payload),
        input.profile.customerId,
        input.profile.requestId,
        MATCHING_RULE_VERSION,
        input.profile.version.toString(),
      ],
    );
    if (persisted.rows[0]?.persisted_count !== input.matches.length) {
      throw new ApplicationError(
        "MATCHING_PERSISTENCE_FAILED",
        "MATCHING_PERSISTENCE_FAILED",
      );
    }
  }
}

export class PostgresMatchingUnitOfWork implements MatchingUnitOfWork {
  constructor(private readonly pool: Pool = getDatabasePool()) {}
  async transaction<T>(work: (transaction: MatchingTransaction) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(new PostgresMatchingTransaction(client));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

const rangeLabel = (minimum: unknown, maximum: unknown, suffix = "") => {
  if (minimum !== null && maximum !== null)
    return `${minimum}–${maximum}${suffix}`;
  if (minimum !== null) return `${minimum}${suffix} ve üzeri`;
  if (maximum !== null) return `${maximum}${suffix} ve altı`;
  return null;
};
const componentFor = (code: string) => {
  if (code.startsWith("LOCATION_")) return "location";
  if (code.startsWith("BUDGET_")) return "budget";
  if (code.startsWith("PROPERTY_TYPE_")) return "propertyType";
  if (code.startsWith("ROOMS_")) return "rooms";
  if (code.startsWith("AREA_")) return "netArea";
  if (code.startsWith("FEATURES_")) return "features";
  return "hardConstraint";
};

export class PostgresMatchingReadRepository implements MatchingReadRepository {
  constructor(private readonly pool: Pick<Pool, "query"> = getDatabasePool()) {}
  async get(
    actor: StaffPrincipal,
    customerRequestId: string,
  ): Promise<MatchingRequestView | null> {
    const request = await this.pool.query(
      `select cr.*,lt.label listing_type_label,pt.label property_type_label,l.name location_name
        from public.customer_requests cr join public.customers c on c.id=cr.customer_id and c.deleted_at is null
        left join public.advisors mine on mine.user_identity_id=$1 and mine.status='active' and mine.deleted_at is null
        left join public.listing_types lt on lt.id=cr.listing_type_id left join public.property_types pt on pt.id=cr.property_type_id
        left join public.locations l on l.id=cr.location_id
       where cr.id=$2 and cr.deleted_at is null and ($3='ADMIN' or c.assigned_advisor_id=mine.id)`,
      [actor.identityId, customerRequestId, actor.role],
    );
    const row = request.rows[0];
    if (!row) return null;
    const [features, matches] = await Promise.all([
      this.pool.query(
        "select f.label,crf.priority from public.customer_request_features crf join public.property_features f on f.id=crf.feature_id where crf.customer_request_id=$1 and f.deleted_at is null order by crf.priority,f.label",
        [customerRequestId],
      ),
      this.pool.query(
        `with bounded_matches as (
          select m.id,m.property_id,m.status,m.score,p.title,p.public_id
          from public.property_customer_matches m
          join public.properties p on p.id=m.property_id and p.deleted_at is null
          left join public.advisors mine on mine.user_identity_id=$1 and mine.status='active' and mine.deleted_at is null
          where m.customer_request_id=$2 and m.deleted_at is null and m.status in ('PROPOSED','REVIEWED','STALE')
            and ($3='ADMIN' or exists(select 1 from public.property_advisor_assignments paa where paa.property_id=m.property_id and paa.advisor_id=mine.id and paa.ended_at is null))
          order by m.status='STALE',m.score desc,m.property_id asc
          limit $4
        )
        select m.property_id,m.status,m.score,m.title,m.public_id,
          coalesce(jsonb_agg(jsonb_build_object('code',r.reason_code,'points',r.contribution)) filter(where r.reason_code is not null),'[]'::jsonb) reasons
          from bounded_matches m
          left join public.property_customer_match_reasons r on r.property_customer_match_id=m.id
         group by m.id,m.property_id,m.status,m.score,m.title,m.public_id
         order by m.status='STALE',m.score desc,m.property_id asc`,
        [
          actor.identityId,
          customerRequestId,
          actor.role,
          MATCHING_CANDIDATE_LIMIT_MAXIMUM + 1,
        ],
      ),
    ]);
    if (matches.rows.length > MATCHING_CANDIDATE_LIMIT_MAXIMUM) {
      throw new ApplicationError(
        "MATCHING_RESULT_LIMIT_EXCEEDED",
        "MATCHING_RESULT_LIMIT_EXCEEDED",
      );
    }
    const featureValue = features.rows.length
      ? features.rows
          .map((item) => `${item.priority}: ${item.label}`)
          .join(", ")
      : null;
    const criterion = (stateValue: unknown, value: string | null) => ({
      state: state(stateValue),
      value,
    });
    return {
      id: row.id,
      profile: {
        listingType: {
          state: "CONSTRAINED",
          value: row.listing_type_label ?? null,
        },
        location: criterion(
          row.matching_location_state,
          row.location_name ?? null,
        ),
        budget: criterion(
          row.matching_budget_state,
          row.currency_code
            ? rangeLabel(
                row.budget_min_minor,
                row.budget_max_minor,
                ` ${row.currency_code}`,
              )
            : null,
        ),
        propertyType: criterion(
          row.matching_property_type_state,
          row.property_type_label ?? null,
        ),
        rooms: criterion(
          row.matching_rooms_state,
          rangeLabel(row.bedrooms_min, row.bedrooms_max, " oda"),
        ),
        netArea: criterion(
          row.matching_net_area_state,
          rangeLabel(row.net_area_min, row.net_area_max, " dm²"),
        ),
        features: criterion(row.matching_features_state, featureValue),
      },
      results: matches.rows.map((match) => {
        const reasons = match.reasons as { code: string; points: number }[];
        return {
          propertyId: match.property_id,
          propertyTitle: match.title,
          propertyReference: match.public_id,
          status: match.status,
          totalScore: Math.round(Number(match.score) * 100),
          components: Object.fromEntries(
            reasons.map((reason) => [
              componentFor(reason.code),
              Math.round(Number(reason.points) * 100),
            ]),
          ),
          reasonCodes: reasons.map((reason) => reason.code),
        };
      }),
    };
  }
}
