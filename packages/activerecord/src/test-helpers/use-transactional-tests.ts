import { Base } from "../base.js";
import { bootstrapTestHandler } from "./bootstrap-test-handler.js";
import {
  withTransactionalFixtures,
  type WithTransactionalFixturesOptions,
} from "./with-transactional-fixtures.js";

/**
 * Opt-in per-test transaction isolation for the primary `Base.connection` path.
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
 * survives across tests in the file. When the describe scope exits,
 * `resetTestAdapterState` runs exactly once to clean up for the next file.
 *
 * **When to use this vs `setupHandlerSuite + useHandlerTransactionalFixtures`:**
 * Use `useTransactionalTests()` for self-contained test files that want the
 * handler bootstrapped automatically. Use `setupHandlerSuite()` +
 * `useHandlerTransactionalFixtures()` when the file is part of a suite that
 * shares a long-lived handler across multiple describes — `setupHandlerSuite`
 * keeps the adapter alive across files whereas `useTransactionalTests` fires
 * `resetTestAdapterState` on exit (depth reaches zero), tearing down the pool.
 *
 * Call once at file/describe scope to opt in:
 *
 *   useTransactionalTests();
 *
 *   beforeAll(async () => {
 *     await defineSchema({ posts: { title: "string" } });
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
 */
export function useTransactionalTests(options?: WithTransactionalFixturesOptions): void {
  // bootstrapTestHandler and pushSkipGlobalReset run in the same beforeAll
  // hook so a bootstrap failure does not leave pushSkipGlobalReset orphaned
  // (matches the idiom in setupHandlerSuite). bootstrapTestHandler is
  // idempotent (guarded by !Base.isConnectedQ()), so calling it from both
  // setupHandlerSuite and useTransactionalTests in the same file is safe.
  withTransactionalFixtures(() => Base.connection, {
    ...options,
    _beforeAll: bootstrapTestHandler,
  });
}
