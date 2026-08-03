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
 * (not invented per call): `arunit` is that primary database, the one
 * `ActiveRecord::Base` is established on (`connection.rb:31-33`) and the one
 * `expand_config` defaults to `activerecord_unittest` (`config.rb:26-35`), and
 * `arunit2` its sibling.
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

import { splitRunDatabaseName } from "./run-token.js";

/**
 * The config-derived `arunit` / `arunit2` database names for a primary
 * database, mirroring how `ARTest.test_configuration_hashes` exposes two named
 * databases.
 *
 * `arunit2` is spelled the way `expand_config` spells it — the primary name
 * plus a literal `"2"` (`test/support/config.rb:28`) — so at slot 1 (local
 * runs and every un-sharded lane) it is Rails' own `activerecord_unittest2`.
 * The `"2"` goes *before* the per-run suffix rather than after it, which is the
 * one unavoidable deviation: appending it to slot 3's
 * `activerecord_unittest_3` would yield `activerecord_unittest_32`, i.e. slot
 * 32's own database. Written this way slot 3 gets `activerecord_unittest2_3`,
 * which no slot can collide with, since primary names never carry the `2`.
 *
 * The per-run suffix is `_<runToken>_<slot>`, not just `_<slot>`: a stamped
 * primary is `activerecord_unittest_<token>_<slot>`, so the `"2"` has to land
 * ahead of the *token* — `activerecord_unittest2_<token>_<slot>`. Placing it
 * after the token instead left `runTokenOfDatabase` reading the sibling's
 * token as `<token>2`, which both hid it from its own run's teardown and
 * exposed it to a concurrent run's stale sweep (`run-token.ts`).
 *
 * `arunit` is the primary database itself, as `expand_config` defaults it
 * (`activerecord_unittest`). Rails' only consumer of these two names — the
 * MySQL cross-database-select probe (`adapter_test.rb:160-172`) — reads the
 * tables the two databases already carry (`pirates` in the primary,
 * `courses` in arunit2) and creates no databases of its own, so nothing here
 * needs a throwaway database to drop.
 */
export function arunitDatabaseNames(primaryDatabase: string): {
  arunit: string;
  arunit2: string;
} {
  const { base, suffix } = splitRunDatabaseName(primaryDatabase);
  return { arunit: primaryDatabase, arunit2: `${base}2${suffix}` };
}
