/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/change_schema_test.rb
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

  describe("PostgresqlChangeSchemaTest", () => {
    it.skip("change column", async () => {});
    it.skip("change column with null", async () => {});
    it.skip("change column with default", async () => {});
    it.skip("change column default with null", async () => {});
    it.skip("change column null", async () => {});
    it.skip("change column scale", async () => {});
    it.skip("change column precision", async () => {});
    it.skip("change column limit", async () => {});
    it.skip("change string to date", async () => {});
    it.skip("change type with symbol", async () => {});
    it.skip("change type with symbol with timestamptz", async () => {});
    it.skip("change type with symbol using datetime", async () => {});
    it.skip("change type with symbol using timestamp with timestamptz as default", async () => {});
    it.skip("change type with symbol with timestamptz as default", async () => {});
    it.skip("change type with symbol using datetime with timestamptz as default", async () => {});
    it.skip("change type with array", async () => {});
  });
});
