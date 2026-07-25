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
import {
  setBelongsToRequiredValidatesForeignKey,
  setRaiseOnAssignToAttrReadonly,
} from "./ar-config.js";
import { resetTestAdapterState } from "./test-adapter.js";
import { shouldSkipGlobalReset } from "./test-helpers/skip-global-reset.js";
import { Configurable as EncryptionConfigurable } from "./encryption/configurable.js";
import { installExtendedQueriesIfConfigured } from "./encryption/install.js";
import {
  TEST_PRIMARY_KEY,
  TEST_DETERMINISTIC_KEY,
  TEST_KEY_DERIVATION_SALT,
} from "./encryption/test-keys.js";

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

// Mirror Rails activerecord/test/cases/helper.rb:43 — the AR test suite turns
// off the required-`belongs_to` foreign-key presence check globally, so the
// presence validation only runs when the FK (or polymorphic type) is nil or
// changed. Production keeps the Rails default of `true` (active_record.rb:345-346);
// only the test harness flips it.
setBelongsToRequiredValidatesForeignKey(false);

// Mirror Rails activerecord/test/cases/helper.rb:98-102 — configure encryption
// once, suite-wide, BEFORE any model class loads, so a model's `encrypts`
// declaration always builds its scheme against real key material (Rails boots
// encryption config before models). Individual encryption tests snapshot and
// re-`configureEncryption()` on top of this baseline; the values match so
// fixtures encrypted at load round-trip regardless of which suite reads them.
EncryptionConfigurable.configure({
  primaryKey: TEST_PRIMARY_KEY,
  deterministicKey: TEST_DETERMINISTIC_KEY,
  keyDerivationSalt: TEST_KEY_DERIVATION_SALT,
});

// Mirror Rails activerecord/test/cases/helper.rb:104-107 — the suite runs with
// deterministic-encryption query support installed, standing in for what the
// railtie does in a real app (railtie.rb:349-355).
EncryptionConfigurable.config.extendQueries = true;
installExtendedQueriesIfConfigured();

// Wipe shared test-adapter state before every test so each test starts
// from a clean slate.
beforeEach(async () => {
  if (shouldSkipGlobalReset()) return;
  await resetTestAdapterState();
});
