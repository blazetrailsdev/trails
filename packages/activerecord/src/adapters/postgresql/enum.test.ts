/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/enum_test.rb
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

  describe("PostgresqlEnumTest", () => {
    it.skip("column", async () => {});
    it.skip("enum default", async () => {});
    it.skip("enum type cast", async () => {});
    it.skip("enum mapping", async () => {});
    it.skip("invalid enum value", async () => {});
    it.skip("create enum", async () => {});
    it.skip("drop enum", async () => {});
    it.skip("rename enum", async () => {});
    it.skip("add enum value", async () => {});
    it.skip("add enum value before", async () => {});
    it.skip("add enum value after", async () => {});
    it.skip("enum schema dump", async () => {});
    it.skip("enum where", async () => {});
    it.skip("enum order", async () => {});
    it.skip("enum pluck", async () => {});
    it.skip("enum distinct", async () => {});
    it.skip("enum group", async () => {});
    it.skip("enum migration", async () => {});
    it.skip("enum array", async () => {});
    it.skip("enum defaults", () => {});
    it.skip("invalid enum update", () => {});
    it.skip("no oid warning", () => {});
    it.skip("assigning enum to nil", () => {});
    it.skip("schema dump renamed enum", () => {});
    it.skip("schema dump renamed enum with to option", () => {});
    it.skip("schema dump added enum value", () => {});
    it.skip("schema dump renamed enum value", () => {});
    it.skip("works with activerecord enum", () => {});
    it.skip("enum type scoped to schemas", () => {});
    it.skip("enum type explicit schema", () => {});
    it.skip("schema dump scoped to schemas", () => {});
    it.skip("schema load scoped to schemas", () => {});
  });
});
