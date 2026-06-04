/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/ltree_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { Base } from "../../index.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import type { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";
import type { TableDefinition as PgTableDefinition } from "../../connection-adapters/postgresql/schema-definitions.js";

// Rails: class Ltree < ActiveRecord::Base
//   self.table_name = "ltrees"
class Ltree extends Base {
  static {
    this.tableName = "ltrees";
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    // Rails: @connection = ActiveRecord::Base.lease_connection
    connection = Base.connection as PostgreSQLAdapter;

    // Rails: enable_extension!("ltree", @connection)
    await connection.enableExtension("ltree");

    // Rails: @connection.create_table("ltrees") { |t| t.ltree "path" }
    await connection.createTable("ltrees", (t) => {
      (t as PgTableDefinition).ltree("path");
    });

    Ltree.resetColumnInformation();
    await Ltree.loadSchema();
  });

  afterEach(async () => {
    // Rails: @connection.drop_table "ltrees", if_exists: true
    await connection.dropTable("ltrees", { ifExists: true });
    Ltree.resetColumnInformation();
  });

  describe("PostgresqlLtreeTest", () => {
    it("column", async () => {
      // Rails: column = Ltree.columns_hash["path"]
      const column = Ltree.columnsHash()["path"] as unknown as PgColumn;
      // Rails: assert_equal :ltree, column.type
      expect(column.type).toBe("ltree");
      // Rails: assert_equal "ltree", column.sql_type
      expect(column.sqlType).toBe("ltree");
      // Rails: assert_not_predicate column, :array?
      expect(column.array).toBeFalsy();

      // Rails: type = Ltree.type_for_attribute("path")
      const type = Ltree.typeForAttribute("path");
      // Rails: assert_not_predicate type, :binary?
      expect(type.isBinary()).toBe(false);
    });

    it("write", async () => {
      // Rails: ltree = Ltree.new(path: "1.2.3.4")
      const ltree = Ltree.new({ path: "1.2.3.4" });
      // Rails: assert ltree.save!
      await ltree.saveBang();
    });

    it("select", async () => {
      // Rails: @connection.execute "insert into ltrees (path) VALUES ('1.2.3')"
      await connection.execute("insert into ltrees (path) VALUES ('1.2.3')");
      // Rails: ltree = Ltree.first
      const ltree = await Ltree.first();
      // Rails: assert_equal "1.2.3", ltree.path
      expect((ltree as any).path).toBe("1.2.3");
    });

    it("schema dump with shorthand", async () => {
      // Rails: output = dump_table_schema("ltrees")
      const output = await SchemaDumper.dumpTableSchema(connection, "ltrees");
      // Rails: assert_match %r[t\.ltree "path"], output
      expect(output).toMatch(/t\.ltree\("path"\)/);
    });
  });
});
