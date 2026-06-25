/**
 * AR-only vitest setupFile. Wired into the `activerecord` project in
 * `vitest.config.ts`; the sibling `test-setup.ts` is shared with the
 * non-AR `other` project, so anything that imports the AR test adapter
 * (and thus opens a DB connection at module load) belongs here, not
 * there.
 */

// Eagerly load the better-sqlite3 driver so the AR test adapter
// (BetterSQLite3Adapter) can open a connection at module load. Lives here (not
// in activerecord/index.ts) to keep better-sqlite3 a true optional peer for
// non-test consumers.
import "./sqlite/better-sqlite3.js";
import { beforeEach } from "vitest";
import { Base } from "./base.js";
import { DelegateCache } from "./relation/delegation.js";
import { loadDefaults } from "./trailtie.js";
import { setRaiseOnAssignToAttrReadonly } from "./ar-config.js";
import { resetTestAdapterState } from "./test-adapter.js";
import { shouldSkipGlobalReset } from "./test-helpers/skip-global-reset.js";

// The test app runs with the Rails 7.0+ defaults (`config.load_defaults 7.0`),
// which sets `config.active_record.partial_inserts = false` (partial_updates
// stays true). Use the versioned-defaults mechanism rather than poking Base
// directly; this exercises the real code path that a consuming app would use.
loadDefaults("7.0");

// Mirror Rails activerecord/test/cases/helper.rb:29 — ban delegating a
// relation/collection-proxy call into an `ActiveRecord::Base` method suite-wide
// so any AR-internal code (or test) relying on such delegation raises and is
// caught. Production keeps the Rails default of `true` (delegation.rb:25); only
// the test harness flips it.
DelegateCache.delegateBaseMethods = false;

// Mirror Rails activerecord/test/cases/helper.rb:40
Base.automaticallyInvertPluralAssociations = true;

// Mirror Rails activerecord/test/cases/helper.rb:42 — the AR test suite enables
// raise-on-assign-to-readonly globally; the framework default (active_record.rb:343)
// is false, flipped to true by load_defaults 7.1 (configuration.rb:286).
setRaiseOnAssignToAttrReadonly(true);

// Wipe shared test-adapter state before every test so each test starts
// from a clean slate.
beforeEach(async () => {
  if (shouldSkipGlobalReset()) return;
  await resetTestAdapterState();
});
