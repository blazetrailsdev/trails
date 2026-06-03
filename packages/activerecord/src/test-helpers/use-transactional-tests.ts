import { beforeAll } from "vitest";
import { Base } from "../base.js";
import { bootstrapTestHandler } from "./bootstrap-test-handler.js";
import {
  withTransactionalFixtures,
  type TransactionalFixturesAdapter,
  type WithTransactionalFixturesOptions,
} from "./with-transactional-fixtures.js";

/**
 * Opt-in per-test transaction isolation for the primary Base.connection path.
 * Mirrors Rails' `use_transactional_tests = true` (default in TestFixtures).
 *
 * Each test body is wrapped in a transaction that rolls back in afterEach,
 * so inserts, updates, and deletes are discarded without re-running schema
 * DDL between tests. On PostgreSQL and SQLite, DDL executed inside an it()
 * body also rolls back (both support transactional DDL). On MySQL, DDL
 * auto-commits and escapes the wrap — schema work must happen in beforeAll
 * on MySQL.
 *
 * Schema set up in beforeAll (before the per-test transaction opens)
 * survives across tests in the file.
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
 */
export function useTransactionalTests(options?: WithTransactionalFixturesOptions): void {
  // bootstrapTestHandler is idempotent; this ensures Base.connection is
  // reachable from the withTransactionalFixtures beforeEach even in test
  // files that do not call setupHandlerSuite() separately.
  beforeAll(async () => {
    await bootstrapTestHandler();
  });
  withTransactionalFixtures(() => Base.connection as TransactionalFixturesAdapter, options);
}
