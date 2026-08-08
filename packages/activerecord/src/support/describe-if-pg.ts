import { describe } from "vitest";
import pg from "pg";
import { postgresUrl } from "./config.js";

// A *serialization* of the PG sub-settings (PGHOST/PGPORT/PGUSER/PGPASSWORD/
// PGDATABASE), not an env var of its own: these suites probe the server
// directly via describeIfPg regardless of ARCONN, so they need a URL to hand
// the driver, but they no longer source one from the environment.
export const PG_TEST_URL = postgresUrl();

async function checkPg(): Promise<{
  available: boolean;
  serverVersionNum: number;
  hasHintPlan: boolean;
}> {
  const client = new pg.Client({ connectionString: PG_TEST_URL });
  try {
    await client.connect();
    const res = await client.query<{ v: string }>(
      "SELECT current_setting('server_version_num') AS v",
    );
    const ext = await client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM pg_available_extensions WHERE name = 'pg_hint_plan'",
    );
    return {
      available: true,
      serverVersionNum: Number(res.rows[0]?.v ?? 0),
      hasHintPlan: Number(ext.rows[0]?.count ?? 0) > 0,
    };
  } catch {
    return { available: false, serverVersionNum: 0, hasHintPlan: false };
  } finally {
    await client.end().catch(() => {});
  }
}

const probe = await checkPg();

/** true when a PostgreSQL server answered the probe at module load. */
export const pgAvailable = probe.available;
/** PG server_version_num at module load (0 when unavailable). */
export const pgServerVersion = probe.serverVersionNum;
/** true when the `pg_hint_plan` extension is available on the probed server. */
export const pgHasHintPlan = probe.hasHintPlan;

/**
 * Scope a suite to a reachable PostgreSQL server. Lives in `support/` rather
 * than the `adapters/postgresql/` test-helper because suites outside that tree
 * gate on it too — a test file should never have to import glue from another
 * adapter's tree. Counterpart to `describeIfSqlite` / `describeIfMysqlAdapter`.
 *
 * This is a *server probe*, not the port of `current_adapter?(:PostgreSQLAdapter)`
 * — it runs on the sqlite and mysql2 lanes too whenever a PostgreSQL server
 * answers, so a suite under it cannot lease `Base.connection` and must bring
 * its own adapter. A suite whose body is a plain `Base.connection` interaction
 * belongs under `describeIfPostgresqlAdapter` instead; that distinction has
 * been re-derived three times, so: the surviving users of this probe are the
 * ones that construct a `PostgreSQLAdapter` from `PG_TEST_URL` (the whole
 * `adapters/postgresql/` tree, `connection-adapters/postgresql/
 * schema-statements.test.ts`, `postgresql-adapter.transaction-status.trails.
 * test.ts`, `load-schema-helper-uuid-default.trails.test.ts`) plus the
 * `pgAvailable` / `pgServerVersion` / `pgHasHintPlan` readers. Do not widen it.
 */
export const describeIfPg = pgAvailable ? describe : (describe.skip as typeof describe);
