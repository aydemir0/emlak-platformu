import "server-only";

import type { StaffIdentityResolver } from "@/application/auth/authenticate-staff-session";
import { getDatabasePool } from "@/infrastructure/postgres/pool.server";

export class PostgresStaffIdentityResolver implements StaffIdentityResolver {
  async findActiveStaff(authUserId: string) {
    const result = await getDatabasePool().query<{
      identity_id: string;
      role: "ADMIN" | "ADVISOR";
      role_count: string;
    }>(
      `select ui.id as identity_id, min(r.code) as role, count(distinct r.code)::text as role_count
      from public.user_identities ui
      join public.user_role_assignments ura on ura.user_identity_id=ui.id and ura.status='ACTIVE'
        and (ura.expires_at is null or ura.expires_at > statement_timestamp())
      join public.roles r on r.id=ura.role_id and r.status='active' and r.deleted_at is null
      where ui.auth_provider='supabase' and ui.provider_subject=$1
        and ui.status='active' and ui.deleted_at is null
      group by ui.id`,
      [authUserId],
    );
    const row = result.rows[0];
    return row && row.role_count === "1"
      ? { identityId: row.identity_id, role: row.role }
      : null;
  }
}
