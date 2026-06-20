import { describe, it } from "vitest";
import { adapterType } from "./test-adapter.js";

describe("HotCompatibilityTest", () => {
  it.skip("insert after remove_column", () => {
    // BLOCKED: schema-cache hot-reload — warm schema cache, remove_column via raw
    // connection, verify INSERT succeeds with stale cache (Rails hot_compatibility_test.rb:25-43).
  });
  it.skip("update after remove_column", () => {
    // BLOCKED: schema-cache hot-reload — same setup as above but for UPDATE path
    // (Rails hot_compatibility_test.rb:45-57).
  });
  // Rails gates these on current_adapter?(:PostgreSQL) + prepared_statements.
  it.skipIf(adapterType !== "postgres")(
    "cleans up after prepared statement failure in a transaction",
    (ctx) => {
      // BLOCKED: requires two pool connections + PG PreparedStatementCacheExpired
      // detection after DDL on a second connection mid-transaction
      // (Rails hot_compatibility_test.rb:59-84).
      ctx.skip();
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "cleans up after prepared statement failure in nested transactions",
    (ctx) => {
      // BLOCKED: same as above but across nested savepoints
      // (Rails hot_compatibility_test.rb:86-115).
      ctx.skip();
    },
  );
});
