import { beforeAll, afterAll } from "vitest";

/**
 * Refcount of active `withTransactionalFixtures` / `skipGlobalResetForFile`
 * scopes. When > 0, the global beforeEach in cases/helper.ts skips
 * resetTestAdapterState() so a one-time schema set up in `beforeAll` survives
 * across tests in the file.
 * Refcounted (not a bool) so nested describes / multiple suites that each
 * call withTransactionalFixtures don't clobber an outer scope's skip when
 * an inner scope's afterAll runs. Mirrors Rails ConnectionPool's
 * `@pinned_connections_depth` (connection_pool.rb:327, 345).
 *
 * The reset being shielded has no Rails counterpart: Rails'
 * `TestFixtures#teardown_fixtures` rolls the per-test transaction back and
 * clears active connections (`test_fixtures.rb:146-158`) — it never truncates
 * or drops tables between tests, because every suite rides the one schema
 * `db:test:prepare` laid down. trails still needs `resetTestAdapterState`
 * because files that create bespoke, non-canonical tables leak them into the
 * shared worker DB where the next file would see them. Retiring the reset —
 * and with it this whole shield — is therefore gated on the canonical-schema
 * burndown and tracked as its own story; don't grow new shield callers
 * meanwhile.
 *
 * @internal
 */

let _skipGlobalResetDepth = 0;

/** @internal */
export function pushSkipGlobalReset(): void {
  _skipGlobalResetDepth += 1;
}

/** @internal */
export function popSkipGlobalReset(): number {
  if (_skipGlobalResetDepth > 0) _skipGlobalResetDepth -= 1;
  return _skipGlobalResetDepth;
}

/** @internal */
export function shouldSkipGlobalReset(): boolean {
  return _skipGlobalResetDepth > 0;
}

/**
 * Hold the shield for the enclosing file/describe scope, so schema laid once
 * in `beforeAll` survives every test under it.
 *
 * Unlike `withTransactionalFixtures`, which pushes the same shield and pops it
 * with a final `resetTestAdapterState()`, this pushes and pops the refcount
 * only. Note the interaction when both wrap one scope (as `fixtures()` does):
 * this outer push keeps the transactional helper's pop from reaching zero, so
 * no reset runs at scope exit — the canonical tables it would clear are
 * exactly the ones the next file expects to find already laid.
 *
 * @internal
 */
export function skipGlobalResetForFile(): void {
  beforeAll(() => {
    pushSkipGlobalReset();
  });
  afterAll(() => {
    popSkipGlobalReset();
  });
}
