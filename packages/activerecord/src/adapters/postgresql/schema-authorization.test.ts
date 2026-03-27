/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/schema_authorization_test.rb
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

  describe("SchemaAuthorizationTest", () => {
    it.skip("schema authorization", async () => {});
    it.skip("schema authorization with quoted names", async () => {});
    it.skip("session authorization", async () => {});
    it.skip("reset authorization", async () => {});
    it.skip("sequence schema authorization", async () => {});
    it.skip("tables schema authorization", async () => {});
    it.skip("schema invisible", () => {});
    it.skip("session auth=", () => {});
    it.skip("setting auth clears stmt cache", () => {});
    it.skip("auth with bind", () => {});
    it.skip("sequence schema caching", () => {});
    it.skip("tables in current schemas", () => {});
  });
});
