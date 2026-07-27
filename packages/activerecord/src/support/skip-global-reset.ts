/**
 * Refcount of active `withTransactionalFixtures` scopes. When > 0, the
 * global beforeEach in test-setup-ar.ts skips resetTestAdapterState() so a
 * one-time schema set up in `beforeAll` survives across tests in the file.
 * Refcounted (not a bool) so nested describes / multiple suites that each
 * call withTransactionalFixtures don't clobber an outer scope's skip when
 * an inner scope's afterAll runs. Mirrors Rails ConnectionPool's
 * `@pinned_connections_depth` (connection_pool.rb:327, 345).
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
