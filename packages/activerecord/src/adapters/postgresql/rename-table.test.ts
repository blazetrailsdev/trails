/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/rename_table_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
    await adapter.exec("DROP TABLE IF EXISTS before_rename CASCADE");
    await adapter.exec("DROP TABLE IF EXISTS after_rename CASCADE");
  });
  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS before_rename CASCADE");
    await adapter.exec("DROP TABLE IF EXISTS after_rename CASCADE");
    await adapter.close();
  });

  describe("PostgresqlRenameTableTest", () => {
    it("rename table", async () => {
      await adapter.exec("CREATE TABLE before_rename (id serial primary key, name text)");
      await adapter.renameTable("before_rename", "after_rename");
      expect(await adapter.dataSourceExists("after_rename")).toBe(true);
      expect(await adapter.dataSourceExists("before_rename")).toBe(false);
    });

    it("rename table with index", async () => {
      await adapter.exec("CREATE TABLE before_rename (id serial primary key, name text)");
      await adapter.exec("CREATE INDEX idx_before_name ON before_rename (name)");
      await adapter.renameTable("before_rename", "after_rename");
      const indexes = await adapter.indexes("after_rename");
      expect(indexes.some((i) => i.columns.includes("name"))).toBe(true);
    });

    it("rename table with sequence", async () => {
      await adapter.exec("CREATE TABLE before_rename (id serial primary key, name text)");
      await adapter.renameTable("before_rename", "after_rename");
      expect(await adapter.primaryKey("after_rename")).toBe("id");
      const id = await adapter.executeMutation(`INSERT INTO after_rename (name) VALUES ('test')`);
      expect(id).toBeGreaterThan(0);
    });

    it("rename table preserves data", async () => {
      await adapter.exec("CREATE TABLE before_rename (id serial primary key, name text)");
      await adapter.executeMutation(`INSERT INTO before_rename (name) VALUES ('alice')`);
      await adapter.executeMutation(`INSERT INTO before_rename (name) VALUES ('bob')`);
      await adapter.renameTable("before_rename", "after_rename");
      const rows = await adapter.execute("SELECT name FROM after_rename ORDER BY name");
      expect(rows.map((r) => r.name)).toEqual(["alice", "bob"]);
    });

    it.skip("renaming a table with uuid primary key and uuid_generate_v4() default also renames the primary key index", async () => {});
    it.skip("renaming a table with uuid primary key and gen_random_uuid() default also renames the primary key index", async () => {});

    it.skip("renaming a table also renames the primary key sequence", () => {});
    it.skip("renaming a table also renames the primary key index", () => {});
  });
});
