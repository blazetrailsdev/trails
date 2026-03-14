/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/optimizer_hints_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlOptimizerHintsTest", () => {
    it.skip("optimizer hints", async () => {});
    it.skip("optimizer hints with count", async () => {});
    it.skip("optimizer hints with delete all", async () => {});
    it.skip("optimizer hints with update all", async () => {});
    it.skip("optimizer hints with pluck", async () => {});
  });
  it.skip("optimizer hints with count subquery", () => {});

  it.skip("optimizer hints is sanitized", () => {});

  it.skip("optimizer hints with unscope", () => {});

  it.skip("optimizer hints with or", () => {});
});
