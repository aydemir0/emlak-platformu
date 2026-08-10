import "server-only";

import type { Pool, PoolClient } from "pg";

import type {
  PublicLeadContact,
  PublicLeadTransaction,
  PublicLeadUnitOfWork,
} from "@/application/leads/create-public-lead";
import { getLocalDatabasePool } from "@/infrastructure/postgres/pool.server";

export type LeadRateLimitPolicy = Readonly<{
  maximumAttempts: number;
  windowMilliseconds: number;
}>;

class PostgresPublicLeadTransaction implements PublicLeadTransaction {
  constructor(
    private readonly client: PoolClient,
    private readonly rateLimitPolicy: LeadRateLimitPolicy,
  ) {}

  async findPublicEligibleProperty(
    publicId: string,
    options: { lock: boolean },
  ) {
    const result = await this.client.query<{ id: string; public_id: string }>(
      `select p.id,p.public_id
       from public.properties p
       join public.public_route_reservations rr on rr.id=p.current_route_reservation_id
       join public.listing_types lt on lt.id=p.listing_type_id
       where p.public_id=$1 and p.current_state='ACTIVE' and p.deleted_at is null
         and rr.retired_at is null and lt.code in ('SATILIK','KIRALIK')
         and exists(
           select 1 from public.property_media pm
           join public.property_media_variants v on v.property_media_id=pm.id
             and v.source_version=pm.source_version and v.recipe_version=pm.current_recipe_version
             and v.purged_at is null
           where pm.property_id=p.id and pm.state='READY' and pm.visibility='PUBLIC'
             and pm.deleted_at is null and pm.ready_at is not null
         )
       ${options.lock ? "for update of p" : ""}`,
      [publicId],
    );
    const row = result.rows[0];
    return row ? { id: row.id, publicId: row.public_id } : null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
    options: { lock: boolean },
  ) {
    const result = await this.client.query<{
      id: string;
      idempotency_fingerprint: string | null;
    }>(
      `select id,idempotency_fingerprint from public.leads where idempotency_key=$1
       ${options.lock ? "for update" : ""}`,
      [idempotencyKey],
    );
    const row = result.rows[0];
    return row
      ? { leadId: row.id, fingerprint: row.idempotency_fingerprint }
      : null;
  }

  async acquireRateLimit(
    input: Readonly<{ abuseNetworkSignal: string; now: Date }>,
  ) {
    await this.client.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [input.abuseNetworkSignal],
    );
    const result = await this.client.query<{ attempts: string }>(
      `select count(*)::text as attempts from public.leads
       where abuse_network_signal=$1 and created_at >= $2 and deleted_at is null`,
      [
        input.abuseNetworkSignal,
        new Date(input.now.getTime() - this.rateLimitPolicy.windowMilliseconds),
      ],
    );
    return (
      Number(result.rows[0]?.attempts ?? 0) <
      this.rateLimitPolicy.maximumAttempts
    );
  }

  async findDuplicateCandidateIds(
    propertyId: string,
    contacts: readonly PublicLeadContact[],
  ) {
    const normalized = contacts.filter(
      (contact): contact is PublicLeadContact & { normalizedValue: string } =>
        contact.normalizedValue !== null,
    );
    if (!normalized.length) return [];
    const result = await this.client.query<{ id: string }>(
      `select distinct l.id from public.lead_contact_intakes ci
       join public.leads l on l.id=ci.lead_id
       where l.property_id=$1 and l.deleted_at is null
         and (ci.channel,ci.normalized_value) in (
           select * from unnest($2::text[],$3::text[])
         )
       order by l.id limit 20`,
      [
        propertyId,
        normalized.map((contact) => contact.channel),
        normalized.map((contact) => contact.normalizedValue),
      ],
    );
    return result.rows.map((row) => row.id);
  }

  async insertLead(v: Record<string, unknown>) {
    const result = await this.client.query<{ id: string }>(
      `insert into public.leads
       (id,submission_id,property_id,assigned_advisor_id,status,source,name,email,phone,message,
        consent_kind,consented_at,idempotency_key,idempotency_fingerprint,abuse_network_signal)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [
        v.id,
        v.submissionId,
        v.propertyId,
        v.assignedAdvisorId,
        v.status,
        v.source,
        v.name,
        v.email,
        v.phone,
        v.message,
        v.consentKind,
        v.consentedAt,
        v.idempotencyKey,
        v.idempotencyFingerprint,
        v.abuseNetworkSignal,
      ],
    );
    return { id: result.rows[0]!.id };
  }

  async insertContactIntake(v: Record<string, unknown>) {
    await this.client.query(
      `insert into public.lead_contact_intakes
       (lead_id,channel,raw_value,normalized_value,normalization_algorithm,normalization_version,source)
       values($1,$2,$3,$4,$5,$6,$7)`,
      [
        v.leadId,
        v.channel,
        v.rawValue,
        v.normalizedValue,
        v.normalizationAlgorithm,
        v.normalizationVersion,
        v.source,
      ],
    );
  }

  async insertLeadActivity(v: Record<string, unknown>) {
    await this.client.query(
      `insert into public.lead_activities
       (lead_id,activity_type,occurred_at,correlation_id,source_idempotency_key,details)
       values($1,$2,$3,$4,$5,$6)`,
      [
        v.leadId,
        v.activityType,
        v.occurredAt,
        v.correlationId,
        v.sourceIdempotencyKey,
        JSON.stringify(v.details ?? {}),
      ],
    );
  }

  async insertAuditLog(v: Record<string, unknown>) {
    await this.client.query(
      `insert into public.audit_logs
       (action,target_type,target_id,outcome,correlation_id,request_id,change_summary)
       values($1,$2,$3,$4,$5,$6,$7)`,
      [
        v.action,
        v.targetType,
        v.targetId,
        v.outcome,
        v.correlationId,
        v.requestId,
        JSON.stringify(v.changeSummary ?? {}),
      ],
    );
  }

  async insertOutboxMessage(v: Record<string, unknown>) {
    await this.client.query(
      `insert into public.outbox_messages
       (event_name,owning_domain,aggregate_type,event_version,aggregate_id,correlation_id,idempotency_key,payload)
       values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        v.eventName,
        v.owningDomain,
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

export class PostgresPublicLeadUnitOfWork implements PublicLeadUnitOfWork {
  constructor(
    private readonly pool: Pool = getLocalDatabasePool(),
    private readonly rateLimitPolicy: LeadRateLimitPolicy = {
      maximumAttempts: 5,
      windowMilliseconds: 15 * 60 * 1_000,
    },
  ) {}

  async transaction<T>(
    work: (tx: PublicLeadTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(
        new PostgresPublicLeadTransaction(client, this.rateLimitPolicy),
      );
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
