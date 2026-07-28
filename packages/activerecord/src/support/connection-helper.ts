/**
 * TS mirror of Rails' test-support `ConnectionHelper`
 * (activerecord/test/support/connection_helper.rb).
 *
 * Ports `run_without_connection`: removes `Base`'s global connection (capturing
 * its `db_config` so it can be restored), yields the configuration hash to the
 * block, and re-establishes the original connection in a `finally` — mirroring
 * Ruby's `ensure`. Lets tests toggle connection-level config (e.g.
 * `advisory_locks`) by re-establishing `Base` and reliably restore the
 * worker's pool afterward.
 */

import { Base } from "../base.js";
import type { DatabaseConfigOptions } from "../database-configurations/database-config.js";

/**
 * Mirrors: ConnectionHelper#run_without_connection
 *
 *   def run_without_connection
 *     original_connection = ActiveRecord::Base.remove_connection
 *     yield original_connection.configuration_hash
 *   ensure
 *     ActiveRecord::Base.establish_connection(original_connection)
 *   end
 *
 * Like Rails, this assumes there is a connection to remove — `removeConnection`
 * returns `undefined` only when no pool exists, which mirrors Rails returning
 * `nil` and then raising in the `ensure` (`establish_connection(nil)`). We
 * restore by handing the captured `DatabaseConfig` object straight back to
 * `establishConnection`, a literal port of Rails'
 * `establish_connection(original_connection)`.
 */
export async function runWithoutConnection<T>(
  fn: (configHash: DatabaseConfigOptions) => Promise<T> | T,
): Promise<T> {
  const originalConnection = Base.removeConnection()!;
  try {
    return await fn(originalConnection.configurationHash);
  } finally {
    await Base.establishConnection(originalConnection);
  }
}

/**
 * Mirrors: ConnectionHelper#reset_connection — the same remove/re-establish
 * pair as {@link runWithoutConnection} with no block in between. The round trip
 * itself is the point: Rails uses it "to drop all cache query plans in tests".
 *
 * That holds here because the prepared-statement cache is per-adapter private
 * state (`_statementPool`, postgresql-adapter.ts:476; the MySQL and SQLite
 * adapters carry their own), so a new pool hands out new adapter instances with
 * empty caches. What does NOT carry over from Rails is the teardown half:
 * `removeConnectionPool` drops the old pool from the manager and then leaves
 * `disconnect()` unawaited (connection-handler.ts:340), so this resolving means
 * the *next* query gets a fresh connection — not that the old sockets are
 * already closed. Tests that assert on server-side connection counts need to
 * account for that; tests that only want a cold statement cache do not.
 *
 * No trails caller yet: every Rails caller is in an unported adapter suite
 * (postgresql/enum_test.rb:33,36, referential_integrity_test.rb:39,
 * postgresql_adapter_test.rb:528+, abstract_mysql_adapter/active_schema_test.rb:26,
 * mysql_type_lookup_test.rb:17).
 */
export async function resetConnection(): Promise<void> {
  const originalConnection = Base.removeConnection()!;
  await Base.establishConnection(originalConnection);
}
