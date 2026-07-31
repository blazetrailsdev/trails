import { leaseFixtureConnection } from "./fixture-connection.js";
import {
  withTransactionalFixtures,
  type WithTransactionalFixturesOptions,
} from "./with-transactional-fixtures.js";

/**
 * Opt-in per-test transaction isolation for the primary pool-leased path.
 * Mirrors Rails' `use_transactional_tests = true` (default in `TestFixtures`).
 *
 * Each test body is wrapped in a transaction that rolls back in `afterEach`,
 * so inserts, updates, and deletes are discarded without re-running schema
 * DDL between tests. On PostgreSQL and SQLite, DDL executed inside an `it()`
 * body also rolls back (both support transactional DDL). On MySQL, DDL
 * auto-commits and escapes the wrap — schema work must happen in `beforeAll`
 * on MySQL.
 *
 * Schema set up in `beforeAll` (before the per-test transaction opens)
 * survives across tests in the file — nothing truncates or drops tables
 * between tests, matching Rails' `teardown_fixtures`, which only rolls the
 * transaction back and clears active connections without removing the pool
 * (`test_fixtures.rb:125-158`).
 *
 * **When to use this vs `withTransactionalFixtures`:** both ride the worker's
 * own pool, which `test-setup-dy.ts` establishes once and leaves up for the
 * whole worker, as `ARTest.connect` does for the whole Rails process
 * (`support/connection.rb:31-32`). Neither opens or closes it.
 * `useTransactionalTests()` wraps the `Base.connection` path;
 * `withTransactionalFixtures(leaseFixtureConnection)` takes an explicit
 * adapter thunk and is what `fixtures()` wires.
 *
 * Call once at file/describe scope to opt in:
 *
 *   useTransactionalTests();
 *
 *   beforeAll(async () => {
 *     await loadCanonicalSchema(Base.connection);
 *   });
 *
 *   it("inserts without leaking to the next test", async () => {
 *     await Post.create({ title: "hello" });
 *     expect(await Post.count()).toBe(1);
 *   });
 *
 *   it("sees zero posts because the previous insert was rolled back", async () => {
 *     expect(await Post.count()).toBe(0);
 *   });
 *
 * Tests that must observe real commits (e.g. `after_commit` callbacks or
 * concurrent-connection visibility) opt out via `usesTransaction`, mirroring
 * Rails' `uses_transaction :method_name` (`test_fixtures.rb:88-95`):
 *
 *   useTransactionalTests({ usesTransaction: ["fires after_commit callback"] });
 *
 *   it("fires after_commit callback", async () => { ... }); // no outer txn
 *
 * NOTE: distinct from the same-named *option field*
 * `WithTransactionalFixturesOptions.useTransactionalTests` (a boolean consumed
 * by `fixtures()` to select the non-transactional mode).
 * This is a no-arg opt-in *function*; that is `{ useTransactionalTests: false }`.
 */
export function useTransactionalTests(options?: WithTransactionalFixturesOptions): void {
  withTransactionalFixtures(leaseFixtureConnection, options);
}
