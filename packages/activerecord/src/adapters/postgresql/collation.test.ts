/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/collation_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";
import { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    // Rails: @connection.create_table :postgresql_collations, force: true { |t| ... }
    await connection.createTable("postgresql_collations", { force: true }, (t) => {
      (t as any).string("string_c", { collation: "C" });
      (t as any).text("text_posix", { collation: "POSIX" });
    });
  });

  afterEach(async () => {
    // Rails: @connection.drop_table :postgresql_collations, if_exists: true
    await connection.execute("DROP TABLE IF EXISTS postgresql_collations");
  });

  describe("PostgresqlCollationTest", () => {
    it("string column with collation", async () => {
      // Rails: assert_equal :string, column.type; assert_equal "C", column.collation
      const cols = (await connection.columns("postgresql_collations")) as unknown as PgColumn[];
      const col = cols.find((c) => c.name === "string_c")!;
      expect(col.type).toBe("string");
      expect(col.collation).toBe("C");
    });

    it("text column with collation", async () => {
      // Rails: assert_equal :text, column.type; assert_equal "POSIX", column.collation
      const cols = (await connection.columns("postgresql_collations")) as unknown as PgColumn[];
      const col = cols.find((c) => c.name === "text_posix")!;
      expect(col.type).toBe("text");
      expect(col.collation).toBe("POSIX");
    });

    it("add column with collation", async () => {
      // Rails: @connection.add_column :postgresql_collations, :title, :string, collation: "C"
      await connection.addColumn("postgresql_collations", "title", "string", { collation: "C" });
      const cols = (await connection.columns("postgresql_collations")) as unknown as PgColumn[];
      const col = cols.find((c) => c.name === "title")!;
      expect(col.type).toBe("string");
      expect(col.collation).toBe("C");
    });

    it("change column with collation", async () => {
      // Rails: add_column :description, :string; change_column :description, :text, collation: "POSIX"
      await connection.addColumn("postgresql_collations", "description", "string");
      await connection.changeColumn("postgresql_collations", "description", "text", {
        collation: "POSIX",
      });
      const cols = (await connection.columns("postgresql_collations")) as unknown as PgColumn[];
      const col = cols.find((c) => c.name === "description")!;
      expect(col.type).toBe("text");
      expect(col.collation).toBe("POSIX");
    });

    it("schema dump includes collation", async () => {
      // Rails: assert_match %r{t\.string\s+"string_c",\s+collation: "C"$}, output
      const output = await SchemaDumper.dumpTableSchema(connection, "postgresql_collations");
      expect(output).toMatch(/t\.string\("string_c",\s*\{[^}]*collation:\s*"C"/);
      expect(output).toMatch(/t\.text\("text_posix",\s*\{[^}]*collation:\s*"POSIX"/);
    });
  });
});
