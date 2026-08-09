import "server-only";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { PropertyCommandContext } from "@/application/properties/property-contracts";
import type {
  PropertyTransaction,
  PropertyUnitOfWork,
  ReferenceIds,
} from "@/application/properties/property-ports";
import type {
  PropertyRecord,
  PropertyState,
} from "@/domain/properties/property";
import { getLocalDatabasePool } from "@/infrastructure/postgres/pool.server";

type PropertyRow = QueryResultRow & {
  id: string;
  public_id: string;
  listing_type_id: string;
  property_type_id: string;
  location_id: string;
  heating_type_id: string | null;
  title: string;
  description: string | null;
  current_state: PropertyState;
  price_amount_minor: string | null;
  currency_code: string | null;
  version: string;
  published_at: Date | null;
  deleted_at: Date | null;
  short_description: string | null;
  gross_area_sqm: string | null;
  net_area_sqm: string | null;
  living_room_count: number | null;
  building_age_years: number | null;
  floor_number: number | null;
  total_floor_count: number | null;
  furnished: boolean | null;
  address_line: string | null;
  latitude: string | null;
  longitude: string | null;
  location_visibility: string | null;
  bedroom_count: number | null;
  bathroom_count: number | null;
  updated_at: Date;
};

const PROPERTY_COLUMNS = `id, public_id, listing_type_id, property_type_id, location_id, heating_type_id,
  title, description, current_state, price_amount_minor, currency_code, version, published_at, deleted_at,
  short_description, gross_area_sqm, net_area_sqm, living_room_count, building_age_years, floor_number,
  total_floor_count, furnished, address_line, latitude, longitude, location_visibility, bedroom_count, bathroom_count, updated_at`;

export function mapProperty(row: PropertyRow): PropertyRecord {
  const numberOrNull = (value: string | null) =>
    value === null ? null : Number(value);
  return {
    id: row.id,
    publicId: row.public_id,
    listingTypeId: row.listing_type_id,
    propertyTypeId: row.property_type_id,
    locationId: row.location_id,
    heatingTypeId: row.heating_type_id,
    title: row.title,
    description: row.description,
    currentState: row.current_state,
    priceAmountMinor:
      row.price_amount_minor === null ? null : BigInt(row.price_amount_minor),
    currencyCode: row.currency_code,
    version: BigInt(row.version),
    publishedAt: row.published_at,
    deletedAt: row.deleted_at,
    shortDescription: row.short_description,
    grossAreaSqm: numberOrNull(row.gross_area_sqm),
    netAreaSqm: numberOrNull(row.net_area_sqm),
    livingRoomCount: row.living_room_count,
    buildingAgeYears: row.building_age_years,
    floorNumber: row.floor_number,
    totalFloorCount: row.total_floor_count,
    furnished: row.furnished,
    addressLine: row.address_line,
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    locationVisibility: row.location_visibility,
    bedroomCount: row.bedroom_count,
    bathroomCount: row.bathroom_count,
    updatedAt: row.updated_at,
  };
}

const UPDATE_COLUMNS: Readonly<Record<string, string>> = {
  title: "title",
  description: "description",
  listingTypeId: "listing_type_id",
  propertyTypeId: "property_type_id",
  locationId: "location_id",
  heatingTypeId: "heating_type_id",
  shortDescription: "short_description",
  grossAreaSqm: "gross_area_sqm",
  netAreaSqm: "net_area_sqm",
  livingRoomCount: "living_room_count",
  buildingAgeYears: "building_age_years",
  floorNumber: "floor_number",
  bedroomCount: "bedroom_count",
  bathroomCount: "bathroom_count",
  totalFloorCount: "total_floor_count",
  furnished: "furnished",
  addressLine: "address_line",
  latitude: "latitude",
  longitude: "longitude",
  currentState: "current_state",
  publishedAt: "published_at",
  deletedAt: "deleted_at",
  priceAmountMinor: "price_amount_minor",
  currencyCode: "currency_code",
};

class PostgresPropertyTransaction implements PropertyTransaction {
  constructor(private readonly client: PoolClient) {}

  async loadAuthorizationFacts(context: PropertyCommandContext) {
    const result = await this.client.query<{
      active: boolean;
      role: "ADMIN" | "ADVISOR";
      advisor_id: string | null;
      permissions: string[];
    }>(
      `select ui.status='active' and ui.deleted_at is null as active, r.code as role, a.id as advisor_id,
          coalesce(array_agg(distinct p.code) filter (where p.code is not null), '{}') as permissions
        from public.user_identities ui
        join public.user_role_assignments ura on ura.user_identity_id=ui.id and ura.status='ACTIVE'
          and (ura.expires_at is null or ura.expires_at > statement_timestamp())
        join public.roles r on r.id=ura.role_id and r.status='active' and r.deleted_at is null
        left join public.role_permissions rp on rp.role_id=r.id
        left join public.permissions p on p.id=rp.permission_id and p.status='active' and p.deleted_at is null
        left join public.advisors a on a.user_identity_id=ui.id and a.status='active' and a.deleted_at is null
        where ui.id=$1 group by ui.id, r.code, a.id limit 1`,
      [context.actor.identityId],
    );
    const row = result.rows[0];
    return row
      ? {
          active: row.active,
          role: row.role,
          aal: context.actor.aal,
          permissions: new Set(row.permissions),
          advisorId: row.advisor_id,
        }
      : {
          active: false,
          role: context.actor.role,
          aal: context.actor.aal,
          permissions: new Set<string>(),
          advisorId: null,
        };
  }

  async isAdvisorAssigned(propertyId: string, advisorId: string) {
    const result = await this.client.query(
      `select 1 from public.property_advisor_assignments where property_id=$1 and advisor_id=$2 and ended_at is null`,
      [propertyId, advisorId],
    );
    return result.rowCount === 1;
  }

  async getProperty(propertyId: string, options: { lock: boolean }) {
    const result = await this.client.query<PropertyRow>(
      `select ${PROPERTY_COLUMNS} from public.properties where id=$1 ${options.lock ? "for update" : ""}`,
      [propertyId],
    );
    return result.rows[0] ? mapProperty(result.rows[0]) : null;
  }

  async referencesExist(refs: ReferenceIds) {
    const result = await this.client.query<{ valid: boolean }>(
      `select
      ($1::uuid is null or exists(select 1 from public.listing_types where id=$1 and status='active' and deleted_at is null)) and
      ($2::uuid is null or exists(select 1 from public.property_types where id=$2 and status='active' and deleted_at is null)) and
      ($3::uuid is null or exists(select 1 from public.locations where id=$3 and status='active' and deleted_at is null)) and
      ($4::uuid is null or exists(select 1 from public.heating_types where id=$4 and status='active' and deleted_at is null)) and
      ($5::uuid is null or exists(select 1 from public.advisors where id=$5 and status='active' and deleted_at is null)) as valid`,
      [
        refs.listingTypeId ?? null,
        refs.propertyTypeId ?? null,
        refs.locationId ?? null,
        refs.heatingTypeId ?? null,
        refs.advisorId ?? null,
      ],
    );
    return result.rows[0]?.valid ?? false;
  }

  async getPublicationReadiness(propertyId: string) {
    const result = await this.client.query<{
      canonical_route_ready: boolean;
      public_facts_ready: boolean;
      media_ready: boolean;
    }>(
      `select
        p.current_route_reservation_id is not null and p.current_slug is not null as canonical_route_ready,
        btrim(p.title) <> '' and p.price_amount_minor is not null and p.currency_code is not null
          and lt.status='active' and lt.deleted_at is null
          and pt.status='active' and pt.deleted_at is null
          and l.status='active' and l.deleted_at is null as public_facts_ready,
        exists(select 1 from public.property_media pm where pm.property_id=p.id and pm.is_cover
          and pm.state='READY' and pm.visibility='PUBLIC' and pm.deleted_at is null
          and pm.ready_at is not null and exists(select 1 from public.property_media_variants v
            where v.property_media_id=pm.id and v.source_version=pm.source_version
              and v.recipe_version=pm.current_recipe_version and v.purged_at is null)) as media_ready
       from public.properties p
       join public.listing_types lt on lt.id=p.listing_type_id
       join public.property_types pt on pt.id=p.property_type_id
       join public.locations l on l.id=p.location_id
       where p.id=$1`,
      [propertyId],
    );
    const row = result.rows[0];
    return {
      canonicalRouteReady: row?.canonical_route_ready ?? false,
      publicFactsReady: row?.public_facts_ready ?? false,
      mediaReady: row?.media_ready ?? false,
    };
  }

  async insertProperty(values: Record<string, unknown>) {
    const result = await this.client.query<PropertyRow>(
      `insert into public.properties
      (id, public_id, listing_type_id, property_type_id, location_id, heating_type_id, title, description,
       current_state, price_amount_minor, currency_code, short_description, gross_area_sqm, net_area_sqm,
       living_room_count, bedroom_count, bathroom_count, building_age_years, floor_number, total_floor_count, furnished, address_line, latitude, longitude, version)
      values ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,1)
      returning ${PROPERTY_COLUMNS}`,
      [
        values.id,
        values.publicId,
        values.listingTypeId,
        values.propertyTypeId,
        values.locationId,
        values.heatingTypeId ?? null,
        values.title,
        values.description ?? null,
        values.priceAmountMinor ?? null,
        values.currencyCode ?? null,
        values.shortDescription ?? null,
        values.grossAreaSqm ?? null,
        values.netAreaSqm ?? null,
        values.livingRoomCount ?? null,
        values.bedroomCount ?? null,
        values.bathroomCount ?? null,
        values.buildingAgeYears ?? null,
        values.floorNumber ?? null,
        values.totalFloorCount ?? null,
        values.furnished ?? null,
        values.addressLine ?? null,
        values.latitude ?? null,
        values.longitude ?? null,
      ],
    );
    return mapProperty(result.rows[0]!);
  }

  async updateProperty(
    propertyId: string,
    expectedVersion: bigint,
    patch: Record<string, unknown>,
  ) {
    const entries = Object.entries(patch).filter(
      ([key]) => UPDATE_COLUMNS[key],
    );
    if (!entries.length) return true;
    const assignments = entries.map(
      ([key], index) => `${UPDATE_COLUMNS[key]}=$${index + 3}`,
    );
    const deletionPredicate =
      Object.hasOwn(patch, "deletedAt") && patch.deletedAt === null
        ? "deleted_at is not null"
        : "deleted_at is null";
    const result = await this.client.query(
      `update public.properties set ${assignments.join(", ")}, version=version+1, updated_at=now()
      where id=$1 and version=$2 and ${deletionPredicate}`,
      [
        propertyId,
        expectedVersion.toString(),
        ...entries.map(([, value]) => value),
      ],
    );
    return result.rowCount === 1;
  }

  async insertPriceHistory(v: Record<string, unknown>) {
    await this.client.query(
      `insert into public.property_price_history
      (property_id,amount_minor,currency_code,effective_at,source,property_version,changed_by_user_identity_id,reason_code,idempotency_key)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        v.propertyId,
        v.amountMinor,
        v.currencyCode,
        v.effectiveAt,
        v.source,
        v.propertyVersion,
        v.changedByUserIdentityId,
        v.reasonCode,
        v.idempotencyKey,
      ],
    );
  }

  async insertStateHistory(v: Record<string, unknown>) {
    await this.client.query(
      `insert into public.property_state_history
      (property_id,from_state,to_state,changed_by_user_identity_id,intention_code,reason_code,property_version,idempotency_key,correlation_id,
       reservation_reference,reservation_advisor_id,reservation_expires_at,closing_amount_minor,closing_currency_code,closing_date)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        v.propertyId,
        v.fromState,
        v.toState,
        v.changedByUserIdentityId,
        v.intentionCode,
        v.reasonCode,
        v.propertyVersion,
        v.idempotencyKey,
        v.correlationId,
        v.reservationReference ?? null,
        v.reservationAdvisorId ?? null,
        v.reservationExpiresAt ?? null,
        v.closingAmountMinor ?? null,
        v.closingCurrencyCode ?? null,
        v.closingDate ?? null,
      ],
    );
  }

  async insertAdvisorAssignment(v: Record<string, unknown>) {
    await this.client.query(
      `insert into public.property_advisor_assignments
      (property_id,advisor_id,assignment_role,is_primary,assigned_by_user_identity_id,end_reason)
      values ($1,$2,$3,$4,$5,null)`,
      [
        v.propertyId,
        v.advisorId,
        v.assignmentRole,
        v.isPrimary,
        v.assignedByUserIdentityId,
      ],
    );
  }

  async insertAuditLog(v: Record<string, unknown>) {
    await this.client.query(
      `insert into public.audit_logs
      (actor_user_identity_id,action,target_type,target_id,outcome,correlation_id,request_id,change_summary,reason_code)
      values ($1,$2,$3,$4,'succeeded',$5,$6,$7,$8)`,
      [
        v.actorUserIdentityId,
        v.action,
        v.targetTable,
        v.targetId,
        v.correlationId,
        v.requestId,
        JSON.stringify(v.changeSummary ?? {}),
        v.reasonCode ?? null,
      ],
    );
  }

  async insertOutboxMessage(v: Record<string, unknown>) {
    await this.client.query(
      `insert into public.outbox_messages
      (event_name,owning_domain,aggregate_type,event_version,aggregate_id,correlation_id,idempotency_key,payload)
      values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        v.eventType,
        v.domainName,
        v.aggregateType,
        v.eventVersion,
        v.aggregateId,
        v.correlationId,
        v.idempotencyKey,
        JSON.stringify(v.payload ?? {}),
      ],
    );
  }
}

export class PostgresPropertyUnitOfWork implements PropertyUnitOfWork {
  constructor(private readonly pool: Pool = getLocalDatabasePool()) {}

  async transaction<T>(
    work: (tx: PropertyTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(new PostgresPropertyTransaction(client));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordDeniedCommand(
    context: PropertyCommandContext,
    propertyId: string,
    action: string,
    reasonCode: string,
  ): Promise<void> {
    await this.pool.query(
      `insert into public.audit_logs
        (actor_user_identity_id,action,target_type,target_id,outcome,correlation_id,request_id,change_summary,reason_code)
       values ($1,$2,'properties',$3,'denied',$4,$5,'{}'::jsonb,$6)`,
      [
        context.actor.identityId,
        action,
        propertyId,
        context.correlationId,
        context.requestId,
        reasonCode,
      ],
    );
  }
}
