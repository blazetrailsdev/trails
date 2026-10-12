import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
    await adapter.execute("DROP TABLE IF EXISTS before_rename CASCADE");
    await adapter.execute("DROP TABLE IF EXISTS after_rename CASCADE");
  });
  afterEach(async () => {
    await adapter.execute("DROP TABLE IF EXISTS before_rename CASCADE");
    await adapter.execute("DROP TABLE IF EXISTS after_rename CASCADE");
    await adapter.disconnectBang();
  });

  describe("PostgresqlRenameTableTest", () => {
    it("rename table with index", async () => {
      await adapter.execute("CREATE TABLE before_rename (id serial primary key, name text)");
      await adapter.execute("CREATE INDEX idx_before_name ON before_rename (name)");
      await adapter.renameTable("before_rename", "after_rename");
      const indexes = await adapter.indexes("after_rename");
      expect(indexes.some((i) => i.columns.includes("name"))).toBe(true);
    });

    it("rename table with sequence", async () => {
      await adapter.execute("CREATE TABLE before_rename (id serial primary key, name text)");
      await adapter.renameTable("before_rename", "after_rename");
      expect(await adapter.primaryKey("after_rename")).toBe("id");
      const id = await adapter.insert(`INSERT INTO after_rename (name) VALUES ('test')`);
      expect(id).toBeGreaterThan(0);
    });

    it("rename table preserves data", async () => {
      await adapter.execute("CREATE TABLE before_rename (id serial primary key, name text)");
      await adapter.execute(`INSERT INTO before_rename (name) VALUES ('alice')`);
      await adapter.execute(`INSERT INTO before_rename (name) VALUES ('bob')`);
      await adapter.renameTable("before_rename", "after_rename");
      const rows = await adapter.execute("SELECT name FROM after_rename ORDER BY name");
      expect(rows.map((r) => r.name)).toEqual(["alice", "bob"]);
    });
  });
});
