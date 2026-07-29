/**
 * AR-only vitest setupFile, mirroring Rails'
 * `activerecord/test/cases/helper.rb`. Anything that imports the AR test
 * adapter (and thus opens a DB connection at module load) belongs here rather
 * than in a setup file shared with non-AR projects.
 */

// Eagerly load the better-sqlite3 driver so the AR test adapter
// (BetterSQLite3Adapter) can open a connection at module load. Lives here (not
// in activerecord/index.ts) to keep better-sqlite3 a true optional peer for
// non-test consumers.
import "../sqlite/better-sqlite3.js";
import { beforeEach } from "vitest";
import { Base } from "../base.js";
import { getZone, setZone, resetZone, isZoneExplicit } from "@blazetrails/activesupport";
import { DelegateCache } from "../relation/delegation.js";
import { ActiveRecord } from "../ar-config.js";
import { resetTestAdapterState } from "../test-adapter.js";
import { shouldSkipGlobalReset } from "../support/skip-global-reset.js";
import { registerFakeAdapter } from "../support/fake-adapter.js";
import { Configurable as EncryptionConfigurable } from "../encryption/configurable.js";
import { installExtendedQueriesIfConfigured } from "../encryption/install.js";
import {
  TEST_PRIMARY_KEY,
  TEST_DETERMINISTIC_KEY,
  TEST_KEY_DERIVATION_SALT,
} from "../encryption/test-keys.js";

// Mirror Rails activerecord/test/cases/helper.rb:46 — register the fake adapter
// for the whole suite, before any model calls establish_connection(adapter:
// "fake") at load time (test/models/contact.rb:6).
registerFakeAdapter();

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
ActiveRecord.raiseOnAssignToAttrReadonly = true;

// Mirror Rails activerecord/test/cases/helper.rb:43 — the AR test suite turns
// off the required-`belongs_to` foreign-key presence check globally, so the
// presence validation only runs when the FK (or polymorphic type) is nil or
// changed. Production keeps the Rails default of `true` (active_record.rb:345-346);
// only the test harness flips it.
ActiveRecord.belongsToRequiredValidatesForeignKey = false;

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

beforeEach(async () => {
  if (shouldSkipGlobalReset()) return;
  await resetTestAdapterState();
});

/**
 * Rails declares `module InTimeZone` inside this very file —
 * activerecord/test/cases/helper.rb:66-79 — so it lives here rather than in a
 * standalone module of its own. Importing this file from a test is free: it is
 * already the AR setupFile, so the module is loaded before any test runs.
 *
 *   module InTimeZone
 *     private
 *       def in_time_zone(zone)
 *         old_zone = Time.zone
 *         old_tz   = ActiveRecord::Base.time_zone_aware_attributes
 *         Time.zone = zone ? ActiveSupport::TimeZone[zone] : nil
 *         ActiveRecord::Base.time_zone_aware_attributes = !zone.nil?
 *         yield
 *       ensure
 *         Time.zone = old_zone
 *         ActiveRecord::Base.time_zone_aware_attributes = old_tz
 *       end
 *   end
 *
 * Runs `fn` with `Time.zone` set to `zone` and `Base.timeZoneAwareAttributes`
 * toggled to `zone != null`, restoring both afterwards. A `null` zone clears
 * the zone and disables time-zone-aware attributes (the Rails `zone.nil?` path).
 */
export async function inTimeZone(
  zone: string | null,
  fn: () => Promise<void> | void,
): Promise<void> {
  const wasExplicit = isZoneExplicit();
  const oldZone = getZone();
  const oldAware = Base.timeZoneAwareAttributes;

  if (zone != null) setZone(zone);
  else resetZone();
  Base.timeZoneAwareAttributes = zone != null;

  try {
    await fn();
  } finally {
    if (wasExplicit && oldZone) setZone(oldZone);
    else resetZone();
    Base.timeZoneAwareAttributes = oldAware;
  }
}
