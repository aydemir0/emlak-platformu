import "server-only";

import { Pool } from "pg";

import { getDatabaseReadinessEnv } from "@/config/env.server.runtime";

let pool: Pool | undefined;

export function getDatabasePool(): Pool {
  pool ??= new Pool({
    connectionString: getDatabaseReadinessEnv().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "emlak-platformu",
  });
  return pool;
}
