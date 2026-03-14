/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/interval_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlIntervalTest", () => {
    it.skip("column", async () => {});
    it.skip("default", async () => {});
    it.skip("type cast interval", async () => {});
    it.skip("interval write", async () => {});
    it.skip("interval iso 8601", async () => {});
    it.skip("interval schema dump", async () => {});
    it.skip("interval where", async () => {});
    it.skip("interval type", () => {});
    it.skip("interval type cast from invalid string", () => {});
    it.skip("interval type cast from numeric", () => {});
    it.skip("interval type cast string and numeric from user", () => {});
    it.skip("average interval type", () => {});
    it.skip("schema dump with default value", () => {});
  });
});
