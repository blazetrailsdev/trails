/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/partitions_test.rb
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

  describe("PostgresqlPartitionsTest", () => {
    it.skip("partition table", async () => {});
    it.skip("partitions table exists", async () => {});
  });
});
