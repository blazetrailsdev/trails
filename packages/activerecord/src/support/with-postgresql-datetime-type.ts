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
