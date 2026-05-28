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
import { resetTestAdapterState } from "./test-adapter.js";
import { shouldSkipGlobalReset } from "./test-helpers/skip-global-reset.js";

// Wipe shared test-adapter state before every test so each test starts
// from a clean slate.
beforeEach(async () => {
  if (shouldSkipGlobalReset()) return;
  await resetTestAdapterState();
});
