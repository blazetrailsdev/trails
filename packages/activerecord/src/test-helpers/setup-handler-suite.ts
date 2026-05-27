import { beforeAll, beforeEach, afterAll } from "vitest";
import { bootstrapTestHandler, syncHandlerVisitor } from "./bootstrap-test-handler.js";
import { pushSkipGlobalReset, popSkipGlobalReset } from "./skip-global-reset.js";

/**
 * One-call wiring for D-1..N handler-resolved test files.
 *
 * Bootstraps `Base.connectionHandler` once per worker and prevents the global
 * `resetTestAdapterState()` from wiping shared-DB tables across tests in the
 * file. Mirrors Rails' `setup_fixtures` / `teardown_fixtures` pattern at the
 * test-case level.
 *
 * @internal
 */
export function setupHandlerSuite(): void {
  beforeAll(async () => {
    await bootstrapTestHandler();
    pushSkipGlobalReset();
  });
  // Re-sync after every test because test-setup.ts afterEach resets the
  // global visitor to the default Visitors.ToSql.
  beforeEach(() => {
    syncHandlerVisitor();
  });
  afterAll(() => {
    popSkipGlobalReset();
  });
}
