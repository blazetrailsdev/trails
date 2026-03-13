/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/uuid_test.rb
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

  describe("PostgresqlUUIDTest", () => {
    it.skip("uuid column", async () => {});
    it.skip("uuid default", async () => {});
    it.skip("uuid type cast", async () => {});
    it.skip("uuid write", async () => {});
    it.skip("uuid select", async () => {});
    it.skip("uuid where", async () => {});
    it.skip("uuid order", async () => {});
    it.skip("uuid pluck", async () => {});
    it.skip("uuid primary key", async () => {});
    it.skip("uuid primary key default", async () => {});
    it.skip("uuid primary key insert", async () => {});
    it.skip("uuid pk with auto populate", async () => {});
    it.skip("uuid pk create", async () => {});
    it.skip("uuid pk find", async () => {});
    it.skip("uuid schema dump", async () => {});
    it.skip("uuid migration", async () => {});
    it.skip("uuid gen random uuid", async () => {});
    it.skip("uuid gen random uuid default", async () => {});
    it.skip("uuid invalid", async () => {});
    it.skip("uuid nil", async () => {});
    it.skip("uuid blank", async () => {});
    it.skip("uuid uniqueness", async () => {});
    it.skip("uuid array", async () => {});
    it.skip("uuid in relation", async () => {});
    it.skip("uuid association", async () => {});
    it.skip("uuid foreign key", async () => {});
    it.skip("uuid index", async () => {});
    it.skip("uuid change column", async () => {});
    it.skip("uuid remove column", async () => {});
    it.skip("uuid column default", () => {});
    it.skip("change column default", () => {});
    it.skip("add column with null true and default nil", () => {});
    it.skip("add column with default array", () => {});
    it.skip("data type of uuid types", () => {});
    it.skip("treat blank uuid as nil", () => {});
    it.skip("treat invalid uuid as nil", () => {});
    it.skip("invalid uuid dont modify before type cast", () => {});
    it.skip("invalid uuid dont match to nil", () => {});
    it.skip("uuid change format does not mark dirty", () => {});
    it.skip("acceptable uuid regex", () => {});
    it.skip("uuid formats", () => {});
    it.skip("uniqueness validation ignores uuid", () => {});
    it.skip("id is uuid", () => {});
    it.skip("id has a default", () => {});
    it.skip("auto create uuid", () => {});
    it.skip("pk and sequence for uuid primary key", () => {});
    it.skip("schema dumper for uuid primary key", () => {});
    it.skip("schema dumper for uuid primary key with custom default", () => {});
    it.skip("schema dumper for uuid primary key default", () => {});
    it.skip("schema dumper for uuid primary key default in legacy migration", () => {});
    it.skip("id allows default override via nil", () => {});
    it.skip("schema dumper for uuid primary key with default override via nil", () => {});
    it.skip("schema dumper for uuid primary key with default nil in legacy migration", () => {});
    it.skip("collection association with uuid", () => {});
    it.skip("find with uuid", () => {});
    it.skip("find by with uuid", () => {});
    it.skip("uuid primary key and disable joins with delegate cache", () => {});
  });
});
