import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
  });
  afterEach(async () => {
    await adapter.dropTable("before_rename", "after_rename", { ifExists: true });
    await adapter.disconnectBang();
  });

  describe("PostgresqlRenameTableTest", () => {
    it("rename table with index", async () => {
      await adapter.createTable("before_rename", { force: true }, (t: any) => {
        t.text("name");
      });
      await adapter.addIndex("before_rename", "name");
      await adapter.renameTable("before_rename", "after_rename");
      const indexes = await adapter.indexes("after_rename");
      expect(indexes.some((i) => i.columns.includes("name"))).toBe(true);
    });

    it("rename table with sequence", async () => {
      await adapter.createTable("before_rename", { force: true }, (t: any) => {
        t.text("name");
      });
      await adapter.renameTable("before_rename", "after_rename");
      expect(await adapter.primaryKey("after_rename")).toBe("id");
      const id = await adapter.insert(`INSERT INTO after_rename (name) VALUES ('test')`);
      expect(id).toBeGreaterThan(0);
    });

    it("rename table preserves data", async () => {
      await adapter.createTable("before_rename", { force: true }, (t: any) => {
        t.text("name");
      });
      await adapter.execute(`INSERT INTO before_rename (name) VALUES ('alice')`);
      await adapter.execute(`INSERT INTO before_rename (name) VALUES ('bob')`);
      await adapter.renameTable("before_rename", "after_rename");
      const rows = await adapter.execute("SELECT name FROM after_rename ORDER BY name");
      expect(rows.map((r) => r.name)).toEqual(["alice", "bob"]);
    });
  });
});
