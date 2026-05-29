import { beforeAll, afterAll } from "vitest";
import { bootstrapTestHandler } from "./bootstrap-test-handler.js";
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
  afterAll(() => {
    popSkipGlobalReset();
  });
}
