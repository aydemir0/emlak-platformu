import "server-only";

import { Pool } from "pg";

import { getServerEnv } from "@/config/env.server.runtime";

let pool: Pool | undefined;

export function getLocalDatabasePool(): Pool {
  pool ??= new Pool({
    connectionString: getServerEnv().LOCAL_DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "emlak-platformu-phase5",
  });
  return pool;
}
