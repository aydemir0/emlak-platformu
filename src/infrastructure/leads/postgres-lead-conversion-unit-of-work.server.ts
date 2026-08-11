import "server-only";

import type { Pool, PoolClient } from "pg";

import type { StaffPrincipal } from "@/application/auth/staff-principal";
import type {
  LeadConversionTransaction,
  LeadConversionUnitOfWork,
  LeadForConversion,
  PersistedLeadConversion,
} from "@/application/leads/convert-lead-to-customer";
import type { ContactIdentity } from "@/domain/leads/lead-conversion-policy";
import { getLocalDatabasePool } from "@/infrastructure/postgres/pool.server";

class PostgresLeadConversionTransaction implements LeadConversionTransaction {
  constructor(private readonly client: PoolClient) {}

  async lockLead(id: string): Promise<LeadForConversion | null> {
    const result = await this.client.query(
      `select id,status,assigned_advisor_id,deleted_at,name,email,phone
       from public.leads where id=$1 for update`,
      [id],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          status: row.status,
          assignedAdvisorId: row.assigned_advisor_id,
          deletedAt: row.deleted_at,
          name: row.name,
          email: row.email,
          phone: row.phone,
        }
      : null;
  }

  async findExistingConversion(
    leadId: string,
  ): Promise<PersistedLeadConversion | null> {
    const result = await this.client.query(
      `select lead_id,customer_id,customer_request_id,outcome,resolution_kind,converted_at
       from public.lead_conversions where lead_id=$1`,
      [leadId],
    );
    const row = result.rows[0];
    return row
      ? {
          leadId: row.lead_id,
          customerId: row.customer_id,
          customerRequestId: row.customer_request_id,
          outcome: row.outcome,
          resolutionKind: row.resolution_kind,
          convertedAt: row.converted_at,
        }
      : null;
  }

  async currentAdvisorId(identityId: string): Promise<string | null> {
    const result = await this.client.query(
      `select id from public.advisors
       where user_identity_id=$1 and status='active' and deleted_at is null`,
      [identityId],
    );
    return result.rows[0]?.id ?? null;
  }

  async canManageCustomer(
    customerId: string,
    actor: StaffPrincipal,
    advisorId: string | null,
  ): Promise<boolean> {
    const result = await this.client.query(
      `select 1 from public.customers
       where id=$1 and deleted_at is null and status <> 'ERASED'
         and ($2='ADMIN' or assigned_advisor_id=$3)`,
      [customerId, actor.role, advisorId],
    );
    return result.rowCount === 1;
  }

  async findTrustedIdentityCandidates(identities: readonly ContactIdentity[]) {
    if (!identities.length) return [];
    const result = await this.client.query<{
      customer_id: string;
      channel: ContactIdentity["channel"];
      normalized_value: string;
    }>(
      `select distinct cp.customer_id,cp.channel,cp.normalized_value
       from public.customer_contact_points cp
       join public.customers c on c.id=cp.customer_id
       where cp.deleted_at is null and cp.verification_status='VERIFIED'
         and c.deleted_at is null and c.status <> 'ERASED'
         and (cp.channel,cp.normalized_value) in (
           select * from unnest($1::text[],$2::text[])
         )
       order by cp.customer_id,cp.channel,cp.normalized_value`,
      [
        identities.map((identity) => identity.channel),
        identities.map((identity) => identity.normalizedValue),
      ],
    );
    return result.rows.map((row) => ({
      customerId: row.customer_id,
      identity: {
        channel: row.channel,
        normalizedValue: row.normalized_value,
      },
    }));
  }

  async createCustomer(
    values: Readonly<{
      displayName: string;
      assignedAdvisorId: string | null;
    }>,
  ) {
    const result = await this.client.query<{ id: string }>(
      `insert into public.customers(display_name,assigned_advisor_id)
       values($1,$2) returning id`,
      [values.displayName, values.assignedAdvisorId],
    );
    return { id: result.rows[0]!.id };
  }

  async createCustomerContactPoints(
    customerId: string,
    contacts: readonly Readonly<{
      channel: ContactIdentity["channel"];
      displayValue: string;
      normalizedValue: string;
    }>[],
  ): Promise<void> {
    if (!contacts.length) return;
    await this.client.query(
      `insert into public.customer_contact_points(
        customer_id,channel,display_value,normalized_value,is_primary,
        verification_status,normalization_version,source
      )
      select $1,contact_channel,display_value,normalized_value,true,
        'UNVERIFIED','v1','LEAD_CONVERSION'
      from unnest($2::text[],$3::text[],$4::text[])
        as contact_values(contact_channel,display_value,normalized_value)`,
      [
        customerId,
        contacts.map((contact) => contact.channel),
        contacts.map((contact) => contact.displayValue),
        contacts.map((contact) => contact.normalizedValue),
      ],
    );
  }

  async createInitialRequest(customerId: string) {
    const result = await this.client.query<{ id: string }>(
      `insert into public.customer_requests(
        customer_id,status,matching_location_state,matching_budget_state,
        matching_property_type_state,matching_rooms_state,matching_net_area_state,
        matching_features_state
      ) values($1,'DRAFT','MISSING','MISSING','MISSING','MISSING','MISSING','MISSING')
      returning id`,
      [customerId],
    );
    return { id: result.rows[0]!.id };
  }

  async insertConversion(
    values: Parameters<LeadConversionTransaction["insertConversion"]>[0],
  ): Promise<PersistedLeadConversion> {
    const result = await this.client.query(
      `insert into public.lead_conversions(
        lead_id,customer_id,customer_request_id,converted_by_user_identity_id,
        outcome,resolution_code,resolution_kind,resolution_evidence_code,
        idempotency_key,correlation_id
      ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      returning lead_id,customer_id,customer_request_id,outcome,resolution_kind,converted_at`,
      [
        values.leadId,
        values.customerId,
        values.customerRequestId,
        values.actorUserIdentityId,
        values.outcome,
        values.resolutionKind,
        values.resolutionKind,
        values.resolutionEvidenceCode,
        values.idempotencyKey,
        values.correlationId,
      ],
    );
    const row = result.rows[0]!;
    return {
      leadId: row.lead_id,
      customerId: row.customer_id,
      customerRequestId: row.customer_request_id,
      outcome: row.outcome,
      resolutionKind: row.resolution_kind,
      convertedAt: row.converted_at,
    };
  }

  async transitionLeadToWon(leadId: string): Promise<boolean> {
    const result = await this.client.query(
      `update public.leads set status='WON',version=version+1,updated_at=now()
       where id=$1 and status='NEGOTIATION' and deleted_at is null`,
      [leadId],
    );
    return result.rowCount === 1;
  }

  async insertActivity(
    values: Parameters<LeadConversionTransaction["insertActivity"]>[0],
  ): Promise<void> {
    await this.client.query(
      `insert into public.lead_activities(
        lead_id,activity_type,occurred_at,correlation_id,source_idempotency_key,details
      ) values($1,'CONVERSION_RECORDED',now(),$2,$3,$4)`,
      [
        values.leadId,
        values.correlationId,
        values.sourceIdempotencyKey,
        JSON.stringify(values.details),
      ],
    );
  }

  async insertAudit(
    values: Parameters<LeadConversionTransaction["insertAudit"]>[0],
  ): Promise<void> {
    await this.client.query(
      `insert into public.audit_logs(
        actor_user_identity_id,action,target_type,target_id,outcome,
        correlation_id,request_id,change_summary
      ) values($1,'lead.converted','lead',$2,'succeeded',$3,$4,$5)`,
      [
        values.actorUserIdentityId,
        values.leadId,
        values.correlationId,
        values.requestId,
        JSON.stringify(values.changeSummary),
      ],
    );
  }
}

export class PostgresLeadConversionUnitOfWork implements LeadConversionUnitOfWork {
  constructor(private readonly pool: Pool = getLocalDatabasePool()) {}

  async transaction<T>(
    work: (tx: LeadConversionTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(new PostgresLeadConversionTransaction(client));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordAuthorizationDenial(
    values: Parameters<
      LeadConversionUnitOfWork["recordAuthorizationDenial"]
    >[0],
  ): Promise<void> {
    await this.pool.query(
      `insert into public.audit_logs(
        actor_user_identity_id,action,target_type,target_id,outcome,
        correlation_id,request_id,change_summary,reason_code
      ) values($1,$2,'lead',$3,'denied',$4,$5,'{}'::jsonb,$6)`,
      [
        values.actorUserIdentityId,
        values.action,
        values.targetId,
        values.correlationId,
        values.requestId,
        values.reasonCode,
      ],
    );
  }
}
