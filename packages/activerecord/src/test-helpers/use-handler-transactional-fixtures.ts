import { Base } from "../base.js";
import {
  withTransactionalFixtures,
  type TransactionalFixturesAdapter,
} from "./with-transactional-fixtures.js";

/**
 * Handler-resolved variant of {@link withTransactionalFixtures} for Phase D-1
 * test suites that bootstrap their adapter through `setupHandlerSuite()`
 * instead of constructing one directly via `createTestAdapter()`.
 *
 * `withTransactionalFixtures(() => Base.adapter)` opens a per-test
 * transaction in `beforeEach` (via the pool's fixture-pin slot, so it's
 * visible from any AsyncLocalStorage context vitest happens to run
 * beforeEach/it/afterEach in) and rolls back in `afterEach`. The pool
 * fixture-pin work lives in `ConnectionPool#pinConnectionBang` under the
 * `{ fixture: true }` flag.
 *
 * Phase D-Z: `afterAll` no longer drops tables or clears schema signatures.
 * SAVEPOINT/rollback already cleans up test data; canonical tables persist
 * empty across files so the next file's `defineSchema` skips DDL (cache hit)
 * and only resets auto-increment counters.
 * Files with bespoke schemas call `dropAllTables` explicitly (which clears
 * the signature cache so the next `defineSchema` re-creates correctly).
 *
 * Pair with `setupHandlerSuite()`:
 *
 *   setupHandlerSuite();
 *   useHandlerTransactionalFixtures();
 *
 *   beforeAll(async () => {
 *     await defineSchema({ topics: { title: "string" } });
 *   });
 *
 * @internal
 */
export function useHandlerTransactionalFixtures(): void {
  withTransactionalFixtures(() => Base.adapter as TransactionalFixturesAdapter);
}
