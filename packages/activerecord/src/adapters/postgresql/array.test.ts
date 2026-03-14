/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/array_test.rb
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

  describe("PostgresqlArrayTest", () => {
    it.skip("not compatible with serialize array", async () => {});
    it.skip("array with serialized attributes", async () => {});
    it.skip("default strings", async () => {});
    it.skip("change column with array", async () => {});
    it.skip("change column from non array to array", async () => {});
    it.skip("change column cant make non array column to array", async () => {});
    it.skip("change column default with array", async () => {});
    it.skip("type cast array", async () => {});
    it.skip("type cast integers", async () => {});
    it.skip("select with strings", async () => {});
    it.skip("rewrite with strings", async () => {});
    it.skip("select with integers", async () => {});
    it.skip("rewrite with integers", async () => {});
    it.skip("multi dimensional with strings", async () => {});
    it.skip("with empty strings", async () => {});
    it.skip("with multi dimensional empty strings", async () => {});
    it.skip("with arbitrary whitespace", async () => {});
    it.skip("multi dimensional with integers", async () => {});
    it.skip("strings with quotes", async () => {});
    it.skip("strings with commas", async () => {});
    it.skip("strings with array delimiters", async () => {});
    it.skip("strings with null strings", async () => {});
    it.skip("insert fixture", async () => {});
    it.skip("attribute for inspect for array field", async () => {});
    it.skip("attribute for inspect for array field for large array", async () => {});
    it.skip("escaping", async () => {});
    it.skip("string quoting rules match pg behavior", async () => {});
    it.skip("quoting non standard delimiters", async () => {});
    it.skip("mutate array", async () => {});
    it.skip("mutate value in array", async () => {});
    it.skip("datetime with timezone awareness", async () => {});
    it.skip("assigning non array value", async () => {});
    it.skip("assigning empty string", async () => {});
    it.skip("assigning valid pg array literal", async () => {});
    it.skip("where by attribute with array", async () => {});
    it.skip("uniqueness validation", async () => {});
    it.skip("encoding arrays of utf8 strings", async () => {});
    it.skip("precision is respected on timestamp columns", async () => {});
  });
});
