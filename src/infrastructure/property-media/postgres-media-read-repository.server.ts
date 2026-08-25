import "server-only";

import type { Pool } from "pg";

import { ApplicationError } from "@/application/errors/application-error";
import type { StaffPrincipal } from "@/application/auth/staff-principal";
import type {
  AdminMediaItem,
  MediaReadRepository,
  PublicMediaDescriptor,
} from "@/application/property-media/media-read-ports";
import { getDatabasePool } from "@/infrastructure/postgres/pool.server";

export class PostgresMediaReadRepository implements MediaReadRepository {
  constructor(private readonly pool: Pool = getDatabasePool()) {}

  async listAdminPropertyMedia(actor: StaffPrincipal, propertyId: string) {
    const result = await this.pool.query<{
      authorized: boolean;
      id: string | null;
      state: AdminMediaItem["state"] | null;
      visibility: AdminMediaItem["visibility"] | null;
      sort_order: number | null;
      is_cover: boolean | null;
      version: string | null;
      failure_code: string | null;
      failure_retryable: boolean | null;
      variants: AdminMediaItem["variants"] | null;
    }>(
      `with actor_scope as (
      select exists(select 1 from public.user_identities ui
        join public.user_role_assignments ura on ura.user_identity_id=ui.id and ura.status='ACTIVE'
          and (ura.expires_at is null or ura.expires_at>statement_timestamp())
        join public.roles r on r.id=ura.role_id and r.status='active' and r.deleted_at is null
        left join public.advisors a on a.user_identity_id=ui.id and a.status='active' and a.deleted_at is null
        left join public.property_advisor_assignments paa on paa.property_id=$2 and paa.advisor_id=a.id
          and paa.ended_at is null
        where ui.id=$1 and ui.status='active' and ui.deleted_at is null
          and (r.code='ADMIN' or (r.code='ADVISOR' and paa.property_id is not null))) as authorized
    ) select s.authorized,m.id,m.state,m.visibility,m.sort_order,m.is_cover,m.version,m.failure_code,
      m.failure_retryable,coalesce((select jsonb_agg(jsonb_build_object('width',v.width_px,'format',v.format,
        'deliveryPath',v.object_key) order by v.width_px,v.format) from public.property_media_variants v
        where v.property_media_id=m.id and v.source_version=m.source_version and v.purged_at is null),'[]') as variants
      from actor_scope s left join public.property_media m on m.property_id=$2
      order by m.deleted_at nulls first,m.sort_order nulls last,m.id`,
      [actor.identityId, propertyId],
    );
    if (!result.rows[0]?.authorized)
      throw new ApplicationError("MEDIA_FORBIDDEN", "MEDIA_FORBIDDEN");
    return result.rows
      .filter((row) => row.id !== null)
      .map((row) => ({
        id: row.id!,
        state: row.state!,
        visibility: row.visibility!,
        sortOrder: row.sort_order!,
        isCover: row.is_cover!,
        version: BigInt(row.version!),
        failureCode: row.failure_code,
        failureRetryable: row.failure_retryable,
        variants: row.variants ?? [],
      }));
  }

  async listPublicPropertyMedia(propertyId: string) {
    const result = await this.pool.query<{
      media_id: string;
      is_cover: boolean;
      sort_order: number;
      alt_text: string | null;
      variants: PublicMediaDescriptor["variants"];
    }>(
      `select pm.id as media_id,pm.is_cover,pm.sort_order,pm.alt_text,
      jsonb_agg(jsonb_build_object('width',v.width_px,'height',v.height_px,'format',v.format,
        'deliveryPath',v.object_key) order by v.width_px,v.format) as variants
      from public.properties p join public.property_media pm on pm.property_id=p.id
      join public.property_media_variants v on v.property_media_id=pm.id
        and v.source_version=pm.source_version and v.recipe_version=pm.current_recipe_version and v.purged_at is null
      where p.id=$1 and p.current_state='ACTIVE' and p.deleted_at is null
        and pm.state='READY' and pm.visibility='PUBLIC' and pm.deleted_at is null and pm.ready_at is not null
      group by pm.id order by pm.sort_order,pm.id`,
      [propertyId],
    );
    return result.rows.map((row) => ({
      mediaId: row.media_id,
      isCover: row.is_cover,
      sortOrder: row.sort_order,
      altText: row.alt_text,
      variants: row.variants,
    }));
  }
}
