/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/optimizer_hints_test.rb
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

  describe("PostgreSQLOptimizerHintsTest", () => {
    it.skip("optimizer hints", async () => {});
    it.skip("optimizer hints with count", async () => {});
    it.skip("optimizer hints with delete all", async () => {});
    it.skip("optimizer hints with update all", async () => {});
    it.skip("optimizer hints with pluck", async () => {});

    it.skip("optimizer hints with count subquery", () => {});

    it.skip("optimizer hints is sanitized", () => {});

    it.skip("optimizer hints with unscope", () => {});

    it.skip("optimizer hints with or", () => {});
  });
});
