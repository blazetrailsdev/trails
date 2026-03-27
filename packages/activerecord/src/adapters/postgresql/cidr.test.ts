/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/cidr_test.rb
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

  describe("CidrTest", () => {
    it.skip("cidr column", async () => {});
    it.skip("cidr type cast", async () => {});
    it.skip("cidr invalid", async () => {});
    it.skip("type casting IPAddr for database", async () => {});
    it.skip("casting does nothing with non-IPAddr objects", async () => {});
    it.skip("changed? with nil values", async () => {});
  });
});
