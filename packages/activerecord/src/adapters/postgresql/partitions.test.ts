/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/partitions_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlPartitionsTest", () => {
    it("partition table", async () => {
      try {
        await adapter.exec(
          `CREATE TABLE partition_test_parent (id integer, grp integer) PARTITION BY LIST (grp)`,
        );
        await adapter.exec(
          `CREATE TABLE partition_test_child PARTITION OF partition_test_parent FOR VALUES IN (1)`,
        );
        const tables = await adapter.tables();
        expect(tables).toContain("partition_test_parent");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS partition_test_child`);
        await adapter.exec(`DROP TABLE IF EXISTS partition_test_parent`);
      }
    });
    it("partitions table exists", async () => {
      try {
        await adapter.exec(
          `CREATE TABLE partition_exists_parent (id integer, grp integer) PARTITION BY LIST (grp)`,
        );
        await adapter.exec(
          `CREATE TABLE partition_exists_child PARTITION OF partition_exists_parent FOR VALUES IN (1)`,
        );
        expect(await adapter.tableExists("partition_exists_parent")).toBe(true);
        expect(await adapter.tableExists("partition_exists_child")).toBe(true);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS partition_exists_child`);
        await adapter.exec(`DROP TABLE IF EXISTS partition_exists_parent`);
      }
    });
  });
});
