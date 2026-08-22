import "server-only";

import type { Pool } from "pg";

import type {
  ClaimedLeadOutboxMessage,
  LeadOutboxFailure,
  LeadOutboxWorkerRepository,
} from "@/application/leads/lead-outbox-worker";
import { getDatabasePool } from "@/infrastructure/postgres/pool.server";

export class PostgresLeadOutboxWorkerRepository implements LeadOutboxWorkerRepository {
  constructor(private readonly pool: Pick<Pool, "query"> = getDatabasePool()) {}

  async claim(workerId: string, limit: number, leaseMs: number) {
    const result = await this.pool.query(
      `with candidates as (
         select id
         from public.outbox_messages
         where (status='PENDING' and next_attempt_at <= now())
            or (status='PROCESSING' and lease_expires_at <= now())
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
                 message.idempotency_key,message.attempt_count`,
      [limit, workerId, leaseMs],
    );
    return result.rows.map((row): ClaimedLeadOutboxMessage => ({
      id: row.id,
      eventName: row.event_name,
      payload: row.payload,
      correlationId: row.correlation_id,
      idempotencyKey: row.idempotency_key,
      attemptCount: row.attempt_count,
    }));
  }

  async markProcessed(messageId: string, workerId: string) {
    await this.pool.query(
      `update public.outbox_messages
       set status='PROCESSED', lease_owner=null, lease_expires_at=null,
           processed_at=now(), last_error_code=null
       where id=$1 and status='PROCESSING' and lease_owner=$2`,
      [messageId, workerId],
    );
  }

  async markFailed(
    messageId: string,
    workerId: string,
    failure: LeadOutboxFailure,
    retryDelayMs: number,
  ) {
    if (failure.retryable) {
      await this.pool.query(
        `update public.outbox_messages
         set status='PENDING', lease_owner=null, lease_expires_at=null,
             next_attempt_at=now()+($3::bigint * interval '1 millisecond'),
             last_error_code=$4
         where id=$1 and status='PROCESSING' and lease_owner=$2`,
        [messageId, workerId, retryDelayMs, failure.code],
      );
      return;
    }
    await this.pool.query(
      `update public.outbox_messages
       set status='DEAD_LETTER', lease_owner=null, lease_expires_at=null,
           dead_lettered_at=now(), last_error_code=$3
       where id=$1 and status='PROCESSING' and lease_owner=$2`,
      [messageId, workerId, failure.code],
    );
  }
}
