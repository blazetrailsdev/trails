/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/type_lookup_test.rb
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

  describe("PostgresqlTypeLookupTest", () => {
    it.skip("type lookup", async () => {});
    it.skip("type lookup array", async () => {});
    it.skip("type lookup custom", async () => {});
    it.skip("array delimiters are looked up correctly", () => {});
    it.skip("array types correctly respect registration of subtypes", () => {});
    it.skip("range types correctly respect registration of subtypes", () => {});
  });
});
