import { beforeAll, afterAll } from "vitest";
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
 * Wires up three pieces of teardown / fixture plumbing that every D-1 file
 * otherwise duplicates inline:
 *
 *   1. Captures `Base.adapter` once `setupHandlerSuite()` has bootstrapped
 *      the handler, wrapping it in a Proxy that hides the `pool`
 *      back-reference. This forces `withTransactionalFixtures` down its
 *      non-pooled BEGIN/ROLLBACK path on the single leased connection —
 *      the pooled pin path requires a second free connection and deadlocks
 *      under pool size 1 (see [[project_pool_epic_d_handler_sqlite_constraint]]).
 *   2. Registers `withTransactionalFixtures(() => proxied)` so every test
 *      runs inside an outer transaction that is rolled back at file exit.
 *   3. Drops all tables + clears applied-schema signatures in `afterAll`
 *      so the next file in the worker can re-`defineSchema` from a clean
 *      slate.
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
  let txAdapter: TransactionalFixturesAdapter | null = null;
  beforeAll(() => {
    const raw = Base.adapter;
    txAdapter = new Proxy(raw, {
      get(target, prop) {
        if (prop === "pool") return null;
        return Reflect.get(target, prop, target);
      },
    }) as unknown as TransactionalFixturesAdapter;
  });
  withTransactionalFixtures(() => txAdapter!);
  afterAll(async () => {
    const adapter = Base.adapter;
    await dropAllTables(adapter);
    clearAppliedSchemaSignatures(adapter);
  });
}
