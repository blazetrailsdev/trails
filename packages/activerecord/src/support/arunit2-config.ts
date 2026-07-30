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
 * connection's `database` sub-setting. This keeps the names config-derived
 * (not invented per call) and dedicated to the cross-pool work — off the
 * shared primary database whose canonical tables parallel workers create and
 * drop.
 *
 * The *connection names* are already first-class: `support/connection.ts`
 * publishes `arunit`, `arunit2` and `arunit_without_prepared_statements` as
 * named entries on `Base.configurations`, and `connect` establishes both pools
 * by name (`connection.rb:32-33`). Only the *database names* are derived,
 * because they must carry the per-worker isolation slot that Rails' static
 * `config.yml` has no equivalent of — a checked-in name would collide across
 * parallel workers.
 *
 * @internal
 */

/**
 * The `_N` worker-isolation slot `support/config.ts`'s `applySlot` appends to
 * the primary database name (slot 1 gets none).
 */
const SLOT_SUFFIX = /_\d+$/;

const ARUNIT_SUFFIX = "_arunit";

/**
 * The config-derived `arunit` / `arunit2` database names for a primary
 * database, mirroring how `ARTest.test_configuration_hashes` exposes two named
 * databases.
 *
 * `arunit2` is spelled the way `expand_config` spells it — the primary name
 * plus a literal `"2"` (`test/support/config.rb:28`) — so at slot 1 (local
 * runs and every un-sharded lane) it is Rails' own `activerecord_unittest2`.
 * The `"2"` goes *before* the slot suffix rather than after it, which is the
 * one unavoidable deviation: appending it to slot 3's
 * `activerecord_unittest_3` would yield `activerecord_unittest_32`, i.e. slot
 * 32's own database. Written this way slot 3 gets `activerecord_unittest2_3`,
 * which no slot can collide with, since primary names never carry the `2`.
 *
 * `arunit` keeps a `_arunit` suffix and so is *not* the primary database,
 * unlike Rails'. It exists for the MySQL cross-database-select probe
 * (`adapter_test.rb`), which drops and recreates both databases it names — on
 * the primary that would destroy the worker's canonical schema mid-run,
 * something Rails can afford only because its `arunit` is not shared with
 * parallel workers.
 */
export function arunitDatabaseNames(primaryDatabase: string): {
  arunit: string;
  arunit2: string;
} {
  const slot = SLOT_SUFFIX.exec(primaryDatabase)?.[0] ?? "";
  const base = slot === "" ? primaryDatabase : primaryDatabase.slice(0, -slot.length);
  return { arunit: `${primaryDatabase}${ARUNIT_SUFFIX}`, arunit2: `${base}2${slot}` };
}
