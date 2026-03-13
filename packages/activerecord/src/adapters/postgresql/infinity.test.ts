/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/infinity_test.rb
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

  describe("PostgresqlInfinityTest", () => {
    it.skip("date positive infinity", async () => {});
    it.skip("date negative infinity", async () => {});
    it.skip("timestamp positive infinity", async () => {});
    it.skip("timestamp negative infinity", async () => {});
    it.skip("float positive infinity", async () => {});
    it.skip("float negative infinity", async () => {});
    it.skip("integer positive infinity", async () => {});
    it.skip("integer negative infinity", async () => {});
    it.skip("infinity where clause", async () => {});
    it.skip("type casting infinity on a float column", () => {});
    it.skip("type casting string on a float column", () => {});
    it.skip("update_all with infinity on a float column", () => {});
    it.skip("type casting infinity on a datetime column", () => {});
    it.skip("type casting infinity on a date column", () => {});
    it.skip("update_all with infinity on a datetime column", () => {});
    it.skip("assigning 'infinity' on a datetime column with TZ aware attributes", () => {});
    it.skip("where clause with infinite range on a datetime column", () => {});
    it.skip("where clause with infinite range on a date column", () => {});
  });
});
