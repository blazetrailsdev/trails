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
import { afterAll, afterEach, expect } from "vitest";
import { Base } from "../base.js";
import { I18n } from "@blazetrails/activemodel";
import {
  afterTeardown,
  zone as timeZone,
  setZone,
  resetZone,
  isZoneExplicit,
} from "@blazetrails/activesupport";
import { DelegateCache } from "../relation/delegation.js";
import { ActiveRecord } from "../ar-config.js";
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

// Mirror Rails activerecord/test/cases/helper.rb:35 — disable available locale
// checks to avoid warnings running the test suite. The gem memoizes
// `available_locales_set` (i18n/lib/i18n/config.rb:50-54) and clears it on
// neither `store_translations` nor `backend=`, so without this a locale a case
// stores after the first check never becomes visible to `with_locale`.
I18n.setEnforceAvailableLocales(false);

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

/**
 * Rails' `ActiveRecord::TestCase` tears its connections down per case, so a
 * pool cannot outlive the file that established it. trails' connection handler
 * is module-level state shared by every test file in a vitest worker, and since
 * PR #6109 `setup_transactional_fixtures` pins every writing pool up front
 * (test_fixtures.rb:175-180) — and `pin_connection!` eagerly `verify!`s the
 * connection (connection_pool.rb:335). So a pool one file leaves behind is
 * opened for real by the next file that pins, and fails THAT file, on the lanes
 * whose server actually rejects the config: `NoDatabaseError` on PostgreSQL,
 * `ER_DBACCESS_DENIED_ERROR` on MariaDB. Naming the pools by connection
 * descriptor and counting them per file fails the culprit instead of the victim.
 *
 * The baseline is taken at SETUP-module load — `test-setup-dy.ts` calls
 * {@link captureWritingPoolBaseline} as the last thing it does, which is after
 * every setupFile has run and before the test file is imported. So the
 * population is "pools that exist because the suite booted" (Base and
 * ARUnit2Model, opened by `support/connection.ts` and
 * `support/setup-second-pool.ts`), and a pool a file establishes at its own
 * module scope is charged to that file. A `beforeAll` baseline could not do
 * this: vitest runs it after the test file's module body, so a module-scope
 * pool was counted into its own baseline and never reported — even though it
 * outlives the file exactly like a mid-test leak.
 *
 * `adapter: "fake"` pools are not counted. The harm the guard exists to catch
 * is the next file's `pin_connection!` opening the pool FOR REAL and failing on
 * a config this server rejects; `FakeActiveRecordAdapter` never reaches a
 * server (`support/fake-adapter.ts` answers `active()` in memory), so verifying
 * one cannot fail anybody. They are also not leaks to begin with: Rails opens
 * them at model load and keeps them for the process too
 * (`test/models/contact.rb:6`), so charging them to whichever file first
 * imports the model would report Rails' own arrangement.
 *
 * Counting per connection name alone is blind to the other half of the harm: a
 * file that REPLACES a baseline pool with a different pool of the same name
 * (`connectsTo` on the primary abstract class normalizes its descriptor to
 * `"Base"`) keeps the count at one while pointing the suite's own connection at
 * a database that is not the worker's. So the census is keyed by name AND by
 * the pool's `adapter:database`, and a same-named replacement reads as an added
 * signature. Re-establishing the SAME config — what `restoreWorkerConnection()`
 * does — keeps the signature and stays green, which is the point: the guard is
 * about where a pool points, not about pool object identity.
 */
function writingPoolCensus(): Map<string, Map<string, number>> {
  const census = new Map<string, Map<string, number>>();
  for (const pool of Base.connectionHandler.connectionPoolList("writing")) {
    if (pool.dbConfig?.adapter === "fake") continue;
    const name = String(pool.connectionDescriptor?.name);
    const signature = `${pool.dbConfig?.adapter}:${pool.dbConfig?.database}`;
    let bySignature = census.get(name);
    if (!bySignature) {
      bySignature = new Map<string, number>();
      census.set(name, bySignature);
    }
    bySignature.set(signature, (bySignature.get(signature) ?? 0) + 1);
  }
  return census;
}

let baselineWritingPools = new Map<string, Map<string, number>>();

/**
 * Takes the census baseline. Called from the setup module that runs LAST
 * (`test-setup-dy.ts`) rather than from this file's own body, because this file
 * is only the second of the AR setupFiles and the boot pools are opened after
 * it.
 */
export function captureWritingPoolBaseline(): void {
  baselineWritingPools = writingPoolCensus();
}

/**
 * The writing pools this file added on top of the baseline, each named by its
 * connection descriptor. Split out of the `afterAll` so the guard can be proven
 * on a real module-scope leak: a test file that leaked on purpose to exercise
 * the `afterAll` would by construction fail itself.
 */
export function writingPoolsLeakedSinceBaseline(): string[] {
  const leaked: string[] = [];
  for (const [name, bySignature] of writingPoolCensus()) {
    const baseline = baselineWritingPools.get(name);
    for (const [signature, count] of bySignature) {
      const before = baseline?.get(signature) ?? 0;
      if (count <= before) continue;
      leaked.push(
        baseline === undefined
          ? name
          : before === 0
            ? `${name} (${signature})`
            : `${name} (${before} -> ${count})`,
      );
    }
  }
  return leaked;
}

// Mirror `ActiveSupport::Testing::TimeHelpers#after_teardown` (time_helpers.rb:70-73),
// which Rails gets on every test case through the `super` chain.
afterEach(() => {
  afterTeardown();
});

afterAll(() => {
  expect(
    writingPoolsLeakedSinceBaseline(),
    "This file left connection pool(s) in the writing list. Remove them in " +
      "teardown (removeConnection() / connectionHandler.removeConnectionPool(name)): " +
      "the next file to run in this worker pins and verifies every writing pool, " +
      "and fails on yours instead of on this one.",
  ).toEqual([]);
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
  const oldZone = timeZone();
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
