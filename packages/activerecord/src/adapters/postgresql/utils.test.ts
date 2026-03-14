/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/utils_test.rb
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

  describe("PostgresqlUtilsTest", () => {
    it.skip("reset pk sequence on empty table", async () => {});
    it.skip("reset pk sequence with custom pk", async () => {});
    it.skip("distinct zero", async () => {});
    it.skip("distinct one", async () => {});
    it.skip("distinct multiple", async () => {});
    it.skip("extract schema qualified name", () => {});
    it.skip("represents itself as schema.name", () => {});
    it.skip("without schema, represents itself as name only", () => {});
    it.skip("quoted returns a string representation usable in a query", () => {});
    it.skip("prevents double quoting", () => {});
    it.skip("equality based on state", () => {});
    it.skip("can be used as hash key", () => {});
  });
});
