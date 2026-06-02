import { describe, it } from "vitest";

describe("HotCompatibilityTest", () => {
  it.skip("insert after remove_column", () => {
    // BLOCKED: schema-cache hot-reload — warm schema cache, remove_column via raw
    // connection, verify INSERT succeeds with stale cache (Rails hot_compatibility_test.rb:25-43).
  });
  it.skip("update after remove_column", () => {
    // BLOCKED: schema-cache hot-reload — same setup as above but for UPDATE path
    // (Rails hot_compatibility_test.rb:45-57).
  });
  it.skip("cleans up after prepared statement failure in a transaction", () => {
    // BLOCKED: describeIfPg — requires two pool connections + PG PreparedStatementCacheExpired
    // detection after DDL on a second connection mid-transaction
    // (Rails hot_compatibility_test.rb:59-84, gated on PostgreSQLAdapter + prepared_statements).
  });
  it.skip("cleans up after prepared statement failure in nested transactions", () => {
    // BLOCKED: describeIfPg — same as above but across nested savepoints
    // (Rails hot_compatibility_test.rb:86-115).
  });
});
