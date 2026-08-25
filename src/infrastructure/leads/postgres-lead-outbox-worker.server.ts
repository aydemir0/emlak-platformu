import "server-only";

import type { Pool } from "pg";

import type {
  ClaimedLeadOutboxMessage,
  LeadOutboxFailure,
  LeadOutboxWorkerRepository,
} from "@/application/leads/lead-outbox-worker";
import { WorkerLeaseLostError } from "@/application/observability/worker-run";
import { getDatabasePool } from "@/infrastructure/postgres/pool.server";

export class PostgresLeadOutboxWorkerRepository implements LeadOutboxWorkerRepository {
  constructor(private readonly pool: Pick<Pool, "query"> = getDatabasePool()) {}

  async claim(workerId: string, limit: number, leaseMs: number) {
    const result = await this.pool.query(
      `with candidates as (
         select id,status='PROCESSING' as recovered_stale_lease
         from public.outbox_messages
         where event_name in ('lead.notification_requested','lead.analytics_requested')
           and ((status='PENDING' and next_attempt_at <= now())
             or (status='PROCESSING' and lease_expires_at <= now()))
         order by next_attempt_at, created_at, id
         for update skip locked
         limit $1
       )
       update public.outbox_messages message
       set status='PROCESSING',
           attempt_count=message.attempt_count+1,
           lease_owner=$2,
           lease_expires_at=now()+($3::bigint * interval '1 millisecond'),
           last_attempt_at=now(),
           last_error_code=null
       from candidates
       where message.id=candidates.id
       returning message.id,message.event_name,message.payload,message.correlation_id,
                 message.idempotency_key,message.attempt_count,
                 candidates.recovered_stale_lease`,
      [limit, workerId, leaseMs],
    );
    return result.rows.map((row): ClaimedLeadOutboxMessage => ({
      id: row.id,
      eventName: row.event_name,
      payload: row.payload,
      correlationId: row.correlation_id,
      idempotencyKey: row.idempotency_key,
      attemptCount: row.attempt_count,
      recoveredStaleLease: row.recovered_stale_lease,
    }));
  }

  async markProcessed(messageId: string, workerId: string) {
    const result = await this.pool.query(
      `update public.outbox_messages
       set status='PROCESSED', lease_owner=null, lease_expires_at=null,
           processed_at=now(), last_error_code=null
       where id=$1 and status='PROCESSING' and lease_owner=$2 and lease_expires_at>now()`,
      [messageId, workerId],
    );
    if (result.rowCount !== 1)
      throw new WorkerLeaseLostError("lead.outbox", messageId);
  }

  async markFailed(
    messageId: string,
    workerId: string,
    failure: LeadOutboxFailure,
    retryDelayMs: number,
  ) {
    if (failure.retryable) {
      const result = await this.pool.query(
        `update public.outbox_messages
         set status='PENDING', lease_owner=null, lease_expires_at=null,
             next_attempt_at=now()+($3::bigint * interval '1 millisecond'),
             last_error_code=$4
         where id=$1 and status='PROCESSING' and lease_owner=$2 and lease_expires_at>now()`,
        [messageId, workerId, retryDelayMs, failure.code],
      );
      if (result.rowCount !== 1)
        throw new WorkerLeaseLostError("lead.outbox", messageId);
      return;
    }
    const result = await this.pool.query(
      `update public.outbox_messages
       set status='DEAD_LETTER', lease_owner=null, lease_expires_at=null,
           dead_lettered_at=now(), last_error_code=$3
       where id=$1 and status='PROCESSING' and lease_owner=$2 and lease_expires_at>now()`,
      [messageId, workerId, failure.code],
    );
    if (result.rowCount !== 1)
      throw new WorkerLeaseLostError("lead.outbox", messageId);
  }
}
