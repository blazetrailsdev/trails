/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/virtual_column_test.rb
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

  describe("PostgresqlVirtualColumnTest", () => {
    it.skip("virtual column", async () => {});
    it.skip("virtual column default", async () => {});
    it.skip("virtual column type cast", async () => {});
    it.skip("virtual column write", async () => {});
    it.skip("virtual column schema dump", async () => {});
    it.skip("virtual column migration", async () => {});
    it.skip("virtual column stored", async () => {});
    it.skip("non persisted column", async () => {});
  });

  describe("PostgresqlXmlTest", () => {
    it.skip("xml column", async () => {});
    it.skip("xml default", async () => {});
    it.skip("xml type cast", async () => {});
    it.skip("xml write", async () => {});
    it.skip("xml schema dump", async () => {});
    it.skip("null xml", async () => {});
    it.skip("round trip", async () => {});
  });
  it.skip("virtual column with full inserts", () => {
    /* needs PostgreSQL GENERATED ALWAYS AS ... STORED syntax (no VIRTUAL in PG) */
  });

  it.skip("stored column", () => {});

  it.skip("change table", () => {});
});
