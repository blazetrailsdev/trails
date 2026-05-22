import { describe } from "vitest";
import pg from "pg";
import { PostgreSQLAdapter } from "../../connection-adapters/postgresql-adapter.js";
import { pgDatetimeConfig } from "../../connection-adapters/postgresql/pg-datetime-config.js";
import { Notifications, squish } from "@blazetrails/activesupport";
import type { NotificationSubscriber, NotificationEvent } from "@blazetrails/activesupport";

export const PG_TEST_URL = process.env.PG_TEST_URL ?? "postgres://localhost:5432/rails_js_test";

let pgAvailable = false;
let pgServerVersionNum = 0;

async function checkPg(): Promise<{ available: boolean; serverVersionNum: number }> {
  const client = new pg.Client({ connectionString: PG_TEST_URL });
  try {
    await client.connect();
    const res = await client.query<{ v: string }>(
      "SELECT current_setting('server_version_num') AS v",
    );
    return { available: true, serverVersionNum: Number(res.rows[0]?.v ?? 0) };
  } catch {
    return { available: false, serverVersionNum: 0 };
  } finally {
    await client.end().catch(() => {});
  }
}

({ available: pgAvailable, serverVersionNum: pgServerVersionNum } = await checkPg());

export const describeIfPg = pgAvailable ? describe : (describe.skip as typeof describe);
/** PG server_version_num at module load (0 when unavailable). */
export const pgServerVersion = pgServerVersionNum;
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
