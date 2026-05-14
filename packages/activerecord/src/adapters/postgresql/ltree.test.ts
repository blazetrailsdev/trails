/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/ltree_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS ltrees`);
    await adapter.exec(`CREATE EXTENSION IF NOT EXISTS ltree`);
    await adapter.exec(`CREATE TABLE ltrees (id serial primary key, path ltree)`);
    await adapter.loadAdditionalTypes();
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS ltrees`);
    await adapter.close();
  });

  describe("PostgresqlLtreeTest", () => {
    it("column", async () => {
      const cols = await adapter.columns("ltrees");
      const col = cols.find((c) => c.name === "path")!;
      expect(col).toBeDefined();
      expect(col.type).toBe("ltree");
      expect(col.sqlType).toBe("ltree");
      expect((col as any).isArray()).toBe(false);
      expect(col.type).not.toBe("binary");
    });

    it("default", async () => {
      const cols = await adapter.columns("ltrees");
      const col = cols.find((c) => c.name === "path")!;
      expect(col).toBeDefined();
      expect(col.default).toBeNull();
    });

    it("ltree query", async () => {
      await adapter.exec(`INSERT INTO ltrees (path) VALUES ('1.2.3')`);
      const rows = await adapter.execute(`SELECT path FROM ltrees`);
      expect(String(rows[0].path)).toBe("1.2.3");
    });

    it("ltree schema dump", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "ltrees");
      expect(output).toMatch(/t\.ltree\("path"\)/);
    });

    it("write", async () => {
      await adapter.exec(`INSERT INTO ltrees (path) VALUES ('1.2.3.4')`);
      const rows = await adapter.execute(`SELECT path FROM ltrees`);
      expect(String(rows[0].path)).toBe("1.2.3.4");
    });
  });
});
