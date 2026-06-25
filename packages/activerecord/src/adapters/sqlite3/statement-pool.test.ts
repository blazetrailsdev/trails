import { it } from "vitest";
import { describeIfSqlite } from "./test-helper.js";

describeIfSqlite("SQLite3StatementPoolTest", () => {
  // Rails' only test here is guarded by `Process.respond_to?(:fork)` and forks a
  // child to prove the StatementPool cache is per-pid. trails has no `fork`
  // primitive (process.* is banned), so the test is unportable; kept skipped to
  // preserve the convention mapping to statement_pool_test.rb.
  it.skip("cache is per pid", () => {});
});
