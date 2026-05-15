/**
 * AR-only vitest setupFile. Wired into the `activerecord` project in
 * `vitest.config.ts`; the sibling `test-setup.ts` is shared with the
 * non-AR `other` project, so anything that imports the AR test adapter
 * (and thus opens a DB connection at module load) belongs here, not
 * there.
 */

// Self-registers the better-sqlite3 driver so the AR test adapter can resolve
// it via getSqlite() without each test bootstrapping the registry. Lives here
// (not in activerecord/index.ts) to keep better-sqlite3 a true optional peer
// for non-test consumers.
import "@blazetrails/activesupport/sqlite/better-sqlite3";
import { beforeEach } from "vitest";
import { resetTestAdapterState, shouldSkipGlobalReset } from "./test-adapter.js";

// Wipe shared test-adapter state before every test. The previous lazy
// "clean up on first DB op of next test" model left a window where a
// prior test's recovery path (handleMissingSchemaError) could mutate
// _createdTables/_declaredColumns between cleanup and the next test's
// schema setup, causing intermittent failures (count→0, queries against
// stale schemas). Eager reset closes that window.
beforeEach(async () => {
  if (shouldSkipGlobalReset()) return;
  await resetTestAdapterState();
});
