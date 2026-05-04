/**
 * AR-only vitest setupFile. Wired into the `activerecord` project in
 * `vitest.config.ts`; the sibling `test-setup.ts` is shared with the
 * non-AR `other` project, so anything that imports the AR test adapter
 * (and thus opens a DB connection at module load) belongs here, not
 * there.
 */

import { beforeEach } from "vitest";
import { resetTestAdapterState } from "./test-adapter.js";

// Wipe shared test-adapter state before every test. The previous lazy
// "clean up on first DB op of next test" model left a window where a
// prior test's recovery path (handleMissingSchemaError) could mutate
// _createdTables/_declaredColumns between cleanup and the next test's
// schema setup, causing intermittent failures (count→0, queries against
// stale schemas). Eager reset closes that window.
beforeEach(async () => {
  await resetTestAdapterState();
});
