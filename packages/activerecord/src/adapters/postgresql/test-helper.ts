import { describe } from "vitest";
import pg from "pg";
import { PostgreSQLAdapter } from "../../connection-adapters/postgresql-adapter.js";
import { pgDatetimeConfig } from "../../connection-adapters/postgresql/pg-datetime-config.js";

export const PG_TEST_URL = process.env.PG_TEST_URL ?? "postgres://localhost:5432/rails_js_test";

let pgAvailable = false;

async function checkPg(): Promise<boolean> {
  try {
    const client = new pg.Client({ connectionString: PG_TEST_URL });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return true;
  } catch {
    return false;
  }
}

pgAvailable = await checkPg();

export const describeIfPg = pgAvailable ? describe : (describe.skip as typeof describe);

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
