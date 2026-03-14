/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/bit_string_test.rb
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

  describe("PostgresqlBitStringTest", () => {
    it.skip("bit string", async () => {});
    it.skip("bit string default", async () => {});
    it.skip("bit string type cast", async () => {});
    it.skip("bit string invalid", async () => {});
    it.skip("varbit string", async () => {});
    it.skip("varbit string default", async () => {});
    it.skip("bit string column", async () => {});
    it.skip("bit string varying column", async () => {});
    it.skip("assigning invalid hex string raises exception", async () => {});
  });
});
