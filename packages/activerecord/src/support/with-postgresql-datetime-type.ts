/**
 * Mirrors `ActiveRecord::TestCase#with_postgresql_datetime_type`
 * (vendor/rails/activerecord/test/support/connection_helper.rb) — temporarily
 * flips `PostgreSQLAdapter.datetime_type` so `:datetime` resolves to
 * `:timestamptz`.
 *
 * Lives here rather than in `adapters/postgresql/test-helper.ts` because that
 * module re-exports `support/describe-if-pg.js`, whose top-level `await` probes
 * a PostgreSQL server on *every* lane. Suites that are not PG-only (e.g.
 * `migration/change-schema.test.ts`) need the helper without paying that probe,
 * so the adapter import is deferred to call time.
 */
export async function withPostgresqlDatetimeType<T>(
  type: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const { PostgreSQLAdapter } = await import("../connection-adapters/postgresql-adapter.js");
  const original = PostgreSQLAdapter.datetimeType;
  PostgreSQLAdapter.datetimeType = type;
  try {
    return await fn();
  } finally {
    PostgreSQLAdapter.datetimeType = original;
  }
}
