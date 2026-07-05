import { Base } from "../base.js";
import { withTransactionalFixtures } from "./with-transactional-fixtures.js";

/**
 * Handler-resolved variant of {@link withTransactionalFixtures} for Phase D-1
 * test suites that bootstrap their adapter through `setupHandlerSuite()`
 * instead of constructing one directly.
 *
 * `withTransactionalFixtures(() => Base.adapter)` opens a per-test
 * transaction in `beforeEach` (via the pool's fixture-pin slot, so it's
 * visible from any AsyncLocalStorage context vitest happens to run
 * beforeEach/it/afterEach in) and rolls back in `afterEach`. The pool
 * fixture-pin work lives in `ConnectionPool#pinConnectionBang` under the
 * `{ fixture: true }` flag.
 *
 * Phase D-Z: `afterAll` no longer drops tables. SAVEPOINT/rollback already
 * cleans up test data; the canonical tables laid down once at boot persist
 * empty across files. Files with bespoke schemas call `dropAllTables`
 * explicitly.
 *
 * Pair with `setupHandlerSuite()`:
 *
 *   setupHandlerSuite();
 *   useHandlerTransactionalFixtures();
 *
 *   beforeAll(async () => {
 *     await loadCanonicalSchema(Base.connection);
 *   });
 *
 * @internal
 */
export function useHandlerTransactionalFixtures(): void {
  withTransactionalFixtures(() => Base.connection);
}
