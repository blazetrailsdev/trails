/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/xml_test.rb
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

  describe("PostgreSQLXMLTest", () => {
    it.skip("xml column", async () => {});
    it.skip("xml default", async () => {});
    it.skip("xml type cast", async () => {});
    it.skip("xml write", async () => {});
    it.skip("xml schema dump", async () => {});
    it.skip("null xml", async () => {});
    it.skip("round trip", async () => {});
    it.skip("update all", () => {
      /* TODO: needs imports from original file */
    });
  });
});
