/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/bytea_test.rb
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

  describe("PostgresqlByteaTest", () => {
    it.skip("column", async () => {});
    it.skip("default", async () => {});
    it.skip("type cast binary column", async () => {});
    it.skip("type cast bytea", async () => {});
    it.skip("type cast bytea empty string", async () => {});
    it.skip("type cast bytea nil", async () => {});
    it.skip("write and read", async () => {});
    it.skip("write and read with url safe base64", async () => {});
    it.skip("write nothing", async () => {});
    it.skip("write nil", async () => {});
    it.skip("write empty string", async () => {});
    it.skip("write with hex format", async () => {});
    it.skip("write with escape format", async () => {});
    it.skip("write via fixture", async () => {});
    it.skip("binary columns are limitless the upper limit is one GB", () => {});
    it.skip("type cast binary converts the encoding", () => {});
    it.skip("type cast binary value", () => {});
    it.skip("type case nil", () => {});
    it.skip("read value", () => {});
    it.skip("read nil value", () => {});
    it.skip("write value", () => {});
    it.skip("via to sql", () => {});
    it.skip("via to sql with complicating connection", () => {});
    it.skip("write binary", () => {});
    it.skip("serialize", () => {});
  });
});
