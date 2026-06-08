/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/collation_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import type { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";
import type { TableDefinition as PgTableDefinition } from "../../connection-adapters/postgresql/schema-definitions.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    // Rails: @connection.create_table :postgresql_collations, force: true { |t| ... }
    await adapter.createTable("postgresql_collations", { force: true }, (table) => {
      const t = table as PgTableDefinition;
      t.string("string_c", { collation: "C" });
      t.text("text_posix", { collation: "POSIX" });
    });
  });

  afterEach(async () => {
    // Rails: @connection.drop_table :postgresql_collations, if_exists: true
    await adapter.execute("DROP TABLE IF EXISTS postgresql_collations");
    await adapter.close();
  });

  describe("PostgresqlCollationTest", () => {
    it("string column with collation", async () => {
      // Rails: assert_equal :string, column.type; assert_equal "C", column.collation
      const cols = (await adapter.columns("postgresql_collations")) as PgColumn[];
      const col = cols.find((c) => c.name === "string_c")!;
      expect(col.type).toBe("string");
      expect(col.collation).toBe("C");
    });

    it("text column with collation", async () => {
      // Rails: assert_equal :text, column.type; assert_equal "POSIX", column.collation
      const cols = (await adapter.columns("postgresql_collations")) as PgColumn[];
      const col = cols.find((c) => c.name === "text_posix")!;
      expect(col.type).toBe("text");
      expect(col.collation).toBe("POSIX");
    });

    it("add column with collation", async () => {
      // Rails: @connection.add_column :postgresql_collations, :title, :string, collation: "C"
      await adapter.addColumn("postgresql_collations", "title", "string", { collation: "C" });
      const cols = (await adapter.columns("postgresql_collations")) as PgColumn[];
      const col = cols.find((c) => c.name === "title")!;
      expect(col.type).toBe("string");
      expect(col.collation).toBe("C");
    });

    it("change column with collation", async () => {
      // Rails: add_column :description, :string; change_column :description, :text, collation: "POSIX"
      await adapter.addColumn("postgresql_collations", "description", "string");
      await adapter.changeColumn("postgresql_collations", "description", "text", {
        collation: "POSIX",
      });
      const cols = (await adapter.columns("postgresql_collations")) as PgColumn[];
      const col = cols.find((c) => c.name === "description")!;
      expect(col.type).toBe("text");
      expect(col.collation).toBe("POSIX");
    });

    it("schema dump includes collation", async () => {
      // Rails: assert_match %r{t\.string\s+"string_c",\s+collation: "C"$}, output
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_collations");
      expect(output).toMatch(/t\.string\("string_c",\s*\{\s*collation:\s*"C"\s*\}\)/);
      expect(output).toMatch(/t\.text\("text_posix",\s*\{\s*collation:\s*"POSIX"\s*\}\)/);
    });
  });
});
