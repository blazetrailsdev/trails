import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.createTable("postgresql_collations", { force: true }, (t) => {
      t.string("string_c", { collation: "C" });
      t.text("text_posix", { collation: "POSIX" });
    });
  });

  afterEach(async () => {
    await adapter.dropTable("postgresql_collations", { ifExists: true });
    await adapter.close();
  });

  describe("PostgresqlCollationTest", () => {
    it("string column with collation", async () => {
      const cols = await adapter.columns("postgresql_collations");
      const col = cols.find((c) => c.name === "string_c")!;
      expect(col.type).toBe("string");
      expect(col.collation).toBe("C");
    });

    it("text column with collation", async () => {
      const cols = await adapter.columns("postgresql_collations");
      const col = cols.find((c) => c.name === "text_posix")!;
      expect(col.type).toBe("text");
      expect(col.collation).toBe("POSIX");
    });

    it("add column with collation", async () => {
      await adapter.addColumn("postgresql_collations", "title", "string", { collation: "C" });
      const cols = await adapter.columns("postgresql_collations");
      const col = cols.find((c) => c.name === "title")!;
      expect(col.type).toBe("string");
      expect(col.collation).toBe("C");
    });

    it("change column with collation", async () => {
      await adapter.addColumn("postgresql_collations", "description", "string");
      await adapter.changeColumn("postgresql_collations", "description", "text", {
        collation: "POSIX",
      });
      const cols = await adapter.columns("postgresql_collations");
      const col = cols.find((c) => c.name === "description")!;
      expect(col.type).toBe("text");
      expect(col.collation).toBe("POSIX");
    });

    it("schema dump includes collation", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_collations");
      expect(output).toMatch(/t\.string\("string_c",\s*\{\s*collation:\s*"C"\s*\}\)/);
      expect(output).toMatch(/t\.text\("text_posix",\s*\{\s*collation:\s*"POSIX"\s*\}\)/);
    });
  });
});
