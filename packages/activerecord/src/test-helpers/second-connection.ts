/**
 * Helper for tests that require a second independent database connection.
 *
 * Rails uses `@connection.pool.checkout` to obtain a second connection from the
 * same pool. We instead create a fresh `PostgreSQLAdapter` pointing at the same
 * URL, so the two adapters have fully independent connection pools with no
 * shared state.
 */

import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";

/**
 * Opens a second `PostgreSQLAdapter` for the given URL, calls `fn` with it,
 * then closes the adapter on the way out (success or failure).
 */
export async function withSecondAdapter<T>(
  url: string,
  fn: (adapter: PostgreSQLAdapter) => T | Promise<T>,
): Promise<T> {
  const adapter = new PostgreSQLAdapter(url);
  try {
    return await fn(adapter);
  } finally {
    await adapter.close().catch(() => {});
  }
}
