/**
 * Per-adapter opt-out for the Phase 6.3 global BEGIN/ROLLBACK wrap.
 * Mirrors Rails' `self.use_transactional_tests = false` (per-test-class
 * in Rails; per-adapter here since adapters are the per-test-file unit
 * in trails). Written by `defineSchema(..., { useTransactionalTests })`,
 * read by `withTransactionalFixtures`'s `beforeAll` to decide whether to
 * activate the BEGIN/ROLLBACK wrap for that file (and by any future
 * helper that needs the same signal). A WeakMap keeps the flag off the
 * adapter's public surface
 * (it's purely a test concern) and avoids leaking adapters across
 * test files.
 *
 * @internal
 */

const _useTransactionalTests = new WeakMap<object, boolean>();

/** @internal */
export function setUseTransactionalTests(adapter: object, value: boolean): void {
  _useTransactionalTests.set(adapter, value);
}

/**
 * Read the per-adapter opt-out for transactional fixtures. Defaults to
 * `true` when the adapter has never been seen — the Phase 6.3 wrap is
 * on-by-default, and `defineSchema` always records an explicit value
 * before any DDL runs, so an unseen adapter means the file never called
 * `defineSchema` (e.g. test-helper unit tests) and the wrap is harmless.
 *
 * @internal
 */
export function getUseTransactionalTests(adapter: object): boolean {
  return _useTransactionalTests.get(adapter) ?? true;
}
