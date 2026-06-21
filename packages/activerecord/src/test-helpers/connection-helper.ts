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
