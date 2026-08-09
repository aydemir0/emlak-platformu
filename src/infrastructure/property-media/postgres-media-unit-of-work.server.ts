import "server-only";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type {
  MediaCommandContext,
  MediaRecord,
  UploadSessionRecord,
} from "@/application/property-media/media-contracts";
import type {
  MediaTransaction,
  MediaUnitOfWork,
} from "@/application/property-media/media-ports";
import type {
  MediaWorkerRepository,
  ProcessingClaim,
} from "@/application/property-media/media-worker-ports";
import { getLocalDatabasePool } from "@/infrastructure/postgres/pool.server";

type SessionRow = QueryResultRow & {
  id: string;
  property_id: string;
  planned_property_media_id: string;
  initiated_by_user_identity_id: string;
  object_key: string;
  idempotency_key: string;
  expected_mime_type: string;
  expected_checksum_sha256: string | null;
  maximum_bytes: string;
  status: UploadSessionRecord["status"];
  expires_at: Date;
  version: string;
};
type MediaRow = QueryResultRow & {
  id: string;
  property_id: string;
  state: MediaRecord["state"];
  visibility: MediaRecord["visibility"];
  source_version: number;
  sort_order: number;
  is_cover: boolean;
  version: string;
  deleted_at: Date | null;
  failure_retryable: boolean | null;
};

const SESSION_COLUMNS = `id,property_id,planned_property_media_id,initiated_by_user_identity_id,object_key,
  idempotency_key,expected_mime_type,expected_checksum_sha256,maximum_bytes,status,expires_at,version`;
const MEDIA_COLUMNS = `id,property_id,state,visibility,source_version,sort_order,is_cover,version,deleted_at,failure_retryable`;

function mapSession(row: SessionRow): UploadSessionRecord {
  return {
    id: row.id,
    propertyId: row.property_id,
    plannedMediaId: row.planned_property_media_id,
    initiatedByIdentityId: row.initiated_by_user_identity_id,
    objectKey: row.object_key,
    idempotencyKey: row.idempotency_key,
    expectedMimeType: row.expected_mime_type,
    expectedChecksumSha256: row.expected_checksum_sha256,
    maximumBytes: Number(row.maximum_bytes),
    status: row.status,
    expiresAt: row.expires_at,
    version: BigInt(row.version),
  };
}
function mapMedia(row: MediaRow): MediaRecord {
  return {
    id: row.id,
    propertyId: row.property_id,
    state: row.state,
    visibility: row.visibility,
    sourceVersion: row.source_version,
    sortOrder: row.sort_order,
    isCover: row.is_cover,
    version: BigInt(row.version),
    deletedAt: row.deleted_at,
    failureRetryable: row.failure_retryable,
  };
}

class PostgresMediaTransaction implements MediaTransaction {
  constructor(private readonly client: PoolClient) {}

  async loadAuthorizationFacts(context: MediaCommandContext) {
    const result = await this.client.query<{
      active: boolean;
      role: "ADMIN" | "ADVISOR";
      advisor_id: string | null;
      permissions: string[];
    }>(
      `select ui.status='active' and ui.deleted_at is null as active,r.code as role,a.id as advisor_id,
      coalesce(array_agg(distinct p.code) filter(where p.code is not null),'{}') as permissions
      from public.user_identities ui
      join public.user_role_assignments ura on ura.user_identity_id=ui.id and ura.status='ACTIVE'
        and (ura.expires_at is null or ura.expires_at>statement_timestamp())
      join public.roles r on r.id=ura.role_id and r.status='active' and r.deleted_at is null
      left join public.role_permissions rp on rp.role_id=r.id
      left join public.permissions p on p.id=rp.permission_id and p.status='active' and p.deleted_at is null
      left join public.advisors a on a.user_identity_id=ui.id and a.status='active' and a.deleted_at is null
      where ui.id=$1 group by ui.id,r.code,a.id limit 1`,
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
      `select 1 from public.property_advisor_assignments
      where property_id=$1 and advisor_id=$2 and ended_at is null`,
      [propertyId, advisorId],
    );
    return result.rowCount === 1;
  }
  async propertyIsCommandable(propertyId: string, options: { lock: boolean }) {
    const result = await this.client.query(
      `select 1 from public.properties where id=$1 and deleted_at is null
      ${options.lock ? "for update" : ""}`,
      [propertyId],
    );
    return result.rowCount === 1;
  }
  async findUploadSessionByIdempotencyKey(
    key: string,
    options: { lock: boolean },
  ) {
    const result = await this.client.query<SessionRow>(
      `select ${SESSION_COLUMNS} from public.media_upload_sessions
      where idempotency_key=$1 ${options.lock ? "for update" : ""}`,
      [key],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }
  async getUploadSession(id: string, options: { lock: boolean }) {
    const result = await this.client.query<SessionRow>(
      `select ${SESSION_COLUMNS} from public.media_upload_sessions
      where id=$1 ${options.lock ? "for update" : ""}`,
      [id],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }
  async insertUploadSession(s: UploadSessionRecord) {
    await this.client.query(
      `insert into public.media_upload_sessions
      (id,property_id,planned_property_media_id,initiated_by_user_identity_id,object_key,idempotency_key,
       expected_mime_type,expected_checksum_sha256,maximum_bytes,status,expires_at,version)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        s.id,
        s.propertyId,
        s.plannedMediaId,
        s.initiatedByIdentityId,
        s.objectKey,
        s.idempotencyKey,
        s.expectedMimeType,
        s.expectedChecksumSha256,
        s.maximumBytes,
        s.status,
        s.expiresAt,
        s.version.toString(),
      ],
    );
  }
  async getMediaByUploadSession(sessionId: string) {
    const result = await this.client.query<MediaRow>(
      `select ${MEDIA_COLUMNS} from public.property_media
      where upload_session_id=$1`,
      [sessionId],
    );
    return result.rows[0] ? mapMedia(result.rows[0]) : null;
  }
  async getMedia(mediaId: string, options: { lock: boolean }) {
    const result = await this.client.query<MediaRow>(
      `select ${MEDIA_COLUMNS} from public.property_media
      where id=$1 ${options.lock ? "for update" : ""}`,
      [mediaId],
    );
    return result.rows[0] ? mapMedia(result.rows[0]) : null;
  }
  async getPropertyVersion(propertyId: string, options: { lock: boolean }) {
    const result = await this.client.query<{ version: string }>(
      `select version from public.properties
      where id=$1 and deleted_at is null ${options.lock ? "for update" : ""}`,
      [propertyId],
    );
    return result.rows[0] ? BigInt(result.rows[0].version) : null;
  }
  async listActiveMedia(propertyId: string, options: { lock: boolean }) {
    const result = await this.client.query<MediaRow>(
      `select ${MEDIA_COLUMNS} from public.property_media
      where property_id=$1 and deleted_at is null and state<>'DELETED' order by id
      ${options.lock ? "for update" : ""}`,
      [propertyId],
    );
    return result.rows.map(mapMedia);
  }
  async applyOrdering(
    propertyId: string,
    items: readonly { mediaId: string; sortOrder: number; isCover: boolean }[],
  ) {
    if (!items.length) return;
    await this.client.query(
      `update public.property_media set sort_order=sort_order+1000000,is_cover=false
      where property_id=$1 and deleted_at is null and state<>'DELETED'`,
      [propertyId],
    );
    const result = await this.client.query(
      `update public.property_media pm set sort_order=v.sort_order,
      is_cover=v.is_cover,version=pm.version+1,updated_at=now()
      from unnest($2::uuid[],$3::int[],$4::boolean[]) as v(id,sort_order,is_cover)
      where pm.property_id=$1 and pm.id=v.id and pm.deleted_at is null and pm.state<>'DELETED'`,
      [
        propertyId,
        items.map((item) => item.mediaId),
        items.map((item) => item.sortOrder),
        items.map((item) => item.isCover),
      ],
    );
    if (result.rowCount !== items.length) throw new Error("MEDIA_CONFLICT");
  }
  async softDeleteMedia(input: {
    mediaId: string;
    actorIdentityId: string;
    reasonCode: string;
    now: Date;
  }) {
    const result = await this.client.query(
      `update public.property_media set state='DELETED',visibility='PRIVATE',
      is_cover=false,current_recipe_version=null,failure_code=null,failure_retryable=null,ready_at=null,
      deleted_at=$2,deleted_by_user_identity_id=$3,deletion_reason_code=$4,version=version+1,updated_at=$2
      where id=$1 and deleted_at is null and state<>'DELETED'`,
      [input.mediaId, input.now, input.actorIdentityId, input.reasonCode],
    );
    if (result.rowCount !== 1) throw new Error("MEDIA_CONFLICT");
  }
  async restoreMedia(input: { mediaId: string; now: Date }) {
    const result = await this.client.query(
      `update public.property_media pm set state='UPLOADED',
      visibility='PRIVATE',sort_order=(select coalesce(max(x.sort_order),0)+1 from public.property_media x
        where x.property_id=pm.property_id and x.deleted_at is null and x.state<>'DELETED'),
      is_cover=not exists(select 1 from public.property_media x where x.property_id=pm.property_id
        and x.deleted_at is null and x.state<>'DELETED' and x.is_cover),
      current_recipe_version=null,failure_code=null,failure_retryable=null,ready_at=null,
      deleted_at=null,deleted_by_user_identity_id=null,deletion_reason_code=null,
      version=version+1,updated_at=$2 where pm.id=$1 and pm.state='DELETED' and pm.deleted_at is not null
      and pm.purged_at is null`,
      [input.mediaId, input.now],
    );
    if (result.rowCount !== 1) throw new Error("MEDIA_CONFLICT");
  }
  async retryMedia(input: {
    mediaId: string;
    expectedVersion: bigint;
    now: Date;
  }) {
    const result = await this.client.query(
      `update public.property_media set state='UPLOADED',
      visibility='PRIVATE',failure_code=null,failure_retryable=null,current_recipe_version=null,
      ready_at=null,version=version+1,updated_at=$3 where id=$1 and version=$2 and state='FAILED'
      and failure_retryable=true and deleted_at is null`,
      [input.mediaId, input.expectedVersion.toString(), input.now],
    );
    return result.rowCount === 1;
  }
  async bumpPropertyVersion(propertyId: string, expectedVersion: bigint) {
    const result = await this.client.query(
      `update public.properties set version=version+1,updated_at=now()
      where id=$1 and version=$2 and deleted_at is null`,
      [propertyId, expectedVersion.toString()],
    );
    return result.rowCount === 1;
  }
  async finalizeUpload(
    input: Parameters<MediaTransaction["finalizeUpload"]>[0],
  ) {
    const active = await this.client.query<{
      sort_order: number;
      is_cover: boolean;
    }>(
      `select sort_order,is_cover
      from public.property_media where property_id=$1 and deleted_at is null and state<>'DELETED'
      order by id for update`,
      [input.session.propertyId],
    );
    const position =
      Math.max(0, ...active.rows.map((row) => row.sort_order)) + 1;
    const cover = !active.rows.some((row) => row.is_cover);
    const finalized = await this.client.query(
      `update public.media_upload_sessions set status='FINALIZED',finalized_at=now(),
      uploaded_byte_size=$2,uploaded_checksum_sha256=$3,uploaded_etag=$4,uploaded_at=$5,
      version=version+1,updated_at=now() where id=$1 and status='REQUESTED'`,
      [
        input.session.id,
        input.observedByteSize,
        input.observedChecksumSha256,
        input.observedEtag,
        input.observedAt,
      ],
    );
    if (finalized.rowCount !== 1) throw new Error("MEDIA_CONFLICT");
    const inserted = await this.client.query<MediaRow>(
      `insert into public.property_media
      (id,property_id,upload_session_id,state,visibility,media_role,source_version,sort_order,is_cover,
       created_by_user_identity_id) values($1,$2,$3,'UPLOADED','PRIVATE','PROPERTY_IMAGE',1,$4,$5,$6)
      returning ${MEDIA_COLUMNS}`,
      [
        input.session.plannedMediaId,
        input.session.propertyId,
        input.session.id,
        position,
        cover,
        input.actorIdentityId,
      ],
    );
    await this.insertAuditLog({
      actorUserIdentityId: input.actorIdentityId,
      action: "property_media.upload_finalized",
      targetTable: "property_media",
      targetId: input.session.plannedMediaId,
      correlationId: input.correlationId,
      requestId: input.requestId,
      changeSummary: { state: "UPLOADED" },
    });
    await this.insertOutboxMessage({
      eventType: "property_media.processing_requested",
      domainName: "property-media",
      aggregateType: "property_media",
      eventVersion: 1,
      aggregateId: input.session.plannedMediaId,
      correlationId: input.correlationId,
      idempotencyKey: `${input.session.id}:processing:1`,
      payload: { sourceVersion: 1 },
    });
    return mapMedia(inserted.rows[0]!);
  }
  async insertAuditLog(v: Record<string, unknown>) {
    await this.client.query(
      `insert into public.audit_logs
      (actor_user_identity_id,action,target_type,target_id,outcome,correlation_id,request_id,change_summary,reason_code)
      values($1,$2,$3,$4,'succeeded',$5,$6,$7,$8)`,
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
      values($1,$2,$3,$4,$5,$6,$7,$8)`,
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

export class PostgresMediaUnitOfWork implements MediaUnitOfWork {
  constructor(private readonly pool: Pool = getLocalDatabasePool()) {}
  async transaction<T>(work: (tx: MediaTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(new PostgresMediaTransaction(client));
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
    context: MediaCommandContext,
    propertyId: string,
    action: string,
    reasonCode: string,
  ) {
    await this.pool.query(
      `insert into public.audit_logs
      (actor_user_identity_id,action,target_type,target_id,outcome,correlation_id,request_id,change_summary,reason_code)
      values($1,$2,'properties',$3,'denied',$4,$5,'{}'::jsonb,$6)`,
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

export class PostgresMediaWorkerRepository implements MediaWorkerRepository {
  constructor(private readonly pool: Pool = getLocalDatabasePool()) {}

  async claimNext(input: Parameters<MediaWorkerRepository["claimNext"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const expired = await client.query<ProcessingClaim & QueryResultRow>(
        `select
        mpa.id as "attemptId",pm.id as "mediaId",pm.property_id as "propertyId",
        pm.source_version as "sourceVersion",mus.object_key as "sourceObjectKey",
        mus.expected_mime_type as "declaredMimeType",mus.maximum_bytes::int as "maximumBytes",
        mus.uploaded_checksum_sha256 as "uploadedChecksumSha256",
        $1::text as "leaseOwner",($2::timestamptz + make_interval(secs=>$3::int)) as "leaseExpiresAt"
        from public.media_processing_attempts mpa
        join public.property_media pm on pm.id=mpa.property_media_id
        join public.media_upload_sessions mus on mus.id=pm.upload_session_id
        where pm.state='PROCESSING' and pm.deleted_at is null and mpa.status='CLAIMED'
          and mpa.lease_expires_at <= $2 and mpa.source_version=pm.source_version
        order by mpa.lease_expires_at,mpa.id for update of pm,mpa skip locked limit 1`,
        [input.workerId, input.now, input.leaseSeconds],
      );
      if (expired.rows[0]) {
        await client.query(
          `update public.media_processing_attempts set lease_owner=$2,
          lease_expires_at=$3::timestamptz+make_interval(secs=>$4::int),heartbeat_at=$3
          where id=$1`,
          [
            expired.rows[0].attemptId,
            input.workerId,
            input.now,
            input.leaseSeconds,
          ],
        );
        await client.query("commit");
        return expired.rows[0];
      }
      const candidate = await client.query<{
        media_id: string;
        property_id: string;
        source_version: number;
        object_key: string;
        expected_mime_type: string;
        maximum_bytes: number;
        uploaded_checksum_sha256: string;
        attempt_number: number;
      }>(`select pm.id as media_id,pm.property_id,pm.source_version,mus.object_key,
        mus.expected_mime_type,mus.maximum_bytes::int,mus.uploaded_checksum_sha256,
        coalesce((select max(a.attempt_number) from public.media_processing_attempts a
          where a.property_media_id=pm.id),0)::int+1 as attempt_number
        from public.property_media pm join public.media_upload_sessions mus on mus.id=pm.upload_session_id
        where pm.state='UPLOADED' and pm.deleted_at is null and mus.status='FINALIZED'
        order by pm.updated_at,pm.id for update of pm skip locked limit 1`);
      const row = candidate.rows[0];
      if (!row) {
        await client.query("commit");
        return null;
      }
      const attempt = await client.query<{ id: string }>(
        `insert into public.media_processing_attempts
        (property_media_id,attempt_number,source_version,recipe_version,status,lease_owner,lease_expires_at,
         heartbeat_at,correlation_id,idempotency_key,started_at,processor_version)
        values($1::uuid,$2::int,$3::int,$4,'CLAIMED',$5,$6::timestamptz+make_interval(secs=>$7::int),$6,
          gen_random_uuid(),$1::uuid::text||':'||$3::int::text||':'||$2::int::text,$6,$8) returning id`,
        [
          row.media_id,
          row.attempt_number,
          row.source_version,
          input.recipeVersion,
          input.workerId,
          input.now,
          input.leaseSeconds,
          input.processorVersion,
        ],
      );
      await client.query(
        `update public.property_media set state='PROCESSING',processor_version=$2,
        failure_code=null,failure_retryable=null,version=version+1,updated_at=$3 where id=$1`,
        [row.media_id, input.processorVersion, input.now],
      );
      await client.query("commit");
      return {
        attemptId: attempt.rows[0]!.id,
        mediaId: row.media_id,
        propertyId: row.property_id,
        sourceVersion: row.source_version,
        sourceObjectKey: row.object_key,
        declaredMimeType: row.expected_mime_type,
        maximumBytes: row.maximum_bytes,
        uploadedChecksumSha256: row.uploaded_checksum_sha256,
        leaseOwner: input.workerId,
        leaseExpiresAt: new Date(
          input.now.getTime() + input.leaseSeconds * 1000,
        ),
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async complete(input: Parameters<MediaWorkerRepository["complete"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const guarded = await client.query(
        `select 1 from public.property_media pm
        join public.media_processing_attempts a on a.property_media_id=pm.id
        where pm.id=$1 and pm.state='PROCESSING' and pm.deleted_at is null
          and pm.source_version=$2 and a.id=$3 and a.status='CLAIMED'
          and a.lease_owner=$4 and a.lease_expires_at>$5 for update of pm,a`,
        [
          input.claim.mediaId,
          input.claim.sourceVersion,
          input.claim.attemptId,
          input.claim.leaseOwner,
          input.now,
        ],
      );
      if (guarded.rowCount !== 1) throw new Error("MEDIA_CONFLICT");
      await client.query(
        `insert into public.property_media_variants
        (property_media_id,source_version,recipe_version,format,width_px,height_px,byte_size,object_key,checksum_sha256)
        select $1,v.source_version,v.recipe_version,v.format,v.width_px,v.height_px,v.byte_size,v.object_key,v.checksum
        from unnest($2::int[],$3::text[],$4::text[],$5::int[],$6::int[],$7::bigint[],$8::text[],$9::text[])
          as v(source_version,recipe_version,format,width_px,height_px,byte_size,object_key,checksum)
        on conflict(property_media_id,source_version,recipe_version,width_px,format) do nothing`,
        [
          input.claim.mediaId,
          input.variants.map((v) => v.sourceVersion),
          input.variants.map((v) => v.recipeVersion),
          input.variants.map((v) => v.format),
          input.variants.map((v) => v.widthPx),
          input.variants.map((v) => v.heightPx),
          input.variants.map((v) => v.byteSize),
          input.variants.map((v) => v.objectKey),
          input.variants.map((v) => v.checksumSha256),
        ],
      );
      const variantMatch = await client.query<{ matching: boolean }>(
        `select count(*)=$10::int as matching
        from public.property_media_variants stored join
        unnest($2::int[],$3::text[],$4::text[],$5::int[],$6::int[],$7::bigint[],$8::text[],$9::text[])
          as v(source_version,recipe_version,format,width_px,height_px,byte_size,object_key,checksum)
        on stored.property_media_id=$1 and stored.source_version=v.source_version
          and stored.recipe_version=v.recipe_version and stored.format=v.format and stored.width_px=v.width_px
          and stored.height_px=v.height_px and stored.byte_size=v.byte_size and stored.object_key=v.object_key
          and stored.checksum_sha256=v.checksum`,
        [
          input.claim.mediaId,
          input.variants.map((v) => v.sourceVersion),
          input.variants.map((v) => v.recipeVersion),
          input.variants.map((v) => v.format),
          input.variants.map((v) => v.widthPx),
          input.variants.map((v) => v.heightPx),
          input.variants.map((v) => v.byteSize),
          input.variants.map((v) => v.objectKey),
          input.variants.map((v) => v.checksumSha256),
          input.variants.length,
        ],
      );
      if (!variantMatch.rows[0]?.matching) throw new Error("MEDIA_CONFLICT");
      await client.query(
        `update public.property_media set state='READY',visibility='PRIVATE',
        original_object_key=$2,checksum_sha256=$3,detected_mime_type=$4,width_px=$5,height_px=$6,
        byte_size=$7,current_recipe_version=$8,processor_version=$9,ready_at=$10,
        failure_code=null,failure_retryable=null,version=version+1,updated_at=$10 where id=$1`,
        [
          input.claim.mediaId,
          input.originalObjectKey,
          input.processed.checksumSha256,
          input.processed.detectedMimeType,
          input.processed.width,
          input.processed.height,
          input.processed.byteSize,
          input.variants[0]?.recipeVersion,
          input.processed.processorVersion,
          input.now,
        ],
      );
      await client.query(
        `update public.media_processing_attempts set status='SUCCEEDED',lease_owner=null,
        lease_expires_at=null,heartbeat_at=$2,finished_at=$2,error_code=null,error_detail=null where id=$1`,
        [input.claim.attemptId, input.now],
      );
      await client.query(
        `insert into public.audit_logs(action,target_type,target_id,outcome,correlation_id,
        change_summary) values('property_media.processing_succeeded','property_media',$1,'succeeded',$2,$3)`,
        [
          input.claim.mediaId,
          input.correlationId,
          JSON.stringify({ state: "READY", visibility: "PRIVATE" }),
        ],
      );
      await client.query(
        `insert into public.outbox_messages(event_name,owning_domain,aggregate_type,
        event_version,aggregate_id,correlation_id,idempotency_key,payload)
        values('property_media.processing_ready','property-media','property_media',1,$1,$2,$3,$4)`,
        [
          input.claim.mediaId,
          input.correlationId,
          `${input.claim.attemptId}:ready`,
          JSON.stringify({
            sourceVersion: input.claim.sourceVersion,
            recipeVersion: input.variants[0]?.recipeVersion,
          }),
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async fail(input: Parameters<MediaWorkerRepository["fail"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const attemptStatus = input.retryable ? "FAILED" : "REJECTED";
      const result = await client.query(
        `update public.media_processing_attempts set status=$2,
        lease_owner=null,lease_expires_at=null,heartbeat_at=$3,finished_at=$3,error_code=$4,
        error_detail=null where id=$1 and status='CLAIMED' and lease_owner=$5 and lease_expires_at>$3`,
        [
          input.claim.attemptId,
          attemptStatus,
          input.now,
          input.code,
          input.claim.leaseOwner,
        ],
      );
      if (result.rowCount !== 1) throw new Error("MEDIA_CONFLICT");
      await client.query(
        `update public.property_media set state='FAILED',visibility='PRIVATE',
        current_recipe_version=null,processor_version=$2,failure_code=$3,failure_retryable=$4,
        ready_at=null,version=version+1,updated_at=$5 where id=$1 and state='PROCESSING'
        and source_version=$6`,
        [
          input.claim.mediaId,
          input.processorVersion,
          input.code,
          input.retryable,
          input.now,
          input.claim.sourceVersion,
        ],
      );
      await client.query(
        `insert into public.audit_logs(action,target_type,target_id,outcome,correlation_id,
        change_summary,reason_code) values('property_media.processing_failed','property_media',$1,
        'failed',$2,$3,$4)`,
        [
          input.claim.mediaId,
          input.correlationId,
          JSON.stringify({ retryable: input.retryable }),
          input.code,
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async findAuthoritativeObjectKeys(keys: readonly string[]) {
    if (!keys.length) return new Set<string>();
    const result = await this.pool.query<{ object_key: string }>(
      `select object_key from public.media_upload_sessions
      where object_key=any($1::text[]) and status in('REQUESTED','UPLOADING','FINALIZED')
      union select original_object_key from public.property_media
        where original_object_key=any($1::text[]) and purged_at is null
      union select object_key from public.property_media_variants
        where object_key=any($1::text[]) and purged_at is null`,
      [keys],
    );
    return new Set(result.rows.map((row) => row.object_key));
  }
}
