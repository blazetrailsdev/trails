/**
 * ARTest-style second-database (`arunit2`) configuration for the test harness.
 *
 * Rails models the AR suite as two databases — `arunit` (primary) and
 * `arunit2` — both declared in `test/config.yml` and surfaced through
 * `ARTest.test_configuration_hashes` / `ARTest.connection_config`.
 * `ActiveRecord::Base` connects to `arunit`; `ARUnit2Model` connects to
 * `arunit2`; the cross-database-select probe references both by their
 * configured names.
 *
 * trails provisions a single server per adapter, so rather than maintaining a
 * separate config file we derive the two database names from the primary
 * connection's `database` sub-setting by suffixing. This keeps the names
 * config-derived (not invented per call) and dedicated to the cross-pool
 * work — off the shared primary database whose canonical tables parallel
 * workers create and drop.
 *
 * The *connection names* are already first-class: `support/connection.ts`
 * publishes `arunit`, `arunit2` and `arunit_without_prepared_statements` as
 * named entries on `Base.configurations`, and `connect` establishes both pools
 * by name (`connection.rb:32-33`). Only the *database names* stay
 * suffix-derived, because they must carry the per-worker isolation slot that
 * Rails' static `config.yml` has no equivalent of — a checked-in name would
 * collide across parallel workers.
 *
 * @internal
 */

const ARUNIT_SUFFIX = "_arunit";
const ARUNIT2_SUFFIX = "_arunit2";

/**
 * The config-derived `arunit` / `arunit2` database names for a primary
 * database. Both are the primary database name plus a fixed suffix, mirroring
 * how `ARTest.test_configuration_hashes` exposes two named databases.
 */
export function arunitDatabaseNames(primaryDatabase: string): {
  arunit: string;
  arunit2: string;
} {
  const base = primaryDatabase;
  return { arunit: `${base}${ARUNIT_SUFFIX}`, arunit2: `${base}${ARUNIT2_SUFFIX}` };
}
