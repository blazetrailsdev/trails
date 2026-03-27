/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/deferred_constraints_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlDeferredConstraintsTest", () => {
    it.skip("deferrable initially deferred", async () => {});
    it.skip("deferrable initially immediate", async () => {});
    it.skip("not deferrable", async () => {});
    it.skip("set constraints all deferred", async () => {});
    it.skip("set constraints all immediate", async () => {});
    it.skip("defer constraints", async () => {});
    it.skip("defer constraints with specific fk", async () => {});
    it.skip("defer constraints with multiple fks", async () => {});
    it.skip("defer constraints only defers single fk", async () => {});
    it.skip("set constraints requires valid value", async () => {});
  });
});
