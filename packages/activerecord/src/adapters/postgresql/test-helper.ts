import { describe } from "vitest";
import pg from "pg";
import { PostgreSQLAdapter } from "../../connection-adapters/postgresql-adapter.js";
import { pgDatetimeConfig } from "../../connection-adapters/postgresql/pg-datetime-config.js";
import { Notifications, squish } from "@blazetrails/activesupport";
import type { NotificationSubscriber, NotificationEvent } from "@blazetrails/activesupport";
import { postgresUrl } from "../../support/config.js";

// A *serialization* of the PG sub-settings (PGHOST/PGPORT/PGUSER/PGPASSWORD/
// PGDATABASE), not an env var of its own: these adapter suites probe the server
// directly via describeIfPg regardless of ARCONN, so they need a URL to hand
// the driver, but they no longer source one from the environment.
export const PG_TEST_URL = postgresUrl();

let pgAvailable = false;
let pgServerVersionNum = 0;
let pgHasHintPlan = false;

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

({
  available: pgAvailable,
  serverVersionNum: pgServerVersionNum,
  hasHintPlan: pgHasHintPlan,
} = await checkPg());

export const describeIfPg = pgAvailable ? describe : (describe.skip as typeof describe);
/** PG server_version_num at module load (0 when unavailable). */
export const pgServerVersion = pgServerVersionNum;
/**
 * Mirrors PostgreSQLAdapter#supports_optimizer_hints? — true when the
 * `pg_hint_plan` extension is installed and available. Rails wraps the whole
 * `PostgresqlOptimizerHintsTest` body in `if supports_optimizer_hints?`, so the
 * examples never run on a server without the extension.
 */
export const pgSupportsOptimizerHints = pgAvailable && pgHasHintPlan;
/** Mirrors PostgreSQLAdapter#supportsNativePartitioning — PG 10+ (100000). */
export const pgSupportsNativePartitioning = pgServerVersionNum >= 100000;

/** Mirrors Rails' with_postgresql_datetime_type — temporarily changes the adapter's datetimeType. */
export async function withPostgresqlDatetimeType<T>(
  type: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const original = PostgreSQLAdapter.datetimeType;
  PostgreSQLAdapter.datetimeType = type;
  try {
    return await fn();
  } finally {
    PostgreSQLAdapter.datetimeType = original;
  }
}

/** Temporarily registers extra entries in nativeDatabaseTypes, then restores the originals. */
export async function withNativeDatabaseTypeOverrides<T>(
  overrides: Record<string, string | { name?: string; limit?: number }>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const saved = { ...pgDatetimeConfig.nativeDatabaseTypesOverrides };
  Object.assign(pgDatetimeConfig.nativeDatabaseTypesOverrides, overrides);
  try {
    return await fn();
  } finally {
    pgDatetimeConfig.nativeDatabaseTypesOverrides = saved;
  }
}

export { PostgreSQLAdapter };

/**
 * Suffixes an inline DDL table name so concurrent suites cannot drop each
 * other's copy of it.
 *
 * Rails creates `samples`/`bits` inline in each transaction test's `setup`
 * (transaction_test.rb, transaction_nested_test.rb) and runs single-process, so
 * the shared name is harmless there. Trails forks 6 vitest workers onto ONE
 * shared CI database, and vitest puts these two files in different workers: one
 * file's `afterEach` `DROP TABLE IF EXISTS samples` can drop the table the
 * other file is mid-test against, surfacing as 42P01 on an innocent test. A
 * per-suite physical name keeps the DDL isolated; the Rails-facing surface
 * (test names, the columns, the semantics) is untouched.
 */
export function suiteTable(name: string, suite: string): string {
  return `${name}_${suite}`;
}

/**
 * Mirrors Rails' SQLSubscriber test helper from activerecord/test/cases/helper.rb.
 * Records sql.active_record notifications so tests can assert on payload fields.
 */
export class SQLSubscriber {
  readonly logged: Array<[string, string, unknown[]]> = [];
  readonly payloads: Array<Record<string, unknown>> = [];
  private _sub: NotificationSubscriber | null = null;

  start(): void {
    this.stop();
    this._sub = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      const p = event.payload as Record<string, unknown>;
      this.payloads.push(p);
      this.logged.push([
        squish(String(p.sql ?? "")),
        String(p.name ?? ""),
        (p.binds as unknown[]) ?? [],
      ]);
    });
  }

  stop(): void {
    if (this._sub) {
      Notifications.unsubscribe(this._sub);
      this._sub = null;
    }
  }
}
