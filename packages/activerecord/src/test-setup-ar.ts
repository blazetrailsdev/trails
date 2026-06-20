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
import { resetTestAdapterState } from "./test-adapter.js";
import { shouldSkipGlobalReset } from "./test-helpers/skip-global-reset.js";

// AR-test ambient: match Rails' AR test suite exactly. Rails'
// activerecord/test/cases/helper.rb does NOT call `config.load_defaults`, so
// every test runs with the gem framework default `partial_inserts = true`
// (dirty.rb:50; `partial_updates` is also true). We therefore do NOT call
// `loadDefaults("7.0")` here — doing so would flip `partial_inserts = false`,
// modelling a Rails 7.0 *app* rather than Rails' *test suite*, and any ported
// test whose behavior depends on insert column selection would diverge from how
// Rails runs it (RFC 0023 ar-test-suite-partial-inserts-ambient-divergence).
// `Base` already defaults `partialInserts = true` (base.ts), so the ambient
// matches Rails with no setup; the real `loadDefaults` 7.0 path is still
// exercised by trailtie.test.ts and the gated MySQL defaults_test.rb port.

// Mirror Rails activerecord/test/cases/helper.rb:40
Base.automaticallyInvertPluralAssociations = true;

// Wipe shared test-adapter state before every test so each test starts
// from a clean slate.
beforeEach(async () => {
  if (shouldSkipGlobalReset()) return;
  await resetTestAdapterState();
});
