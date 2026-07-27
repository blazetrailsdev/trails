import { beforeAll, afterAll } from "vitest";
import { pushSkipGlobalReset, popSkipGlobalReset } from "./skip-global-reset.js";

/**
 * One-call wiring for D-1..N handler-resolved test files.
 *
 * Prevents the global `resetTestAdapterState()` from wiping shared-DB tables
 * across tests in the file. Mirrors Rails' `setup_fixtures` /
 * `teardown_fixtures` pattern at the test-case level.
 *
 * @internal
 */
export function setupHandlerSuite(): void {
  beforeAll(() => {
    pushSkipGlobalReset();
  });
  afterAll(() => {
    popSkipGlobalReset();
  });
}
