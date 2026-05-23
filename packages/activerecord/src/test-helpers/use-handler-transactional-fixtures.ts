import { afterAll } from "vitest";
import { Base } from "../base.js";
import { clearAppliedSchemaSignatures } from "./define-schema.js";
import { dropAllTables } from "./drop-all-tables.js";
import {
  withTransactionalFixtures,
  type TransactionalFixturesAdapter,
} from "./with-transactional-fixtures.js";

/**
 * Handler-resolved variant of {@link withTransactionalFixtures} for Phase D-1
 * test suites that bootstrap their adapter through `setupHandlerSuite()`
 * instead of constructing one directly via `createTestAdapter()`.
 *
 * Two pieces of plumbing that every D-1 file otherwise duplicates inline:
 *
 *   1. `withTransactionalFixtures(() => Base.adapter)` opens a per-test
 *      transaction in `beforeEach` (via the pool's fixture-pin slot, so
 *      it's visible from any AsyncLocalStorage context vitest happens to
 *      run beforeEach/it/afterEach in) and rolls back in `afterEach`. The
 *      pool fixture-pin work lives in `ConnectionPool#pinConnectionBang`
 *      under the `{ fixture: true }` flag.
 *   2. `afterAll` drops all tables + clears applied-schema signatures so
 *      the next file in the worker can re-`defineSchema` from a clean slate.
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
  afterAll(async () => {
    const adapter = Base.adapter;
    await dropAllTables(adapter);
    clearAppliedSchemaSignatures(adapter);
  });
}
