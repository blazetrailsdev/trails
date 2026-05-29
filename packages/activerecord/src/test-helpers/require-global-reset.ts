import { beforeAll, afterAll } from "vitest";
import { resetTestAdapterState } from "../test-adapter.js";

/**
 * Opt-in refcount for the global `beforeEach` reset in test-setup-ar.ts.
 *
 * Rails parity: schema is loaded once at suite start (`db:test:prepare`) and
 * never reset between tests — per-test cleanup is transactional rollback. The
 * global `resetTestAdapterState()` (which drops every table via a DB
 * round-trip *and* wipes the in-memory model registry) is therefore OFF by
 * default. A file that genuinely needs a full reset between tests — e.g. raw
 * DDL that auto-commits and can't be rolled back, or models redefined per
 * test — opts in via {@link useGlobalReset}.
 *
 * Refcounted (not a bool) so nested describes / multiple suites that each opt
 * in don't clobber an outer scope's request when an inner scope's afterAll
 * runs. Mirrors Rails ConnectionPool's `@pinned_connections_depth`
 * (connection_pool.rb:327, 345).
 *
 * @internal
 */

let _requireGlobalResetDepth = 0;

/** @internal */
export function pushRequireGlobalReset(): void {
  _requireGlobalResetDepth += 1;
}

/** @internal */
export function popRequireGlobalReset(): number {
  if (_requireGlobalResetDepth > 0) _requireGlobalResetDepth -= 1;
  return _requireGlobalResetDepth;
}

/** @internal */
export function shouldRunGlobalReset(): boolean {
  return _requireGlobalResetDepth > 0;
}

/**
 * Opt a test file into the global reset. Registers:
 *   - a `beforeAll` that enables the per-test `resetTestAdapterState` (drop
 *     tables + clear the model registry between every test in the file), and
 *   - an `afterAll` that pops the refcount and runs one final reset, so the
 *     file leaves no tables or model-registry state behind for the next file
 *     in the same worker (the shared per-worker DB in `test-adapter.ts`
 *     persists across files).
 *
 * Use for files that reuse the shared pool and/or redefine same-named models
 * across tests and therefore can't rely on transactional rollback alone.
 * Scoped deliberately: only opt-in files pay the reset, so files that manage
 * their own raw adapters/connections are never forced through it.
 *
 * @internal
 */
export function useGlobalReset(): void {
  // Guard the decrement so a schema `beforeAll` that throws before this
  // helper's `beforeAll` increments can't drive the depth negative on the
  // afterAll path (Vitest still runs afterAll after a failed beforeAll).
  let incremented = false;
  beforeAll(() => {
    pushRequireGlobalReset();
    incremented = true;
  });
  afterAll(async () => {
    // Only the outermost scope (depth back to zero) runs the final reset, so
    // an inner nested describe / second suite that opts in doesn't drop the
    // shared DB while an outer scope is still active. Mirrors Rails
    // ConnectionPool#unpin_connection! finalizing at depth zero
    // (connection_pool.rb:347).
    if (!incremented) return;
    incremented = false;
    if (popRequireGlobalReset() === 0) await resetTestAdapterState();
  });
}
