/**
 * Mirrors `ActiveRecord::TestCase#with_postgresql_datetime_type`
 * (vendor/rails/activerecord/test/cases/test_case.rb:193).
 *
 * The adapter import is deferred to call time so non-PG lanes can import this
 * module without loading `adapters/postgresql/test-helper.ts`, whose
 * `describe-if-pg` re-export probes a PostgreSQL server at module scope.
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
