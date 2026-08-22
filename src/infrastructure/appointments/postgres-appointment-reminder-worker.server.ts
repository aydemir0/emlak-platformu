import "server-only";
import type { Pool } from "pg";
import type { AppointmentReminderWorkerRepository } from "@/application/appointments/appointment-reminder-outbox";
import { getDatabasePool } from "@/infrastructure/postgres/pool.server";

export class PostgresAppointmentReminderWorkerRepository implements AppointmentReminderWorkerRepository {
  constructor(private readonly pool: Pick<Pool, "query"> = getDatabasePool()) {}
  async claim(workerId: string, limit: number, leaseMs: number) {
    const result = await this.pool.query(
      "with candidates as (select id from public.outbox_messages where event_name='appointment.reminder_requested.v1' and ((status='PENDING' and next_attempt_at <= now()) or (status='PROCESSING' and lease_expires_at <= now())) order by next_attempt_at,created_at,id for update skip locked limit $1) update public.outbox_messages message set status='PROCESSING',attempt_count=message.attempt_count+1,lease_owner=$2,lease_expires_at=now()+($3::bigint * interval '1 millisecond'),last_attempt_at=now(),last_error_code=null from candidates where message.id=candidates.id returning message.id,message.payload,message.correlation_id,message.idempotency_key,message.attempt_count",
      [limit, workerId, leaseMs],
    );
    return result.rows.map((row) => ({
      id: row.id,
      payload: row.payload,
      correlationId: row.correlation_id,
      idempotencyKey: row.idempotency_key,
      attemptCount: row.attempt_count,
    }));
  }
  async currentAppointment(id: string) {
    const result = await this.pool.query(
      "select version::text,status,starts_at,deleted_at from public.appointments where id=$1",
      [id],
    );
    const row = result.rows[0];
    return row
      ? {
          version: BigInt(row.version),
          status: row.status,
          startsAt: row.starts_at,
          deletedAt: row.deleted_at,
        }
      : null;
  }
  async markProcessed(id: string, workerId: string) {
    await this.pool.query(
      "update public.outbox_messages set status='PROCESSED',lease_owner=null,lease_expires_at=null,processed_at=now(),last_error_code=null where id=$1 and status='PROCESSING' and lease_owner=$2",
      [id, workerId],
    );
  }
  async markFailed(
    id: string,
    workerId: string,
    failure: { code: string; retryable: boolean },
    retryDelayMs: number,
  ) {
    await this.pool.query(
      failure.retryable
        ? "update public.outbox_messages set status='PENDING',lease_owner=null,lease_expires_at=null,next_attempt_at=now()+($3::bigint * interval '1 millisecond'),last_error_code=$4 where id=$1 and status='PROCESSING' and lease_owner=$2"
        : "update public.outbox_messages set status='DEAD_LETTER',lease_owner=null,lease_expires_at=null,dead_lettered_at=now(),last_error_code=$3 where id=$1 and status='PROCESSING' and lease_owner=$2",
      failure.retryable
        ? [id, workerId, retryDelayMs, failure.code]
        : [id, workerId, failure.code],
    );
  }
}
