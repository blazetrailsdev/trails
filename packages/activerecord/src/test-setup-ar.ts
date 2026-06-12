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
import { loadDefaults } from "./trailtie.js";
import { resetTestAdapterState } from "./test-adapter.js";
import { shouldSkipGlobalReset } from "./test-helpers/skip-global-reset.js";

// The test app runs with the Rails 7.0+ defaults (`config.load_defaults 7.0`),
// which sets `config.active_record.partial_inserts = false` (partial_updates
// stays true). Use the versioned-defaults mechanism rather than poking Base
// directly; this exercises the real code path that a consuming app would use.
loadDefaults("7.0");

// Wipe shared test-adapter state before every test so each test starts
// from a clean slate.
beforeEach(async () => {
  if (shouldSkipGlobalReset()) return;
  await resetTestAdapterState();
});
